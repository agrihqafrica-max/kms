from decimal import Decimal, ROUND_HALF_UP
import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import require_org_permission
from models import BranchInventory
from schemas import POSCheckout
from tenant import (
    TenantContext,
    enforce_payload_scope,
    get_tenant_context,
    require_branch,
)

router = APIRouter(prefix="/pos", tags=["POS"])
VAT_RATE = Decimal("0.16")


def round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: POSCheckout,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "manage_sales", request, "pos_checkout")
    await enforce_payload_scope(context, request, "pos_checkout",
                                organization_id=payload.organization_id, branch_id=payload.branch_id)
    branch_id = require_branch(context)

    quantities: dict[str, int] = {}
    for cart in payload.cart:
        key = str(cart.item_id)
        quantities[key] = quantities.get(key, 0) + cart.quantity
    items = [{"inventory_id": inventory_id, "quantity": quantity}
             for inventory_id, quantity in quantities.items()]

    subtotal = Decimal("0.00")
    inventory_rows = await db.execute(
        select(BranchInventory.id, BranchInventory.part_name,
               BranchInventory.stock_quantity, BranchInventory.retail_price).where(
            BranchInventory.id.in_([cart.item_id for cart in payload.cart]),
            BranchInventory.organization_id == context.organization_id,
            BranchInventory.branch_id == branch_id,
        )
    )
    inventory_by_id = {str(row.id): row for row in inventory_rows.all()}

    for inventory_id, quantity in quantities.items():
        inventory = inventory_by_id.get(inventory_id)
        if inventory is None:
            raise HTTPException(status_code=404, detail=f"Inventory item not found: {inventory_id}")
        available = inventory.stock_quantity or 0
        if available < quantity:
            raise HTTPException(status_code=409, detail=f"Insufficient stock for {inventory.part_name}. Available: {available}")
        subtotal += round_money(inventory.retail_price * quantity)

    discounted_subtotal = max(subtotal - payload.discount_amount, Decimal("0.00"))
    vat_amount = round_money(discounted_subtotal * VAT_RATE)
    payments = [{
        "payment_method": payload.payment_method,
        "amount": str(round_money(discounted_subtotal + vat_amount)),
        "external_reference": payload.mpesa_receipt_number,
    }]

    result = await db.execute(text("""
        SELECT * FROM public.create_pos_sale(:organization_id, :branch_id,
            CAST(:items AS jsonb), CAST(:payments AS jsonb),
            CAST(:discount AS numeric), CAST(:vat AS numeric),
            :customer_phone, CAST(:customer_id AS uuid))
    """), {
        "organization_id": str(context.organization_id),
        "branch_id": str(branch_id),
        "items": json.dumps(items),
        "payments": json.dumps(payments),
        "discount": str(payload.discount_amount),
        "vat": str(vat_amount),
        "customer_phone": payload.customer_phone,
        "customer_id": str(payload.customer_id) if payload.customer_id else None,
    })
    row = result.mappings().one()
    return dict(row)