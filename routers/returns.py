import json

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import require_org_permission
from schemas import ResolveSalesReturn, SalesReturnCreate
from tenant import TenantContext, get_tenant_context

router = APIRouter(prefix="/returns", tags=["Returns"])


@router.post("/sales", status_code=status.HTTP_201_CREATED)
async def create_sales_return(payload: SalesReturnCreate, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "sales_returns", request, "sales_returns")
    result = await db.execute(text("""
        SELECT * FROM public.create_sales_return(CAST(:order_id AS uuid), :reason, CAST(:items AS jsonb))
    """), {"order_id": str(payload.order_id), "reason": payload.reason, "items": json.dumps(payload.items)})
    return dict(result.mappings().one())


@router.post("/sales/{return_id}/resolve")
async def resolve_sales_return(return_id: str, payload: ResolveSalesReturn, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "sales_returns", request, "sales_return_resolution")
    result = await db.execute(text("""
        SELECT * FROM public.resolve_sales_return(CAST(:id AS uuid), :approve, :refund_method)
    """), {"id": return_id, "approve": payload.approve, "refund_method": payload.refund_method})
    return dict(result.mappings().one())
