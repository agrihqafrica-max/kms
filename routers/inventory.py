from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import deny, require_org_permission
from models import BranchInventory
from schemas import InventoryItemCreate
from tenant import (
    TenantContext,
    can_access_branch,
    enforce_payload_scope,
    enforce_queried_organization,
    get_tenant_context,
    require_branch,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post("/items", status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    payload: InventoryItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "manage_inventory", request, "inventory_items")
    await enforce_payload_scope(context, request, "inventory_items",
                                organization_id=payload.organization_id, branch_id=payload.branch_id)
    branch_id = require_branch(context)

    existing = await db.scalar(select(BranchInventory.id).where(
        BranchInventory.organization_id == context.organization_id,
        BranchInventory.branch_id == branch_id,
        BranchInventory.part_number == payload.part_number,
    ))
    if existing is not None:
        raise HTTPException(status_code=409, detail="This part number already exists in the branch")

    result = await db.execute(text("""
        SELECT * FROM public.create_inventory_item(
            CAST(:organization_id AS uuid), CAST(:branch_id AS uuid),
            :part_name, :part_number, CAST(:unit_cost AS numeric),
            CAST(:retail_price AS numeric), :category,
            CAST(:compatible_models AS text[]), :reorder_level
        )
    """), {
        "organization_id": str(context.organization_id),
        "branch_id": str(branch_id),
        "part_name": payload.part_name,
        "part_number": payload.part_number,
        "unit_cost": str(payload.unit_cost),
        "retail_price": str(payload.retail_price),
        "category": payload.category,
        "compatible_models": payload.compatible_models,
        "reorder_level": payload.reorder_level,
    })
    row = result.mappings().one()
    return dict(row)


async def _authorize_branch_read(request: Request, db: AsyncSession, context: TenantContext,
                                 branch_id: str, resource: str) -> UUID:
    try:
        path_branch = UUID(branch_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="branch_id must be a UUID")
    if not await can_access_branch(db, context.organization_id, path_branch):
        await deny(context.identity, context.organization_id, request, resource,
                   "Branch outside your membership scope")
    return path_branch


@router.get("/branches/{branch_id}")
async def list_branch_inventory(
    branch_id: str,
    request: Request,
    organization_id: str | None = Query(None),
    search: str | None = None,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await enforce_queried_organization(context, request, "branch_inventory", organization_id)
    path_branch = await _authorize_branch_read(request, db, context, branch_id, "branch_inventory")

    # unit_cost is not granted to `authenticated`; costs are exposed only
    # through the view_finance-gated get_inventory_cost RPC below.
    statement = select(
        BranchInventory.id, BranchInventory.part_name, BranchInventory.part_number,
        BranchInventory.category, BranchInventory.retail_price,
        BranchInventory.stock_quantity, BranchInventory.reorder_level,
    ).where(
        BranchInventory.organization_id == context.organization_id,
        BranchInventory.branch_id == path_branch,
    )
    if search:
        statement = statement.where(BranchInventory.part_name.ilike(f"%{search}%") |
                                    BranchInventory.part_number.ilike(f"%{search}%"))

    result = await db.execute(statement.order_by(BranchInventory.part_name))
    return [{"id": str(row.id), "part_name": row.part_name, "part_number": row.part_number,
             "category": row.category, "retail_price": str(row.retail_price),
             "stock_quantity": row.stock_quantity, "reorder_level": row.reorder_level}
            for row in result.all()]


@router.get("/branches/{branch_id}/costs")
async def list_buying_costs(
    request: Request,
    branch_id: str,
    organization_id: str | None = Query(None),
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "manage_finance", request, "inventory_buying_costs")
    await enforce_queried_organization(context, request, "inventory_buying_costs", organization_id)
    path_branch = await _authorize_branch_read(request, db, context, branch_id, "inventory_buying_costs")

    cost_result = await db.execute(text("""
        SELECT inventory_id, unit_cost FROM public.get_inventory_cost(
            CAST(:organization_id AS uuid), CAST(:branch_id AS uuid)
        )
    """), {"organization_id": str(context.organization_id), "branch_id": str(path_branch)})
    costs = {str(row.inventory_id): row.unit_cost for row in cost_result.all()}

    names = await db.execute(
        select(BranchInventory.id, BranchInventory.part_name, BranchInventory.part_number)
        .where(
            BranchInventory.organization_id == context.organization_id,
            BranchInventory.branch_id == path_branch,
        )
        .order_by(BranchInventory.part_name)
    )
    return [{
        "id": str(row.id),
        "part_name": row.part_name,
        "part_number": row.part_number,
        "unit_cost": str(costs[str(row.id)]),
    } for row in names.all() if str(row.id) in costs]