"""AUTH-01 authorization matrix across finance and Parts Radar routes."""
import asyncio

from auth01_utils import admin_rows, admin_scalar, api_harness, auth_headers


async def scenario():
    async with api_harness() as (client, ids, conn):
        # cashier lacks manage_expenses -> 403 with audit
        response = await client.post("/finance/expenses", headers=auth_headers(ids["cashier_x"]), json={
            "category": "Denied", "amount": "10.00", "expense_date": "2026-11-19",
        })
        assert response.status_code == 403
        audits = await admin_rows(conn, """
            SELECT details->>'requested_resource' FROM public.audit_logs
            WHERE organization_id = :org AND action_type = 'navigation_violation'
        """, {"org": ids["org_a"]})
        assert ("daily_expenses",) in audits

        # accountant records an expense; attribution forced from membership
        headers = auth_headers(ids["accountant_a"])
        headers["X-Branch-Id"] = str(ids["branch_x"])
        response = await client.post("/finance/expenses", headers=headers, json={
            "category": "AUTH01 rent", "amount": "500.00", "expense_date": "2026-11-19",
            "recorded_by_user_id": str(ids["staff_owner_b"]),
        })
        assert response.status_code == 201, response.text
        recorded_by = await admin_scalar(conn, """
            SELECT recorded_by_user_id FROM public.daily_expenses WHERE category = 'AUTH01 rent'
        """)
        assert recorded_by == ids["staff_accountant_a"]

        # cashier cannot read expenses (view_finance)
        response = await client.get("/finance/expenses", headers=auth_headers(ids["cashier_x"]))
        assert response.status_code == 403

        # accountant may read, scoped to the selected branch
        response = await client.get("/finance/expenses", headers=headers)
        assert response.status_code == 200
        assert all(row["branch_id"] == str(ids["branch_x"]) for row in response.json())

        # EOD approval requires the approve permission (separation of duties)
        eod_payload = {"reconciliation_date": "2026-11-19", "cash_expected": "100.00", "is_approved": True}
        response = await client.post("/finance/eod", headers=headers, json=eod_payload)
        assert response.status_code == 403
        manager_headers = auth_headers(ids["manager_x"])
        response = await client.post("/finance/eod", headers=manager_headers, json=eod_payload)
        assert response.status_code == 201, response.text
        manager_id = await admin_scalar(conn, """
            SELECT manager_id FROM public.eod_reconciliations
            WHERE organization_id = :org AND reconciliation_date = '2026-11-19'
        """, {"org": ids["org_a"]})
        assert manager_id == ids["staff_manager_x"]

        # duplicate EOD for the same branch/date -> 409
        response = await client.post("/finance/eod", headers=manager_headers, json=eod_payload)
        assert response.status_code == 409

        # dashboard: cashier denied, manager allowed for own branch
        response = await client.get("/finance/dashboard",
                                    params={"start_date": "2026-11-01", "end_date": "2026-11-19"},
                                    headers=auth_headers(ids["cashier_x"]))
        assert response.status_code == 403
        response = await client.get("/finance/dashboard",
                                    params={"start_date": "2026-11-01", "end_date": "2026-11-19"},
                                    headers=manager_headers)
        assert response.status_code == 200
        assert "net_sales" in response.json()

        # Parts Radar: request uses DB default status 'Open' (policy-compatible)
        response = await client.post("/radar/requests", headers=manager_headers, json={
            "part_description": "AUTH01 brake pads", "motorcycle_model": "Boxer 150",
        })
        assert response.status_code == 201, response.text
        request_id = response.json()["id"]
        assert response.json()["status"] == "Open"

        # cashier lacks parts_radar permission
        response = await client.post("/radar/requests", headers=auth_headers(ids["cashier_x"]), json={
            "part_description": "Denied request",
        })
        assert response.status_code == 403

        # own-org quote rejected; cross-org quote allowed with default 'Pending'
        response = await client.post("/radar/quotes", headers=auth_headers(ids["owner_a"]), json={
            "request_id": request_id, "quoted_price": 900.0, "available_quantity": 4,
        })
        assert response.status_code == 400
        response = await client.post("/radar/quotes", headers=auth_headers(ids["owner_b"]), json={
            "request_id": request_id, "quoted_price": 900.0, "available_quantity": 4,
        })
        assert response.status_code == 201, response.text
        assert response.json()["status"] == "Pending"

        # quote listing stays inside the caller's organization
        response = await client.get("/radar/requests", headers=auth_headers(ids["owner_b"]))
        assert response.status_code == 200
        assert response.json() == []
        response = await client.get("/radar/requests", headers=manager_headers)
        assert [row["id"] for row in response.json()] == [request_id]


def test_auth01_finance_and_radar_authorization():
    asyncio.run(scenario())