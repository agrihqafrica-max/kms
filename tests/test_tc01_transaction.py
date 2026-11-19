import asyncio
import os
import uuid

import asyncpg
from dotenv import load_dotenv

load_dotenv('.env.local')


async def registration_transaction():
    connection = await asyncpg.connect(os.environ['DATABASE_URL'], statement_cache_size=0)
    auth_user_id = uuid.uuid4()
    try:
        await connection.execute("BEGIN")
        # organization_memberships.auth_user_id has an FK to auth.users, so the
        # throwaway identity must exist. Everything is rolled back below.
        await connection.execute("""
            INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
            VALUES ($1, 'authenticated', 'authenticated', 'tc01-transaction@example.test', now(), now(), now())
        """, auth_user_id)
        await connection.execute(
            "SELECT set_config('request.jwt.claim.sub', $1, true)",
            str(auth_user_id),
        )
        org_id = await connection.fetchval("""
            SELECT public.register_organization(
                $1, $2, $3, $4, $5, $6
            )
        """, "TC01 Test Wholesaler", "P051234567Z", "WHOLESALER",
            "standard", True, True)

        org = await connection.fetchrow("""
            SELECT id, name, kra_pin, org_type,
                   kra_compliance_enabled, payroll_compliance_enabled
            FROM public.organizations
            WHERE id=$1
        """, org_id)
        membership_count = await connection.fetchval("""
            SELECT count(*) FROM public.organization_memberships
            WHERE organization_id=$1
              AND auth_user_id=$2
              AND role='owner'
              AND status='active'
        """, org_id, auth_user_id)
        audit_count = await connection.fetchval("""
            SELECT count(*) FROM public.audit_logs
            WHERE organization_id=$1
              AND action_type='organization_registered'
        """, org_id)
        return org, membership_count, audit_count
    finally:
        await connection.execute("ROLLBACK")
        await connection.close()


def test_tc01_real_registration_transaction():
    org, membership_count, audit_count = asyncio.run(registration_transaction())
    assert org['name'] == 'TC01 Test Wholesaler'
    assert org['kra_pin'] == 'P051234567Z'
    assert org['org_type'] == 'WHOLESALER'
    assert org['kra_compliance_enabled'] is True
    assert org['payroll_compliance_enabled'] is True
    assert membership_count == 1
    assert audit_count == 1
