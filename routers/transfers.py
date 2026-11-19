import json

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import require_org_permission
from schemas import BranchTransferCreate, DispatchBranchTransfer, ResolveBranchTransfer
from tenant import TenantContext, enforce_payload_scope, get_tenant_context, require_branch

router = APIRouter(prefix="/transfers", tags=["Transfers"])


@router.post("/branch", status_code=status.HTTP_201_CREATED)
async def create_branch_transfer(payload: BranchTransferCreate, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "inventory_transfer", request, "branch_transfers")
    await enforce_payload_scope(context, request, "branch_transfers", payload.organization_id, payload.source_branch_id)
    source_branch = require_branch(context)
    result = await db.execute(text("""
        SELECT * FROM public.create_branch_transfer(CAST(:organization_id AS uuid), CAST(:source_branch_id AS uuid),
            CAST(:destination_branch_id AS uuid), CAST(:items AS jsonb))
    """), {"organization_id": str(context.organization_id), "source_branch_id": str(source_branch),
           "destination_branch_id": str(payload.destination_branch_id), "items": json.dumps(payload.items)})
    return dict(result.mappings().one())


@router.post("/{transfer_id}/resolve")
async def resolve_branch_transfer(transfer_id: str, payload: ResolveBranchTransfer, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "inventory_transfer", request, "branch_transfer_resolution")
    result = await db.execute(text("SELECT * FROM public.resolve_branch_transfer(CAST(:id AS uuid), :approve)"),
                              {"id": transfer_id, "approve": payload.approve})
    return dict(result.mappings().one())


@router.post("/{transfer_id}/dispatch")
async def dispatch_branch_transfer(transfer_id: str, payload: DispatchBranchTransfer, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "dispatch", request, "branch_transfer_dispatch")
    result = await db.execute(text("""
        SELECT * FROM public.dispatch_branch_transfer(CAST(:id AS uuid), :rider_name, :rider_phone, :motorbike_number_plate)
    """), {"id": transfer_id, "rider_name": payload.rider_name, "rider_phone": payload.rider_phone,
           "motorbike_number_plate": payload.motorbike_number_plate})
    return dict(result.mappings().one())


@router.post("/{transfer_id}/receive")
async def receive_branch_transfer(transfer_id: str, request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context)):
    await require_org_permission(db, context.identity, context.organization_id, "dispatch", request, "branch_transfer_receive")
    result = await db.execute(text("SELECT * FROM public.receive_branch_transfer(CAST(:id AS uuid))"), {"id": transfer_id})
    return dict(result.mappings().one())
