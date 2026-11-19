import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        rows=await c.fetch("""
            SELECT conname, pg_get_constraintdef(p.oid)
            FROM pg_constraint p
            WHERE p.conrelid='public.organization_memberships'::regclass
              AND p.contype='f'
            ORDER BY conname
        """)
        for r in rows: print(dict(r))
    finally:
        await c.close()
asyncio.run(main())
