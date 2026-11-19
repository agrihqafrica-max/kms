import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as connection:
        result = await connection.execute(text("""
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """))
        current = None
        for table, column, data_type, nullable in result:
            if table != current:
                print(f"\n[{table}]")
                current = table
            print(f"{column}: {data_type} ({'nullable' if nullable == 'YES' else 'required'})")

asyncio.run(main())
