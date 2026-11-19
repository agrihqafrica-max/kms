import json

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import require_org_permission
from schemas import GoodsReceiptCreate, PurchaseOrderCreate, ResolvePurchaseOrder
from tenant import TenantContext, enforce_payload_scope, get_tenant_context, require_branch

router = APIRouter(prefix="/procurement", tags=["Procurement"])


@router.post("/purchase-orders", status_code=status.HTTP_201_CREATED)
async def create_purchase_order(payload: PurchaseOrderCreate, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "procurement", request, "purchase_orders")
    await enforce_payload_scope(context, request, "purchase_orders", payload.organization_id, payload.branch_id)
    branch_id = require_branch(context)
    result = await db.execute(text("""
        SELECT * FROM public.create_purchase_order(
            CAST(:organization_id AS uuid), CAST(:branch_id AS uuid), CAST(:supplier_id AS uuid),
            :order_number, CAST(:items AS jsonb), :notes)
    """), {"organization_id": str(context.organization_id), "branch_id": str(branch_id),
           "supplier_id": str(payload.supplier_id), "order_number": payload.order_number,
           "items": json.dumps(payload.items), "notes": payload.notes})
    return dict(result.mappings().one())


@router.post("/purchase-orders/{purchase_order_id}/resolve")
async def resolve_purchase_order(purchase_order_id: str, payload: ResolvePurchaseOrder, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "procurement", request, "purchase_order_resolution")
    result = await db.execute(text("SELECT * FROM public.resolve_purchase_order(CAST(:id AS uuid), :approve)"),
                              {"id": purchase_order_id, "approve": payload.approve})
    return dict(result.mappings().one())


@router.post("/goods-receipts", status_code=status.HTTP_201_CREATED)
async def post_goods_receipt(payload: GoodsReceiptCreate, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "procurement", request, "goods_receipts")
    result = await db.execute(text("""
        SELECT * FROM public.post_goods_receipt(CAST(:purchase_order_id AS uuid), :receipt_reference, CAST(:items AS jsonb))
    """), {"purchase_order_id": str(payload.purchase_order_id), "receipt_reference": payload.receipt_reference,
           "items": json.dumps(payload.items)})
    return dict(result.mappings().one())
