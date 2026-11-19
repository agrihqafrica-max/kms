import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        checks={
            'table_count': "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
            'rls_count': "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity",
            'policy_count': "SELECT count(*) FROM pg_policies WHERE schemaname='public'",
            'function_count': "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'",
            'trigger_count': "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal",
            'view_count': "SELECT count(*) FROM information_schema.views WHERE table_schema='public'",
            'storage_bucket_count': "SELECT count(*) FROM storage.buckets",
        }
        for name,sql in checks.items():
            print(name+'='+str(await c.fetchval(sql)))
    finally:
        await c.close()
asyncio.run(main())
