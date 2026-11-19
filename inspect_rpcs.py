import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as connection:
        result = await connection.execute(text("""
            SELECT p.proname, pg_get_function_identity_arguments(p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN (
                  'create_pos_sale','create_inventory_item','create_sales_return','resolve_sales_return',
                  'create_purchase_order','resolve_purchase_order','post_goods_receipt',
                  'create_branch_transfer','resolve_branch_transfer','dispatch_branch_transfer','receive_branch_transfer',
                  'calculate_eod','get_dashboard_summary','move_inventory'
              )
            ORDER BY p.proname
        """))
        for name, args in result:
            print(f"{name}({args})")

asyncio.run(main())
