import asyncio
from pathlib import Path
from sqlalchemy import text
from database import engine

async def main():
    sql = Path(r"E:\MotorCycle\kms-main\migrations\001_tc01_organization_registration.sql").read_text(encoding="utf-8")
    async with engine.begin() as connection:
        await connection.execute(text(sql))
    print("TC-01 migration applied successfully")

asyncio.run(main())
