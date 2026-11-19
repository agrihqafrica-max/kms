import asyncio, os
from pathlib import Path
import asyncpg
from dotenv import load_dotenv

load_dotenv('.env.local')

async def main():
    sql=Path(r'E:\MotorCycle\kms-main\migrations\003_tc03_tenant_rls_helpers.sql').read_text(encoding='utf-8')
    c=await asyncpg.connect(os.environ['DATABASE_URL'],statement_cache_size=0)
    try:
        await c.execute(sql)
        print('TC-03 migration applied successfully')
    finally:
        await c.close()

asyncio.run(main())
