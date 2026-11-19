import asyncio

from sqlalchemy import text

from database import engine


def run(coro):
    return asyncio.run(coro)


async def fetch_scalar(sql, parameters=None):
    async with engine.connect() as connection:
        result = await connection.execute(text(sql), parameters or {})
        return result.scalar_one_or_none()


async def fetch_rows(sql, parameters=None):
    async with engine.connect() as connection:
        result = await connection.execute(text(sql), parameters or {})
        return result.fetchall()


def test_tc02_permission_helper_exists():
    exists = run(fetch_scalar("""
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='has_org_permission'
        )
    """))
    assert exists is True


def test_tc02_role_permission_mapping():
    definition = run(fetch_scalar("""
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='has_org_permission'
    """))
    assert "m.role IN ('owner','manager','accountant')" in definition
    assert "m.role IN ('owner','manager','cashier')" in definition


def test_tc02_dashboard_is_finance_protected():
    definition = run(fetch_scalar("""
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='get_dashboard_summary'
    """))
    assert "has_org_permission(p_organization_id, 'view_finance'" in definition


def test_tc02_navigation_violation_audit_rpc_exists():
    exists = run(fetch_scalar("""
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='record_navigation_violation'
        )
    """))
    assert exists is True


def test_tc02_sensitive_data_policies_exist():
    rows = run(fetch_rows("""
        SELECT tablename, policyname, cmd
        FROM pg_policies
        WHERE schemaname='public'
          AND tablename IN ('branch_inventory','eod_reconciliations','daily_expenses','users','audit_logs')
    """))
    names = {(row[0], row[1], row[2]) for row in rows}
    assert any(table == 'eod_reconciliations' and cmd == 'SELECT' for table, _, cmd in names)
    assert any(table == 'branch_inventory' and cmd == 'SELECT' for table, _, cmd in names)
    assert any(table == 'audit_logs' and cmd == 'SELECT' for table, _, cmd in names)


def test_tc02_api_routes_exist():
    import main
    schema = main.app.openapi()
    assert '/finance/dashboard' in schema['paths']
    assert '/inventory/branches/{branch_id}/costs' in schema['paths']
