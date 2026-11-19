"""TC-04 — Branch assignment & manager scoping.

Branch X manager queries Branch Y: access restricted strictly to Branch X;
Branch Y data is filtered/denied and the denial is audited.
All fixtures live in one rolled-back transaction.
"""
import asyncio

from auth01_utils import admin_rows, admin_scalar, api_harness, auth_headers


async def scenario():
    async with api_harness() as (client, ids, conn):
        manager = auth_headers(ids["manager_x"])

        # Branch Y inventory denied for the Branch X manager, with audit
        response = await client.get(f"/inventory/branches/{ids['branch_y']}",
                                    params={"organization_id": str(ids["org_a"])}, headers=manager)
        assert response.status_code == 403
        audits = await admin_rows(conn, """
            SELECT details->>'requested_resource', details->>'requested_action', details->>'denied'
            FROM public.audit_logs
            WHERE organization_id = :org AND action_type = 'navigation_violation'
        """, {"org": ids["org_a"]})
        assert ("branch_inventory", "GET", "true") in audits

        # Branch X inventory still fully accessible, and only Branch X data
        response = await client.get(f"/inventory/branches/{ids['branch_x']}", headers=manager)
        assert response.status_code == 200
        assert [item["part_number"] for item in response.json()] == ["AX-01"]

        # buying costs of Branch Y also denied
        response = await client.get(f"/inventory/branches/{ids['branch_y']}/costs", headers=manager)
        assert response.status_code == 403

        # sales for Branch Y denied at the payload boundary, with audit
        response = await client.post("/pos/checkout", headers=manager, json={
            "branch_id": str(ids["branch_y"]),
            "payment_method": "cash",
            "cart": [{"item_id": str(ids["part_y"]), "quantity": 1}],
        })
        assert response.status_code == 403
        audits = await admin_rows(conn, """
            SELECT details->>'requested_resource'
            FROM public.audit_logs
            WHERE organization_id = :org AND action_type = 'navigation_violation'
        """, {"org": ids["org_a"]})
        assert ("pos_checkout",) in audits

        # org-wide owner may read both branches
        owner = auth_headers(ids["owner_a"])
        response = await client.get(f"/inventory/branches/{ids['branch_y']}", headers=owner)
        assert response.status_code == 200
        assert [item["part_number"] for item in response.json()] == ["AY-01"]

        # another organization's member sees no Org A rows (RLS filtering)
        response = await client.get(f"/inventory/branches/{ids['branch_x']}",
                                    headers=auth_headers(ids["owner_b"]))
        assert response.status_code == 200
        assert response.json() == []

        # interleaved requests on one reused connection never leak identity
        for _ in range(3):
            response = await client.get(f"/inventory/branches/{ids['branch_x']}", headers=manager)
            assert [i["part_number"] for i in response.json()] == ["AX-01"]
            response = await client.get(f"/inventory/branches/{ids['branch_z']}",
                                        headers=auth_headers(ids["owner_b"]))
            assert [i["part_number"] for i in response.json()] == ["BZ-01"]

        # a real sale in Branch X succeeds and is attributed to the cashier staff row
        response = await client.post("/pos/checkout", headers=auth_headers(ids["cashier_x"]), json={
            "payment_method": "cash",
            "cart": [{"item_id": str(ids["part_x"]), "quantity": 2}],
        })
        assert response.status_code == 201, response.text
        stock = await admin_scalar(conn, "SELECT stock_quantity FROM public.branch_inventory WHERE id = :id",
                                   {"id": ids["part_x"]})
        assert stock == 8
        cashier = await admin_scalar(conn, """
            SELECT cashier_id FROM public.sales_orders
            WHERE organization_id = :org AND branch_id = :branch
        """, {"org": ids["org_a"], "branch": ids["branch_x"]})
        assert cashier == ids["staff_cashier_x"]

        # cashier cannot apply a discount (RPC role rule surfaces as clean 403)
        response = await client.post("/pos/checkout", headers=auth_headers(ids["cashier_x"]), json={
            "payment_method": "cash",
            "discount_amount": "5.00",
            "cart": [{"item_id": str(ids["part_x"]), "quantity": 1}],
        })
        assert response.status_code == 403


def test_tc04_branch_manager_scoping():
    asyncio.run(scenario())