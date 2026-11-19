import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as connection:
        names = ["create_pos_sale", "create_inventory_item", "get_current_organization_id", "is_org_member", "get_dashboard_summary"]
        for name in names:
            result = await connection.execute(text("""
                SELECT pg_get_functiondef(p.oid)
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname=:name
                LIMIT 1
            """), {"name": name})
            definition = result.scalar_one_or_none()
            print(f"\n--- {name} ---\n{definition or 'NOT FOUND'}")

asyncio.run(main())
