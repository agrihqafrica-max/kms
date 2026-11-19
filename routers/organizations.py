from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from schemas import OrganizationRegistration

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_organization(
    payload: OrganizationRegistration,
    db: AsyncSession = Depends(get_user_db, scope="function"),
):
    # register_organization is SECURITY DEFINER and reads auth.uid(), which the
    # scoped session binds to the verified JWT subject. The caller becomes owner.
    result = await db.execute(text("""
        SELECT public.register_organization(
            CAST(:name AS text), CAST(:kra_pin AS text), CAST(:org_type AS text),
            CAST(:subscription_tier AS text), CAST(:kra_enabled AS boolean),
            CAST(:payroll_enabled AS boolean)
        ) AS organization_id
    """), {
        "name": payload.name,
        "kra_pin": payload.kra_pin,
        "org_type": payload.org_type,
        "subscription_tier": payload.subscription_tier,
        "kra_enabled": payload.kra_compliance_enabled,
        "payroll_enabled": payload.payroll_compliance_enabled,
    })
    organization_id = result.scalar_one()
    return {
        "organization_id": str(organization_id),
        "name": payload.name,
        "org_type": payload.org_type,
        "kra_compliance_enabled": payload.kra_compliance_enabled,
        "payroll_compliance_enabled": payload.payroll_compliance_enabled,
    }