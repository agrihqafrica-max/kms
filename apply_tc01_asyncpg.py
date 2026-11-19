import asyncio
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(".env.local")

async def main():
    sql = Path(r"E:\MotorCycle\kms-main\migrations\001_tc01_organization_registration.sql").read_text(encoding="utf-8")
    connection = await asyncpg.connect(os.environ["DATABASE_URL"], statement_cache_size=0)
    try:
        await connection.execute(sql)
        print("TC-01 migration applied successfully")
    finally:
        await connection.close()

asyncio.run(main())
