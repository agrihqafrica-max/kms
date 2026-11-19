from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

import database

if TYPE_CHECKING:
    from auth import AuthIdentity

logger = logging.getLogger("kms.rbac")


class TenantDenial(HTTPException):
    """403 carrying audit metadata.

    Raised inside the request transaction; get_user_db catches it after the
    rollback and writes the audit in a fresh transaction so the denial record
    survives the failed request.
    """

    def __init__(self, organization_id, resource: str, action: str, detail: str = "Forbidden"):
        super().__init__(status_code=403, detail=detail)
        self.organization_id = organization_id
        self.resource = resource
        self.action = action


async def has_org_permission(db: AsyncSession, organization_id, permission: str) -> bool:
    result = await db.execute(
        text("SELECT public.has_org_permission(CAST(:organization_id AS uuid), CAST(:permission AS text))"),
        {"organization_id": str(organization_id), "permission": permission},
    )
    return bool(result.scalar_one_or_none())


async def record_denial(identity: AuthIdentity, organization_id, resource: str, action: str) -> None:
    """Audit a denial in its own transaction (called after request rollback).

    record_navigation_violation itself refuses non-members (42501); in that case
    the denial is logged server-side and the caller still returns a clean 403.
    """
    try:
        async with database.user_scoped_session(identity.user_id, identity.claims) as session:
            await session.execute(
                text("""
                    SELECT public.record_navigation_violation(
                        CAST(:organization_id AS uuid),
                        CAST(:resource AS text),
                        CAST(:action AS text)
                    )
                """),
                {"organization_id": str(organization_id), "resource": resource, "action": action},
            )
    except DBAPIError:
        logger.warning(
            "navigation violation audit refused org=%s resource=%s action=%s",
            organization_id, resource, action,
        )


async def deny(identity: AuthIdentity, organization_id, request: Request,
               resource: str, detail: str = "Forbidden") -> None:
    raise TenantDenial(organization_id, resource, request.method, detail)


async def require_org_permission(
    db: AsyncSession,
    identity: AuthIdentity,
    organization_id,
    permission: str,
    request: Request,
    resource: str,
) -> None:
    if await has_org_permission(db, organization_id, permission):
        return
    await deny(identity, organization_id, request, resource)