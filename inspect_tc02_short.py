import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        print('helper=', await c.fetchval("SELECT to_regprocedure('public.has_org_permission(uuid,text)')::text"))
        print('dashboard=', await c.fetchval("SELECT to_regprocedure('public.get_dashboard_summary(uuid,uuid,date,date)')::text"))
        print('rbac=', await c.fetchval("SELECT to_regprocedure('public.get_current_user_role(uuid)')::text"))
        print('policies=', await c.fetchval("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs'"))
        print('inventory_policies=', await c.fetchval("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='branch_inventory'"))
        print('user_policies=', await c.fetchval("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='users'"))
        print('cost_column=', await c.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='branch_inventory' AND column_name='unit_cost'"))
        print('pin_column=', await c.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='pin_code_hash'"))
    finally:
        await c.close()
asyncio.run(main())
