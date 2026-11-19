from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_user_db
from core_rbac import deny, require_org_permission
from models import DailyExpense, EODReconciliation, SalesOrder
from schemas import DailyExpenseCreate, EODCreate
from tenant import (
    TenantContext,
    can_access_branch,
    enforce_payload_scope,
    enforce_queried_organization,
    get_tenant_context,
    require_branch,
)

router = APIRouter(prefix="/finance", tags=["Finance"])


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
async def record_expense(
    payload: DailyExpenseCreate,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "manage_expenses", request, "daily_expenses")
    await enforce_payload_scope(context, request, "daily_expenses",
                                organization_id=payload.organization_id, branch_id=payload.branch_id)
    expense = DailyExpense(
        organization_id=context.organization_id,
        branch_id=require_branch(context),
        recorded_by_user_id=context.staff_user_id,
        category=payload.category,
        amount=payload.amount,
        description=payload.description,
        expense_date=payload.expense_date,
    )
    db.add(expense)
    await db.flush()
    return {"id": str(expense.id), "amount": str(expense.amount), "category": expense.category,
            "expense_date": str(expense.expense_date)}


@router.get("/expenses")
async def list_expenses(
    request: Request,
    organization_id: str | None = Query(None),
    branch_id: str | None = None,
    expense_date: str | None = None,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "view_finance", request, "daily_expenses")
    await enforce_queried_organization(context, request, "daily_expenses", organization_id)

    statement = select(DailyExpense).where(DailyExpense.organization_id == context.organization_id)
    if branch_id:
        try:
            queried_branch = UUID(branch_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="branch_id must be a UUID")
        if not await can_access_branch(db, context.organization_id, queried_branch):
            await deny(context.identity, context.organization_id, request, "daily_expenses",
                       "Branch outside your membership scope")
        statement = statement.where(DailyExpense.branch_id == queried_branch)
    elif context.branch_id is not None:
        statement = statement.where(DailyExpense.branch_id == context.branch_id)
    if expense_date:
        statement = statement.where(DailyExpense.expense_date == expense_date)
    result = await db.execute(statement.order_by(DailyExpense.expense_date.desc(), DailyExpense.created_at.desc()))
    rows = result.scalars().all()
    return [{"id": str(row.id), "branch_id": str(row.branch_id), "category": row.category,
             "amount": str(row.amount), "description": row.description,
             "expense_date": str(row.expense_date)} for row in rows]


@router.post("/eod", status_code=status.HTTP_201_CREATED)
async def create_eod(
    payload: EODCreate,
    request: Request,
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "manage_finance", request, "eod_reconciliation")
    await enforce_payload_scope(context, request, "eod_reconciliation",
                                organization_id=payload.organization_id, branch_id=payload.branch_id)
    branch_id = require_branch(context)
    if payload.is_approved:
        await require_org_permission(db, context.identity, context.organization_id,
                                     "approve", request, "eod_approval")

    gross = await db.scalar(select(func.coalesce(func.sum(SalesOrder.total_amount), 0)).where(
        SalesOrder.organization_id == context.organization_id,
        SalesOrder.branch_id == branch_id,
        func.date(SalesOrder.created_at) == payload.reconciliation_date,
    ))
    expenses = await db.scalar(select(func.coalesce(func.sum(DailyExpense.amount), 0)).where(
        DailyExpense.organization_id == context.organization_id,
        DailyExpense.branch_id == branch_id,
        DailyExpense.expense_date == payload.reconciliation_date,
    ))

    existing = await db.scalar(select(EODReconciliation).where(
        EODReconciliation.organization_id == context.organization_id,
        EODReconciliation.branch_id == branch_id,
        EODReconciliation.reconciliation_date == payload.reconciliation_date,
    ))
    if existing is not None:
        raise HTTPException(status_code=409, detail="EOD reconciliation already exists for this date")

    gross = payload.total_gross_sales if payload.total_gross_sales is not None else gross
    expense_total = payload.total_expenses if payload.total_expenses is not None else expenses
    cogs = payload.total_cogs or 0
    net_profit = gross - cogs - expense_total
    variance = payload.cash_counted - payload.cash_expected if payload.cash_counted is not None else 0

    record = EODReconciliation(
        organization_id=context.organization_id,
        branch_id=branch_id,
        manager_id=context.staff_user_id,
        reconciliation_date=payload.reconciliation_date,
        total_gross_sales=gross,
        total_cogs=cogs,
        total_expenses=expense_total,
        net_profit=net_profit,
        cash_expected=payload.cash_expected,
        cash_counted=payload.cash_counted,
        variance=variance,
        is_approved=payload.is_approved,
    )
    db.add(record)
    await db.flush()

    return {"id": str(record.id), "gross_sales": str(gross), "expenses": str(expense_total),
            "net_profit": str(net_profit), "variance": str(variance)}


@router.get("/dashboard")
async def finance_dashboard(
    request: Request,
    start_date: str = Query(...),
    end_date: str = Query(...),
    organization_id: str | None = Query(None),
    branch_id: str | None = Query(None),
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    await require_org_permission(db, context.identity, context.organization_id,
                                 "view_finance", request, "owner_profit_dashboard")
    await enforce_queried_organization(context, request, "owner_profit_dashboard", organization_id)
    if branch_id is not None:
        await enforce_payload_scope(context, request, "owner_profit_dashboard", branch_id=branch_id)
        resolved_branch = UUID(branch_id)
    else:
        resolved_branch = require_branch(context)

    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date and end_date must be ISO dates (YYYY-MM-DD)")

    result = await db.execute(text("""
        SELECT public.get_dashboard_summary(
            CAST(:organization_id AS uuid), CAST(:branch_id AS uuid),
            CAST(:start_date AS date), CAST(:end_date AS date)
        )
    """), {
        "organization_id": str(context.organization_id),
        "branch_id": str(resolved_branch),
        "start_date": start,
        "end_date": end,
    })
    return result.scalar_one()