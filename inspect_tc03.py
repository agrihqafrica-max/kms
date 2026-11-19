import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        print('[branch_inventory RLS]')
        print(dict(await c.fetchrow("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public.branch_inventory'::regclass")))

        print('\n[branch_inventory policies]')
        rows=await c.fetch("""
            SELECT policyname, roles::text, cmd, coalesce(qual,'') AS qual, coalesce(with_check,'') AS with_check
            FROM pg_policies WHERE schemaname='public' AND tablename='branch_inventory'
            ORDER BY policyname
        """)
        for row in rows: print(dict(row))

        print('\n[organization_membership helper]')
        print(await c.fetchval("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_org_member'"))

        print('\n[current live rows]')
        print('organizations=',await c.fetchval('SELECT count(*) FROM public.organizations'))
        print('memberships=',await c.fetchval('SELECT count(*) FROM public.organization_memberships'))
        print('inventory=',await c.fetchval('SELECT count(*) FROM public.branch_inventory'))
    finally:
        await c.close()

asyncio.run(main())
