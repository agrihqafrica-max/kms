from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthIdentity, get_current_identity, get_user_db
from tenant import (
    ORGANIZATION_HEADER,
    load_memberships,
    resolve_tenant_context,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me")
async def me(
    request: Request,
    identity: AuthIdentity = Depends(get_current_identity),
    db: AsyncSession = Depends(get_user_db, scope="function"),
):
    memberships = await load_memberships(db, identity.user_id)
    response = {
        "user_id": str(identity.user_id),
        "email": identity.claims.get("email"),
        "memberships": [
            {"organization_id": str(m["organization_id"]),
             "organization_name": m["organization_name"],
             "branch_id": str(m["branch_id"]) if m["branch_id"] else None,
             "role": m["role"]}
            for m in memberships
        ],
        "context": None,
    }
    distinct_orgs = {m["organization_id"] for m in memberships}
    if request.headers.get(ORGANIZATION_HEADER) or len(distinct_orgs) == 1:
        try:
            context = await resolve_tenant_context(request, db, identity)
        except HTTPException as exc:
            if exc.status_code == 409:
                return response
            raise
        response["context"] = {
            "organization_id": str(context.organization_id),
            "organization_name": context.organization_name,
            "branch_id": str(context.branch_id) if context.branch_id else None,
            "role": context.role,
            "org_wide": context.org_wide,
            "staff_user_id": str(context.staff_user_id) if context.staff_user_id else None,
        }
    return response