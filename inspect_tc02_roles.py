import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        rows = await c.fetch("""
            SELECT p.proname, pg_get_functiondef(p.oid) AS definition
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public'
              AND p.proname IN ('has_org_permission','get_current_user_role','can_access_branch')
            ORDER BY p.proname
        """)
        for row in rows:
            print('\n---',row['proname'],'---')
            print(row['definition'])

        rows = await c.fetch("""
            SELECT rolname
            FROM pg_roles
            WHERE rolname IN ('anon','authenticated','service_role')
            ORDER BY rolname
        """)
        print('\nroles=', [row['rolname'] for row in rows])

        rows = await c.fetch("""
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public'
              AND p.proname='get_dashboard_summary'
        """)
        for row in rows:
            print('dashboard_signature=',dict(row))
    finally:
        await c.close()

asyncio.run(main())
