import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('.env.local')

async def main():
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        print('role=',await c.fetchval('SELECT current_user'))
        print('auth_uid=',await c.fetchval('SELECT auth.uid()'))
        print('jwt_sub=',await c.fetchval("SELECT current_setting('request.jwt.claim.sub',true)"))
    finally:
        await c.close()
asyncio.run(main())
