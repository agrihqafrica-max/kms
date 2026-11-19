"""Shared AUTH-01 test helpers.

Write tests run inside one outer transaction on a dedicated connection; app
sessions join it via savepoints (join_transaction_mode="create_savepoint"), so
every request commit/rollback is real but nothing persists after the test.
Read-only tests may use committed fixtures on non-audited tables
(organizations/branches/auth.users/memberships) and delete them afterwards.
"""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import os
import uuid

import httpx
import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import database
import main


def make_token(sub, *, expires_in=3600, issuer=None, audience="authenticated",
               role="authenticated", secret=None, algorithm="HS256", omit=(), extra=None):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(sub),
        "aud": audience,
        "iss": issuer or f"{os.environ['SUPABASE_URL']}/auth/v1",
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
        "email": f"user-{str(sub)[:8]}@example.test",
    }
    claims.update(extra or {})
    for key in omit:
        claims.pop(key, None)
    if secret is not None:
        key = secret
    elif algorithm == "none":
        key = None
    else:
        key = os.environ["SUPABASE_JWT_SECRET"]
    return jwt.encode(claims, key, algorithm=algorithm)


def auth_headers(sub, **kwargs):
    return {"Authorization": f"Bearer {make_token(sub, **kwargs)}"}


MEMBERSHIPS = [
    ("org_a", "owner_a", None, "owner"),
    ("org_a", "manager_x", "branch_x", "manager"),
    ("org_a", "cashier_x", "branch_x", "cashier"),
    ("org_a", "accountant_a", None, "accountant"),
    ("org_b", "owner_b", None, "owner"),
    ("org_a", "multi_user", None, "owner"),
    ("org_b", "multi_user", None, "owner"),
]

STAFF = [
    ("staff_owner_a", "org_a", None, "owner_a", "Owner A", "owner"),
    ("staff_manager_x", "org_a", "branch_x", "manager_x", "Manager X", "manager"),
    ("staff_cashier_x", "org_a", "branch_x", "cashier_x", "Cashier X", "cashier"),
    ("staff_accountant_a", "org_a", None, "accountant_a", "Accountant A", "accountant"),
    ("staff_owner_b", "org_b", None, "owner_b", "Owner B", "owner"),
]

AUTH_USERS = ["owner_a", "manager_x", "cashier_x", "accountant_a", "owner_b", "multi_user", "outsider"]


async def seed_world(conn):
    ids = {name: uuid.uuid4() for name in (
        "org_a", "org_b", "branch_x", "branch_y", "branch_z",
        *AUTH_USERS,
        "staff_owner_a", "staff_manager_x", "staff_cashier_x", "staff_accountant_a", "staff_owner_b",
        "part_x", "part_y", "part_z",
    )}
    # Unique per run so a stray committed fixture can never collide with seeds.
    suffix = uuid.uuid4().hex[:8]
    await conn.execute(text("""
        INSERT INTO public.organizations (id, name, org_type, is_active)
        VALUES (:org_a, 'AUTH01 Org A', 'RETAIL', true), (:org_b, 'AUTH01 Org B', 'WHOLESALER', true)
    """), ids)
    await conn.execute(text("""
        INSERT INTO public.branches (id, organization_id, branch_name, county, is_main_hub)
        VALUES (:branch_x, :org_a, 'AUTH01 Branch X', 'Nairobi', true),
               (:branch_y, :org_a, 'AUTH01 Branch Y', 'Nairobi', false),
               (:branch_z, :org_b, 'AUTH01 Branch Z', 'Mombasa', true)
    """), ids)
    for name in AUTH_USERS:
        await conn.execute(text("""
            INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
            VALUES (:id, 'authenticated', 'authenticated', :email, now(), now(), now())
        """), {"id": ids[name], "email": f"auth01-{name.replace('_', '-')}-{suffix}@example.test"})
    for org, user, branch, role in MEMBERSHIPS:
        await conn.execute(text("""
            INSERT INTO public.organization_memberships (id, organization_id, auth_user_id, branch_id, role, status)
            VALUES (:id, :org, :user, :branch, :role, 'active')
        """), {"id": uuid.uuid4(), "org": ids[org], "user": ids[user],
               "branch": ids[branch] if branch else None, "role": role})
    for staff_id, org, branch, auth_user, full_name, role in STAFF:
        await conn.execute(text("""
            INSERT INTO public.users (id, organization_id, branch_id, full_name, email, phone_number, role, auth_user_id, is_active)
            VALUES (:id, :org, :branch, :full_name, :email, '0700000000', :role, :auth_user, true)
        """), {"id": ids[staff_id], "org": ids[org], "branch": ids[branch] if branch else None,
               "full_name": full_name, "email": f"auth01-{staff_id.replace('_', '-')}-{suffix}@example.test",
               "role": role, "auth_user": ids[auth_user]})
    for part, org, branch, part_name, part_number in (
        ("part_x", "org_a", "branch_x", "AUTH01 Part X", "AX-01"),
        ("part_y", "org_a", "branch_y", "AUTH01 Part Y", "AY-01"),
        ("part_z", "org_b", "branch_z", "AUTH01 Part Z", "BZ-01"),
    ):
        await conn.execute(text("""
            INSERT INTO public.branch_inventory
                (id, organization_id, branch_id, part_name, part_number, unit_cost, retail_price, stock_quantity, reorder_level)
            VALUES (:id, :org, :branch, :part_name, :part_number, 100, 160, 10, 2)
        """), {"id": ids[part], "org": ids[org], "branch": ids[branch],
               "part_name": part_name, "part_number": part_number})
    return ids


