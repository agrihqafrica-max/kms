import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as connection:
        print("[organizations columns]")
        result = await connection.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name='organizations'
            ORDER BY ordinal_position
        """))
        for row in result:
            print(row)

        print("\n[organizations policies]")
        result = await connection.execute(text("""
            SELECT policyname, roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname='public' AND tablename='organizations'
            ORDER BY policyname
        """))
        for row in result:
            print(row)

        print("\n[organizations RLS]")
        result = await connection.execute(text("""
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE oid='public.organizations'::regclass
        """))
        print(result.one())

        print("\n[existing organization functions]")
        result = await connection.execute(text("""
            SELECT p.proname, pg_get_function_identity_arguments(p.oid)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname LIKE '%organization%' 
            ORDER BY p.proname
        """))
        for row in result:
            print(row)

asyncio.run(main())
