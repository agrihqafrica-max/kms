"""AUTH-01 authenticated organization registration (TC-01 real-flow evidence).

Runs inside the rolled-back harness: the registrant's JWT subject becomes
auth.uid(), register_organization creates the org + owner membership + audit.
"""
import asyncio

from auth01_utils import admin_rows, admin_scalar, api_harness, auth_headers


async def scenario():
    async with api_harness() as (client, ids, conn):
        response = await client.post("/organizations/register", headers=auth_headers(ids["outsider"]), json={
            "name": "AUTH01 Registered Org",
            "kra_pin": "P051234567Z",
            "org_type": "WHOLESALER",
            "kra_compliance_enabled": True,
            "payroll_compliance_enabled": True,
        })
        assert response.status_code == 201, response.text
        org_id = response.json()["organization_id"]

        org = await admin_rows(conn, """
            SELECT name, org_type, kra_compliance_enabled, payroll_compliance_enabled
            FROM public.organizations WHERE id = CAST(:id AS uuid)
        """, {"id": org_id})
        assert org == [("AUTH01 Registered Org", "WHOLESALER", True, True)]

        membership = await admin_scalar(conn, """
            SELECT count(*) FROM public.organization_memberships
            WHERE organization_id = CAST(:id AS uuid) AND auth_user_id = :user
              AND role = 'owner' AND status = 'active'
        """, {"id": org_id, "user": ids["outsider"]})
        assert membership == 1

        audit = await admin_scalar(conn, """
            SELECT count(*) FROM public.audit_logs
            WHERE organization_id = CAST(:id AS uuid) AND action_type = 'organization_registered'
        """, {"id": org_id})
        assert audit == 1

        # the new owner can immediately use the API with explicit selection
        headers = auth_headers(ids["outsider"])
        headers["X-Organization-Id"] = org_id
        response = await client.get("/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["context"]["role"] == "owner"

        # invalid org type is rejected by the schema before any write
        response = await client.post("/organizations/register", headers=auth_headers(ids["outsider"]), json={
            "name": "Bad Type Org", "org_type": "INVALID",
        })
        assert response.status_code == 422


def test_auth01_authenticated_registration_flow():
    asyncio.run(scenario())