@asynccontextmanager
async def api_harness(app=None):
    """Client + seeded world inside one rolled-back outer transaction."""
    async with database.engine.connect() as conn:
        # conn.begin() as a context manager COMMITS on clean exit; the outer
        # transaction must be rolled back explicitly so nothing persists.
        outer = await conn.begin()
        try:
            ids = await seed_world(conn)

            def factory():
                return AsyncSession(bind=conn, join_transaction_mode="create_savepoint",
                                    expire_on_commit=False)

            original = database.AsyncSessionLocal
            database.AsyncSessionLocal = factory
            try:
                transport = httpx.ASGITransport(app=app or main.app, raise_app_exceptions=False)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    yield client, ids, conn
            finally:
                database.AsyncSessionLocal = original
        finally:
            await outer.rollback()
            await conn.execute(text("RESET ROLE"))


async def admin_rows(conn, sql, params=None):
    """Read as the session user (RLS bypassed) regardless of leftover request role."""
    await conn.execute(text("RESET ROLE"))
    result = await conn.execute(text(sql), params or {})
    return result.fetchall()


async def admin_scalar(conn, sql, params=None):
    rows = await admin_rows(conn, sql, params)
    return rows[0][0] if rows else None


@asynccontextmanager
async def committed_identity_fixtures():
    """Committed org/user/membership fixtures for read-only concurrency tests.

    Only non-audited tables are written; everything is deleted afterwards.
    """
    ids = {name: uuid.uuid4() for name in ("org_a", "org_b", "user_a", "user_b")}
    suffix = uuid.uuid4().hex[:8]
    async with database.engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO public.organizations (id, name, org_type, is_active)
            VALUES (:org_a, 'AUTH01 Conc A', 'RETAIL', true), (:org_b, 'AUTH01 Conc B', 'RETAIL', true)
        """), ids)
        for user, org in (("user_a", "org_a"), ("user_b", "org_b")):
            await conn.execute(text("""
                INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
                VALUES (:id, 'authenticated', 'authenticated', :email, now(), now(), now())
            """), {"id": ids[user], "email": f"auth01-conc-{user}-{suffix}@example.test"})
            await conn.execute(text("""
                INSERT INTO public.organization_memberships (id, organization_id, auth_user_id, branch_id, role, status)
                VALUES (:id, :org, :user, NULL, 'owner', 'active')
            """), {"id": uuid.uuid4(), "org": ids[org], "user": ids[user]})
    try:
        yield ids
    finally:
        async with database.engine.begin() as conn:
            await conn.execute(text("DELETE FROM public.organizations WHERE id IN (:org_a, :org_b)"), ids)
            await conn.execute(text("DELETE FROM auth.users WHERE id IN (:user_a, :user_b)"), ids)