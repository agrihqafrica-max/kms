import asyncio
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv('.env.local')

async def main():
    connection = await asyncpg.connect(os.environ['DATABASE_URL'], statement_cache_size=0)
    try:
        print('[has_org_permission]')
        row = await connection.fetchrow("""
            SELECT pg_get_functiondef(p.oid) AS definition
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='has_org_permission'
        """)
        print(row['definition'] if row else 'NOT FOUND')

        print('\n[policies on finance/inventory/users]')
        rows = await connection.fetch("""
            SELECT schemaname, tablename, policyname, roles::text, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname='public'
              AND tablename IN ('branch_inventory','eod_reconciliations','daily_expenses','audit_logs','users')
            ORDER BY tablename, policyname
        """)
        for row in rows:
            print(dict(row))

        print('\n[column privileges]')
        rows = await connection.fetch("""
            SELECT table_name, column_name, grantee, privilege_type
            FROM information_schema.column_privileges
            WHERE table_schema='public'
              AND table_name IN ('branch_inventory','users')
              AND grantee IN ('anon','authenticated')
            ORDER BY table_name,column_name,grantee
        """)
        for row in rows:
            print(dict(row))

        print('\n[dashboard and related RPCs]')
        rows = await connection.fetch("""
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public'
              AND p.proname IN ('get_dashboard_summary','get_current_user_role','has_org_permission','can_access_branch')
            ORDER BY p.proname
        """)
        for row in rows:
            print(dict(row))
    finally:
        await connection.close()

asyncio.run(main())
