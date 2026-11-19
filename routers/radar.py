from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import deny, require_org_permission
from models import Branch, PartsRadarQuote, PartsRadarRequest
from tenant import (
    TenantContext,
    can_access_branch,
    enforce_queried_organization,
    get_tenant_context,
)

router = APIRouter(prefix="/radar", tags=["Parts Radar"])


class RadarRequestCreate(BaseModel):
    organization_id: str | None = None
    requesting_branch_id: str | None = None
    part_description: str = Field(min_length=1)
    motorcycle_model: str | None = None
    urgency_status: str = "Normal"


class RadarQuoteCreate(BaseModel):
    request_id: str
    responding_organization_id: str | None = None
    quoted_price: float = Field(gt=0)
    available_quantity: int = Field(ge=0)
    delivery_lead_time_hours: int | None = Field(default=None, ge=0)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RadarRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "parts_radar", request, "parts_radar_requests")
    if payload.organization_id is not None and payload.organization_id != str(context.organization_id):
        await deny(context.identity, context.organization_id, request, "parts_radar_requests",
                   "Payload organization does not match the authenticated tenant")

    requesting_branch_id = context.branch_id
    if payload.requesting_branch_id is not None:
        try:
            requesting_branch_id = UUID(payload.requesting_branch_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="requesting_branch_id must be a UUID")
        if not await can_access_branch(db, context.organization_id, requesting_branch_id):
                await deny(context.identity, context.organization_id, request, "parts_radar_requests",
                       "Branch outside your membership scope")
        branch = await db.scalar(select(Branch).where(
            Branch.id == requesting_branch_id,
            Branch.organization_id == context.organization_id,
        ))
        if branch is None:
            raise HTTPException(status_code=404, detail="Requesting branch not found")

    # status is left to the database default ('Open') so RLS quote/visibility
    # policies, which match on 'Open', stay effective.
    radar_request = PartsRadarRequest(
        organization_id=context.organization_id,
        requesting_branch_id=requesting_branch_id,
        part_description=payload.part_description,
        motorcycle_model=payload.motorcycle_model,
        urgency_status=payload.urgency_status,
    )
    db.add(radar_request)
    await db.flush()
    await db.refresh(radar_request)
    return {"id": str(radar_request.id), "status": radar_request.status}


@router.get("/requests")
async def list_requests(
    request: Request,
    organization_id: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await enforce_queried_organization(context, request, "parts_radar_requests", organization_id)
    statement = select(PartsRadarRequest).where(
        PartsRadarRequest.organization_id == context.organization_id)
    if status_filter:
        statement = statement.where(PartsRadarRequest.status == status_filter)
    result = await db.execute(statement.order_by(PartsRadarRequest.created_at.desc()))
    requests = result.scalars().all()
    return [{"id": str(row.id), "part_description": row.part_description,
             "motorcycle_model": row.motorcycle_model, "urgency_status": row.urgency_status,
             "status": row.status, "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in requests]


@router.post("/quotes", status_code=status.HTTP_201_CREATED)
async def create_quote(
    payload: RadarQuoteCreate,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "parts_radar", request, "parts_radar_quotes")
    if payload.responding_organization_id is not None and \
            payload.responding_organization_id != str(context.organization_id):
        await deny(context.identity, context.organization_id, request, "parts_radar_quotes",
                   "Payload organization does not match the authenticated tenant")

    try:
        request_uuid = UUID(payload.request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="request_id must be a UUID")
    radar_request = await db.scalar(select(PartsRadarRequest).where(
        PartsRadarRequest.id == request_uuid))
    if radar_request is None:
        raise HTTPException(status_code=404, detail="Parts Radar request not found")
    if radar_request.organization_id == context.organization_id:
        raise HTTPException(status_code=400, detail="Cannot quote your own organization's request")

    # status left to the database default ('Pending').
    quote = PartsRadarQuote(
        request_id=radar_request.id,
        responding_organization_id=context.organization_id,
        quoted_price=payload.quoted_price,
        available_quantity=payload.available_quantity,
        delivery_lead_time_hours=payload.delivery_lead_time_hours,
    )
    db.add(quote)
    await db.flush()
    await db.refresh(quote)
    return {"id": str(quote.id), "status": quote.status}