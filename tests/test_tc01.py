import asyncio
from pathlib import Path

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


def test_tc01_columns_exist():
    rows = run(fetch_rows("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='organizations'
          AND column_name IN ('org_type','kra_compliance_enabled','payroll_compliance_enabled')
    """))
    assert {row[0] for row in rows} == {
        'org_type', 'kra_compliance_enabled', 'payroll_compliance_enabled'
    }


def test_tc01_rls_enabled():
    rls = run(fetch_scalar("""
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid='public.organizations'::regclass
    """))
    assert rls is True


def test_tc01_registration_function_exists():
    exists = run(fetch_scalar("""
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='register_organization'
        )
    """))
    assert exists is True


def test_tc01_invalid_org_type_constraint():
    migration = Path('migrations/001_tc01_organization_registration.sql').read_text(encoding='utf-8')
    assert "(org_type IN ('IMPORTER','WHOLESALER','RETAIL','MECHANIC','CUSTOMER'))" in migration
    constraint = run(fetch_scalar("""
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conname='organizations_org_type_check'
          AND conrelid='public.organizations'::regclass
    """))
    assert constraint is not None
    assert 'WHOLESALER' in constraint


def test_tc01_default_values_exist():
    rows = run(fetch_rows("""
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='organizations'
          AND column_name IN ('org_type','kra_compliance_enabled','payroll_compliance_enabled')
    """))
    definitions = {row[0]: row[1] for row in rows}
    assert "RETAIL" in (definitions['org_type'] or '')
    assert 'false' in (definitions['kra_compliance_enabled'] or '')
    assert 'false' in (definitions['payroll_compliance_enabled'] or '')
