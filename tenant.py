"""Organization/branch resolution from verified membership, never from client trust.

Selection rules (AUTH-01):
- X-Organization-Id / X-Branch-Id headers express explicit selection.
- A single active membership is auto-selected; multiple organizations without
  a header return 409 with the caller's own options.
- Client-supplied organization/branch IDs in paths, queries or bodies are
  validated against the resolved context and rejected with 403 on mismatch.
"""
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthIdentity, get_current_identity, get_user_db
from core_rbac import deny
from models import Branch, User

ORGANIZATION_HEADER = "X-Organization-Id"
BRANCH_HEADER = "X-Branch-Id"


@dataclass(frozen=True)
class TenantContext:
    identity: AuthIdentity
    organization_id: UUID
    organization_name: str
    branch_id: UUID | None
    role: str
    org_wide: bool
    staff_user_id: UUID | None


def _header_uuid(request: Request, name: str) -> UUID | None:
    raw = request.headers.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        return UUID(raw.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} must be a UUID")


async def load_memberships(db: AsyncSession, user_id: UUID) -> list[dict]:
    result = await db.execute(
        text("""
            SELECT m.organization_id, m.branch_id, m.role, o.name AS organization_name
            FROM public.organization_memberships m
            JOIN public.organizations o ON o.id = m.organization_id
            WHERE m.auth_user_id = CAST(:user_id AS uuid)
              AND m.status = 'active' AND o.is_active
            ORDER BY o.name
        """),
        {"user_id": str(user_id)},
    )
    return [dict(row) for row in result.mappings()]


async def can_access_branch(db: AsyncSession, organization_id: UUID, branch_id: UUID) -> bool:
    result = await db.execute(
        text("SELECT public.can_access_branch(CAST(:organization_id AS uuid), CAST(:branch_id AS uuid))"),
        {"organization_id": str(organization_id), "branch_id": str(branch_id)},
    )
    return bool(result.scalar_one_or_none())


async def resolve_tenant_context(request: Request, db: AsyncSession, identity: AuthIdentity) -> TenantContext:
    memberships = await load_memberships(db, identity.user_id)
    if not memberships:
        raise HTTPException(status_code=403, detail="No active organization membership")

    organization_header = _header_uuid(request, ORGANIZATION_HEADER)
    branch_header = _header_uuid(request, BRANCH_HEADER)

    if organization_header is not None:
        membership = next((m for m in memberships if m["organization_id"] == organization_header), None)
        if membership is None:
            await deny(identity, organization_header, request, "tenant_context",
                       "Not a member of this organization")
    else:
        distinct_orgs = {m["organization_id"] for m in memberships}
        if len(distinct_orgs) > 1:
            raise HTTPException(status_code=409, detail={
                "code": "organization_selection_required",
                "message": "Multiple organization memberships; send X-Organization-Id to select one",
                "organizations": [
                    {"organization_id": str(m["organization_id"]),
                     "name": m["organization_name"], "role": m["role"]}
                    for m in memberships
                ],
            })
        membership = memberships[0]

    organization_id = membership["organization_id"]
    org_wide = membership["branch_id"] is None
    branch_id = branch_header if branch_header is not None else membership["branch_id"]

    if branch_id is not None:
        if not await can_access_branch(db, organization_id, branch_id):
            await deny(identity, organization_id, request, "branch_context",
                       "Branch outside your membership scope")
        branch = await db.scalar(select(Branch).where(
            Branch.id == branch_id, Branch.organization_id == organization_id))
        if branch is None:
            raise HTTPException(status_code=404, detail="Branch not found in this organization")

    staff_user_id = await db.scalar(select(User.id).where(
        User.auth_user_id == identity.user_id,
        User.organization_id == organization_id,
        User.is_active.is_(True),
    ))

    return TenantContext(
        identity=identity,
        organization_id=organization_id,
        organization_name=membership["organization_name"],
        branch_id=branch_id,
        role=membership["role"],
        org_wide=org_wide,
        staff_user_id=staff_user_id,
    )


async def get_tenant_context(
    request: Request,
    identity: AuthIdentity = Depends(get_current_identity),
    db: AsyncSession = Depends(get_user_db, scope="function"),
) -> TenantContext:
    return await resolve_tenant_context(request, db, identity)


def require_branch(context: TenantContext) -> UUID:
    if context.branch_id is None:
        raise HTTPException(status_code=400,
                            detail=f"{BRANCH_HEADER} header is required for this operation")
    return context.branch_id


async def enforce_payload_scope(
    context: TenantContext,
    request: Request,
    resource: str,
    organization_id=None,
    branch_id=None,
) -> None:
    """Reject client-supplied tenant IDs that disagree with the verified context."""
    if organization_id is not None and UUID(str(organization_id)) != context.organization_id:
        await deny(context.identity, context.organization_id, request, resource,
                   "Payload organization does not match the authenticated tenant")
    if branch_id is not None and UUID(str(branch_id)) != require_branch(context):
        await deny(context.identity, context.organization_id, request, resource,
                   "Payload branch does not match the authenticated branch")


async def enforce_queried_organization(context: TenantContext, request: Request,
                                       resource: str, organization_id: str | None) -> None:
    if organization_id is not None:
        try:
            queried = UUID(organization_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="organization_id must be a UUID")
        if queried != context.organization_id:
            await deny(context.identity, context.organization_id, request, resource,
                       "Query organization does not match the authenticated tenant")