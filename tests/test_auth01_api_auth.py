"""AUTH-01 API authentication matrix: missing/invalid/expired/malformed tokens.

401 paths never reach tenant data; the valid-token-unknown-user case only reads
auth.users, so this file performs no writes against the live database.
"""
import asyncio
import uuid

import httpx

import main
from auth01_utils import auth_headers, make_token

PROTECTED = [
    ("GET", "/auth/me"),
    ("GET", f"/inventory/branches/{uuid.uuid4()}"),
    ("GET", f"/inventory/branches/{uuid.uuid4()}/costs"),
    ("GET", "/finance/expenses"),
    ("GET", "/finance/dashboard?start_date=2026-01-01&end_date=2026-01-31"),
    ("POST", "/pos/checkout"),
    ("POST", "/organizations/register"),
]


async def check_matrix():
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        for method, path in PROTECTED:
            response = await client.request(method, path)
            assert response.status_code == 401, (method, path, response.status_code)
            assert response.headers.get("www-authenticate") == "Bearer"

            response = await client.request(method, path, headers={"Authorization": "Bearer not-a-jwt"})
            assert response.status_code == 401, (method, path, "malformed")

            response = await client.request(method, path, headers=auth_headers(uuid.uuid4(), expires_in=-3600))
            assert response.status_code == 401, (method, path, "expired")

            response = await client.request(method, path, headers=auth_headers(uuid.uuid4(), secret="wrong-secret-0123456789abcdef0123456789"))
            assert response.status_code == 401, (method, path, "bad signature")

            response = await client.request(method, path, headers={"Authorization": "Basic abc123"})
            assert response.status_code == 401, (method, path, "wrong scheme")


def test_auth01_missing_invalid_expired_malformed_tokens():
    asyncio.run(check_matrix())


async def check_unknown_user():
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/auth/me", headers=auth_headers(uuid.uuid4()))
        assert response.status_code == 401
        assert response.json()["detail"] == "User no longer exists"


def test_auth01_valid_token_unknown_user_rejected():
    asyncio.run(check_unknown_user())


def test_auth01_openapi_declares_bearer_security():
    schema = main.app.openapi()
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    operation = schema["paths"]["/auth/me"]["get"]
    assert operation.get("security") == [{"HTTPBearer": []}]


def test_auth01_sessions_use_function_scope():
    from auth import get_user_db

    def all_routes():
        for route in main.app.routes:
            if hasattr(route, "dependant"):
                yield route
            original = getattr(route, "original_router", None)
            if original is not None:
                yield from original.routes

    checked = 0
    for route in all_routes():
        dependant = getattr(route, "dependant", None)
        if dependant is None:
            continue
        stack = [dependant]
        while stack:
            current = stack.pop()
            for sub in current.dependencies:
                if sub.call is get_user_db:
                    assert sub.scope == "function", route.path
                    checked += 1
                stack.append(sub)
    assert checked > 0