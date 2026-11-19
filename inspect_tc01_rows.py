import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as connection:
        for table in ("auth.users", "public.organizations", "public.organization_memberships"):
            result = await connection.execute(text(f"SELECT count(*) FROM {table}"))
            print(table, result.scalar())

asyncio.run(main())
