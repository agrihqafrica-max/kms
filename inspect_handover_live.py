import asyncio
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv('.env.local')

async def main():
    c = await asyncpg.connect(os.environ['DATABASE_URL'], statement_cache_size=0)
    try:
        print('[PUBLIC TABLES]')
        for r in await c.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"):
            print(r['table_name'])

        print('\n[COLUMN COUNTS]')
        for r in await c.fetch("SELECT table_name, count(*) FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name"):
            print(f"{r['table_name']}={r['count']}")

        print('\n[ROW COUNTS]')
        tables = [r['table_name'] for r in await c.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")]
        for table in tables:
            print(f"{table}={await c.fetchval('SELECT count(*) FROM public.' + table)}")

        print('\n[FOREIGN KEYS]')
        for r in await c.fetch("""
            SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name,
                   ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
            WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
            ORDER BY tc.table_name,kcu.column_name
        """):
            print(dict(r))

        print('\n[RLS TABLES]')
        for r in await c.fetch("""
            SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
        """):
            print(dict(r))

        print('\n[RLS POLICIES]')
        for r in await c.fetch("""
            SELECT tablename, policyname, roles::text, cmd, coalesce(qual,'') AS qual,
                   coalesce(with_check,'') AS with_check
            FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname
        """):
            print(dict(r))

        print('\n[TRIGGERS]')
        for r in await c.fetch("""
            SELECT event_object_table AS table_name, trigger_name, action_statement
            FROM information_schema.triggers WHERE trigger_schema='public'
            ORDER BY event_object_table,trigger_name
        """):
            print(dict(r))

        print('\n[PUBLIC FUNCTIONS]')
        for r in await c.fetch("""
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
                   p.prosecdef AS security_definer
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' ORDER BY p.proname,arguments
        """):
            print(dict(r))

        print('\n[VIEWS]')
        for r in await c.fetch("SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name"):
            print(r['table_name'])

        print('\n[STORAGE BUCKETS]')
        try:
            for r in await c.fetch("SELECT id,name,public FROM storage.buckets ORDER BY name"):
                print(dict(r))
        except Exception as exc:
            print('UNAVAILABLE', type(exc).__name__)

        print('\n[EDGE FUNCTIONS SCHEMA CHECK]')
        try:
            print(await c.fetchval("SELECT to_regclass('public.edge_functions')::text"))
        except Exception as exc:
            print('UNAVAILABLE', type(exc).__name__)

    finally:
        await c.close()

asyncio.run(main())
