"""AUTH-01 membership resolution and tenant-selection matrix (rolled-back fixtures)."""
import asyncio
import uuid

from auth01_utils import admin_rows, admin_scalar, api_harness, auth_headers


async def scenario():
    async with api_harness() as (client, ids, conn):
        # single org-wide membership auto-selects
        response = await client.get("/auth/me", headers=auth_headers(ids["owner_a"]))
        assert response.status_code == 200
        body = response.json()
        assert body["user_id"] == str(ids["owner_a"])
        assert body["context"]["organization_id"] == str(ids["org_a"])
        assert body["context"]["org_wide"] is True
        assert body["context"]["staff_user_id"] == str(ids["staff_owner_a"])

        # branch-scoped membership defaults to its branch
        response = await client.get("/auth/me", headers=auth_headers(ids["manager_x"]))
        assert response.status_code == 200
        context = response.json()["context"]
        assert context["branch_id"] == str(ids["branch_x"])
        assert context["role"] == "manager"
        assert context["org_wide"] is False

        # multi-org user: /auth/me lists options without selecting
        response = await client.get("/auth/me", headers=auth_headers(ids["multi_user"]))
        assert response.status_code == 200
        body = response.json()
        assert body["context"] is None
        assert {m["organization_id"] for m in body["memberships"]} == {str(ids["org_a"]), str(ids["org_b"])}

        # multi-org data request without selection -> 409 with own options
        response = await client.get(f"/inventory/branches/{ids['branch_x']}",
                                    headers=auth_headers(ids["multi_user"]))
        assert response.status_code == 409
        detail = response.json()["detail"]
        assert detail["code"] == "organization_selection_required"
        assert {o["organization_id"] for o in detail["organizations"]} == {str(ids["org_a"]), str(ids["org_b"])}

        # explicit selection resolves
        headers = auth_headers(ids["multi_user"])
        headers["X-Organization-Id"] = str(ids["org_b"])
        response = await client.get(f"/inventory/branches/{ids['branch_z']}", headers=headers)
        assert response.status_code == 200
        assert [item["part_number"] for item in response.json()] == ["BZ-01"]

        # no membership -> 403 on data routes, empty /auth/me
        response = await client.get(f"/inventory/branches/{ids['branch_x']}",
                                    headers=auth_headers(ids["outsider"]))
        assert response.status_code == 403
        response = await client.get("/auth/me", headers=auth_headers(ids["outsider"]))
        assert response.status_code == 200
        assert response.json()["memberships"] == []

        # non-member organization header -> clean 403 (audit function refuses
        # non-members by design; the API must not turn that into a 500)
        headers = auth_headers(ids["owner_a"])
        headers["X-Organization-Id"] = str(ids["org_b"])
        response = await client.get(f"/inventory/branches/{ids['branch_z']}", headers=headers)
        assert response.status_code == 403
        assert response.json()["detail"] == "Not a member of this organization"

        # malformed header -> 400
        headers = auth_headers(ids["owner_a"])
        headers["X-Organization-Id"] = "not-a-uuid"
        response = await client.get(f"/inventory/branches/{ids['branch_x']}", headers=headers)
        assert response.status_code == 400

        # org-wide member naming another org's branch -> 404 (no existence leak)
        headers = auth_headers(ids["owner_a"])
        headers["X-Branch-Id"] = str(ids["branch_z"])
        response = await client.get("/auth/me", headers=headers)
        assert response.status_code == 404

        # payload organization mismatch -> 403 + audit in caller's own org
        response = await client.post("/inventory/items", headers=auth_headers(ids["manager_x"]), json={
            "organization_id": str(ids["org_b"]),
            "part_name": "Mismatch", "part_number": "MM-01",
            "unit_cost": "10.00", "retail_price": "20.00",
        })
        assert response.status_code == 403
        audits = await admin_rows(conn, """
            SELECT action_type, details->>'requested_resource' AS resource
            FROM public.audit_logs
            WHERE organization_id = :org AND action_type = 'navigation_violation'
        """, {"org": ids["org_a"]})
        assert any(row[1] == "inventory_items" for row in audits)

        # payload branch mismatch -> 403
        response = await client.post("/inventory/items", headers=auth_headers(ids["manager_x"]), json={
            "branch_id": str(ids["branch_y"]),
            "part_name": "Mismatch", "part_number": "MM-02",
            "unit_cost": "10.00", "retail_price": "20.00",
        })
        assert response.status_code == 403

        # org-wide writer without branch selection -> 400
        response = await client.post("/inventory/items", headers=auth_headers(ids["owner_a"]), json={
            "part_name": "No Branch", "part_number": "NB-01",
            "unit_cost": "10.00", "retail_price": "20.00",
        })
        assert response.status_code == 400

        # nothing persisted: every write above was rejected
        count = await admin_scalar(conn, """
            SELECT count(*) FROM public.branch_inventory WHERE part_number IN ('MM-01','MM-02','NB-01')
        """)
        assert count == 0


def test_auth01_tenant_selection_matrix():
    asyncio.run(scenario())