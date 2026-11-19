import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        rows=await c.fetch("""
          SELECT tablename, policyname, cmd, coalesce(qual,'') AS qual, coalesce(with_check,'') AS with_check
          FROM pg_policies WHERE schemaname='public'
          AND tablename IN ('branch_inventory','eod_reconciliations','daily_expenses','audit_logs','users')
          ORDER BY tablename,policyname
        """)
        for r in rows: print(dict(r))

        print('audit_mutate_privileges')
        rows=await c.fetch("""
          SELECT grantee, table_name, privilege_type
          FROM information_schema.table_privileges
          WHERE table_schema='public' AND table_name='audit_logs'
          AND grantee IN ('anon','authenticated') ORDER BY grantee,privilege_type
        """)
        for r in rows: print(dict(r))

        print('dashboard_execution_roles')
        rows=await c.fetch("""
          SELECT grantee, privilege_type
          FROM information_schema.routine_privileges
          WHERE specific_schema='public' AND routine_name='get_dashboard_summary'
          AND grantee IN ('anon','authenticated') ORDER BY grantee
        """)
        for r in rows: print(dict(r))
    finally: await c.close()
asyncio.run(main())
