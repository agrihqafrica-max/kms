"""Supabase access-token verification and user-scoped session dependency.

Verification uses the project JWKS (ES256/RS256). HS256 is accepted only when
SUPABASE_JWT_SECRET is explicitly configured (legacy projects / local tests);
it is never enabled implicitly.
"""
from collections.abc import AsyncGenerator
from dataclasses import dataclass
import os
from urllib.parse import urlparse
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

import database

bearer_scheme = HTTPBearer(auto_error=False, description="Supabase access token (JWT)")

_settings: dict | None = None
_jwks_client: PyJWKClient | None = None


def _project_url() -> str:
    configured = os.getenv("SUPABASE_URL")
    if configured:
        return configured.rstrip("/")
    username = urlparse(database.DATABASE_URL).username or ""
    project_ref = username.split(".", 1)[1] if "." in username else ""
    if not project_ref:
        raise RuntimeError("Set SUPABASE_URL or use a Supabase pooler DATABASE_URL to derive it")
    return f"https://{project_ref}.supabase.co"


def get_settings() -> dict:
    global _settings
    if _settings is None:
        project_url = _project_url()
        _settings = {
            "issuer": f"{project_url}/auth/v1",
            "jwks_url": f"{project_url}/auth/v1/.well-known/jwks.json",
            "hs256_secret": os.getenv("SUPABASE_JWT_SECRET"),
        }
    return _settings


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(get_settings()["jwks_url"], cache_keys=True, lifespan=300)
    return _jwks_client


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


@dataclass(frozen=True)
class AuthIdentity:
    user_id: UUID
    claims: dict


def verify_access_token(token: str) -> AuthIdentity:
    settings = get_settings()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _unauthorized("Malformed token")

    algorithm = header.get("alg")
    if algorithm == "HS256":
        if not settings["hs256_secret"]:
            raise _unauthorized("Token algorithm not accepted")
        key = settings["hs256_secret"]
    elif algorithm in ("ES256", "RS256"):
        try:
            key = _get_jwks_client().get_signing_key_from_jwt(token).key
        except jwt.PyJWTError:
            raise _unauthorized("Unknown token signing key")
    else:
        raise _unauthorized("Token algorithm not accepted")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=settings["issuer"],
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            leeway=30,
        )
    except jwt.PyJWTError:
        raise _unauthorized("Invalid or expired token")

    if claims.get("role") != "authenticated":
        raise _unauthorized("Token role not accepted")
    try:
        user_id = UUID(str(claims["sub"]))
    except (ValueError, TypeError):
        raise _unauthorized("Token subject is not a valid user id")
    return AuthIdentity(user_id=user_id, claims=claims)


async def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthIdentity:
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Not authenticated")
    return await run_in_threadpool(verify_access_token, credentials.credentials)


async def get_user_db(
    identity: AuthIdentity = Depends(get_current_identity),
) -> AsyncGenerator[AsyncSession, None]:
    """Yield a session whose transaction runs as `authenticated` for this user.

    Declare with Depends(get_user_db, scope="function") so the commit/rollback
    completes before the response is sent. Denials are audited in a fresh
    transaction after the request transaction rolls back.
    """
    from core_rbac import TenantDenial, record_denial

    try:
        async with database.user_scoped_session(identity.user_id, identity.claims) as session:
            yield session
    except TenantDenial as denial:
        await record_denial(identity, denial.organization_id, denial.resource, denial.action)
        raise HTTPException(status_code=403, detail=denial.detail)