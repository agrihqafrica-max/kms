import asyncio
import os
import uuid

import asyncpg
from dotenv import load_dotenv

load_dotenv('.env.local')


async def fetch_scalar(sql, parameters=None):
    from sqlalchemy import text
    from database import engine
    async with engine.connect() as connection:
        result = await connection.execute(text(sql), parameters or {})
        return result.scalar_one_or_none()


def test_tc03_rls_enabled_on_inventory():
    import asyncio
    async def check():
        from sqlalchemy import text
        from database import engine
        async with engine.connect() as c:
            r=await c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.branch_inventory'::regclass"))
            return r.scalar_one()
    assert asyncio.run(check()) is True


def test_tc03_select_policy_uses_membership():
    import asyncio
    async def check():
        from sqlalchemy import text
        from database import engine
        async with engine.connect() as c:
            r=await c.execute(text("""
                SELECT pg_get_expr(polqual, polrelid)
                FROM pg_policy
                WHERE polrelid='public.branch_inventory'::regclass
                  AND polname='branch_inventory_select'
            """))
            return r.scalar_one()
    expression=asyncio.run(check())
    assert 'is_org_member' in expression
    assert 'can_access_branch' in expression


async def isolation_check():
    connection=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    auth_a=uuid.uuid4()
    auth_b=uuid.uuid4()
    org_a=uuid.uuid4()
    org_b=uuid.uuid4()
    branch_a=uuid.uuid4()
    branch_b=uuid.uuid4()
    inventory_a=uuid.uuid4()
    inventory_b=uuid.uuid4()
    try:
        await connection.execute('BEGIN')
        await connection.execute("""
            INSERT INTO public.organizations(id,name,org_type,is_active)
            VALUES ($1,'TC03 Org A','WHOLESALER',true),($2,'TC03 Org B','RETAIL',true)
        """,org_a,org_b)
        await connection.execute("""
            INSERT INTO public.branches(id,organization_id,branch_name,county,is_main_hub)
            VALUES ($1,$2,'TC03 Branch A','Nairobi',true),($3,$4,'TC03 Branch B','Mombasa',true)
        """,branch_a,org_a,branch_b,org_b)
        await connection.execute("""
            INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
            VALUES ($1,'authenticated','authenticated','tc03-a@example.test',now(),now(),now()),
                   ($2,'authenticated','authenticated','tc03-b@example.test',now(),now(),now())
        """,auth_a,auth_b)
        await connection.execute("""
            INSERT INTO public.organization_memberships(id,organization_id,auth_user_id,branch_id,role,status)
            VALUES (gen_random_uuid(),$1,$2,$3,'owner','active'),
                   (gen_random_uuid(),$4,$5,$6,'owner','active')
        """,org_a,auth_a,branch_a,org_b,auth_b,branch_b)

        await connection.execute("""
            INSERT INTO public.branch_inventory
                (id,organization_id,branch_id,part_name,part_number,unit_cost,retail_price,stock_quantity,reorder_level)
            VALUES ($1,$2,$3,'TC03 Part A','A-01',100,160,10,2)
        """,inventory_a,org_a,branch_a)
        await connection.execute("""
            INSERT INTO public.branch_inventory
                (id,organization_id,branch_id,part_name,part_number,unit_cost,retail_price,stock_quantity,reorder_level)
            VALUES ($1,$2,$3,'TC03 Part B','B-01',200,260,12,2)
        """,inventory_b,org_b,branch_b)

        await connection.execute("SET LOCAL ROLE authenticated")
        await connection.execute("SELECT set_config('request.jwt.claim.sub',$1,true)",str(auth_a))
        org_a_visible=await connection.fetchval("SELECT count(*) FROM public.branch_inventory WHERE organization_id=$1",org_a)
        org_b_visible=await connection.fetchval("SELECT count(*) FROM public.branch_inventory WHERE organization_id=$1",org_b)

        await connection.execute("SELECT set_config('request.jwt.claim.sub',$1,true)",str(auth_b))
        org_b_as_b=await connection.fetchval("SELECT count(*) FROM public.branch_inventory WHERE organization_id=$1",org_b)
        org_a_as_b=await connection.fetchval("SELECT count(*) FROM public.branch_inventory WHERE organization_id=$1",org_a)

        return org_a_visible,org_b_visible,org_b_as_b,org_a_as_b
    finally:
        await connection.execute('ROLLBACK')
        await connection.close()


def test_tc03_cross_tenant_inventory_isolation():
    org_a_visible,org_b_visible,org_b_as_b,org_a_as_b=asyncio.run(isolation_check())
    assert org_a_visible == 1
    assert org_b_visible == 0
    assert org_b_as_b == 1
    assert org_a_as_b == 0


def test_tc03_tenant_context_helpers_exist():
    import asyncio
    async def check():
        c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
        try:
            return await c.fetchval("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_current_org_id','set_current_org_context')")
        finally:
            await c.close()
    assert asyncio.run(check()) == 2
