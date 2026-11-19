"""AUTH-01 session lifecycle: identity binding, rollback, cleanup, concurrency."""
import asyncio
import uuid

import httpx
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import main
from auth import get_user_db
from auth01_utils import (
    admin_scalar,
    api_harness,
    auth_headers,
    committed_identity_fixtures,
)
from models import DailyExpense
from tenant import TenantContext, get_tenant_context, require_branch

probe_app = FastAPI()


@probe_app.get("/probe/identity")
async def probe_identity(db: AsyncSession = Depends(get_user_db, scope="function")):
    return {
        "current_user": await db.scalar(text("SELECT current_user")),
        "auth_uid": str(await db.scalar(text("SELECT auth.uid()"))),
    }


@probe_app.post("/probe/write-then-fail")
async def probe_write_then_fail(
    db: AsyncSession = Depends(get_user_db, scope="function"),
    context: TenantContext = Depends(get_tenant_context),
):
    db.add(DailyExpense(
        organization_id=context.organization_id,
        branch_id=require_branch(context),
        recorded_by_user_id=context.staff_user_id,
        category="AUTH01 rollback probe",
        amount=1,
        expense_date="2026-11-19",
    ))
    await db.flush()
    raise RuntimeError("forced failure after write")


@probe_app.get("/probe/slow")
async def probe_slow(db: AsyncSession = Depends(get_user_db, scope="function")):
    await db.execute(text("SELECT pg_sleep(5)"))
    return {"ok": True}


async def binding_and_rollback_scenario():
    async with api_harness(app=probe_app) as (client, ids, conn):
        response = await client.get("/probe/identity", headers=auth_headers(ids["manager_x"]))
        assert response.status_code == 200
        assert response.json() == {"current_user": "authenticated", "auth_uid": str(ids["manager_x"])}

        response = await client.get("/probe/identity", headers=auth_headers(ids["owner_b"]))
        assert response.json()["auth_uid"] == str(ids["owner_b"])

        # forced failure after a flushed write rolls the request back
        headers = auth_headers(ids["accountant_a"])
        headers["X-Branch-Id"] = str(ids["branch_x"])
        response = await client.post("/probe/write-then-fail", headers=headers)
        assert response.status_code == 500
        count = await admin_scalar(conn, """
            SELECT count(*) FROM public.daily_expenses WHERE category = 'AUTH01 rollback probe'
        """)
        assert count == 0

        # connection remains usable after the failed request
        response = await client.get("/probe/identity", headers=auth_headers(ids["manager_x"]))
        assert response.json()["auth_uid"] == str(ids["manager_x"])


def test_auth01_identity_binding_and_rollback():
    asyncio.run(binding_and_rollback_scenario())


async def commit_scenario():
    async with api_harness() as (client, ids, conn):
        headers = auth_headers(ids["accountant_a"])
        headers["X-Branch-Id"] = str(ids["branch_x"])
        response = await client.post("/finance/expenses", headers=headers, json={
            "category": "AUTH01 commit probe", "amount": "150.00", "expense_date": "2026-11-19",
        })
        assert response.status_code == 201, response.text
        row = (await admin_scalar(conn, """
            SELECT recorded_by_user_id FROM public.daily_expenses WHERE category = 'AUTH01 commit probe'
        """))
        assert row == ids["staff_accountant_a"]


def test_auth01_successful_request_commits_with_server_attribution():
    asyncio.run(commit_scenario())


async def concurrency_scenario():
    # Committed read-only fixtures + real NullPool sessions: genuinely parallel
    # requests on separate connections must each keep their own identity.
    async with committed_identity_fixtures() as ids:
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            async def fetch(user_key, org_key):
                response = await client.get("/auth/me", headers=auth_headers(ids[user_key]))
                assert response.status_code == 200
                body = response.json()
                assert body["user_id"] == str(ids[user_key])
                assert body["context"]["organization_id"] == str(ids[org_key])
                return body["user_id"]

            tasks = []
            for _ in range(6):
                tasks.append(fetch("user_a", "org_a"))
                tasks.append(fetch("user_b", "org_b"))
            results = await asyncio.gather(*tasks)
            assert results[0::2] == [str(ids["user_a"])] * 6
            assert results[1::2] == [str(ids["user_b"])] * 6


def test_auth01_concurrent_requests_do_not_leak_identity():
    asyncio.run(concurrency_scenario())


async def cancellation_scenario():
    async with committed_identity_fixtures() as ids:
        transport = httpx.ASGITransport(app=probe_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            task = asyncio.create_task(client.get("/probe/slow", headers=auth_headers(ids["user_a"])))
            await asyncio.sleep(0.5)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            # pool and session state remain clean after cancellation
            response = await client.get("/probe/identity", headers=auth_headers(ids["user_b"]))
            assert response.status_code == 200
            assert response.json()["auth_uid"] == str(ids["user_b"])


def test_auth01_cancelled_request_cleans_up():
    asyncio.run(cancellation_scenario())