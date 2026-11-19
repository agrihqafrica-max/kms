# 03 — Database and Supabase

## Verified live state
- 32 public base tables
- 32 RLS-enabled public tables
- 73 public RLS policies
- 30 public functions
- 12 non-internal triggers
- 0 public views
- 0 storage buckets found
- All public application table row counts were 0 at read-only audit time

## Core original tables
organizations, branches, users, audit_logs, branch_inventory, inbound_containers, mechanics_directory, parts_radar_requests, parts_radar_quotes, sales_orders, sales_order_items, buyer_pickup_analytics, dispatch_manifests, daily_expenses, eod_reconciliations, monthly_payout_batches, payout_line_items, whatsapp_threads, whatsapp_messages.

## Live migration-added tables
organization_memberships, inventory_movements, customers, sales_payments, sales_returns, sales_return_items, suppliers, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items, branch_transfers, branch_transfer_items.

## Authentication and RBAC
- `organization_memberships` links `auth.users.id` to organizations and optional branches.
- Membership roles include owner and role values used by helper functions.
- `has_org_permission` controls finance, inventory, sales, staff, procurement, dispatch, mechanics, radar, and approval access.
- `can_access_branch` supports organization-wide and branch-limited memberships.
- `auth.uid()` is the current RLS identity source.

## AUTH-01 request identity propagation (implemented 2026-11-19)
- FastAPI verifies the Supabase access JWT (`auth.py`): JWKS ES256/RS256 from the project URL; HS256 only when `SUPABASE_JWT_SECRET` is explicitly set (tests). Issuer, audience `authenticated`, exp/iat/sub required; role claim must be `authenticated`.
- Every protected request runs in `database.user_scoped_session`: pre-checks `auth.users` (exists, not deleted, not banned), binds `request.jwt.claim.sub` and `request.jwt.claims` with transaction-local `set_config`, then `SET LOCAL ROLE authenticated`. The pooler login role bypasses RLS, so this role switch is what activates policies.
- Sessions use NullPool (one fresh connection per request); transaction-local settings and role can never leak across requests. Commit on success, rollback on any exception, connection always closed.
- Tenant resolution (`tenant.py`) reads only verified memberships: `X-Organization-Id`/`X-Branch-Id` headers select explicitly; a single membership auto-selects; multiple organizations without a header return 409 with the caller's options. Client-supplied org/branch IDs in paths/queries/bodies are validated against the resolved context (403 + `record_navigation_violation` audit on mismatch).
- Denial audits are written in a fresh transaction after the request transaction rolls back (`TenantDenial` caught in `get_user_db`), so they survive the failed request.
- Staff attribution (`cashier_id`, `manager_id`, `recorded_by_user_id`) is resolved server-side from `users.auth_user_id`; client-supplied staff IDs are ignored. No auto-provisioning of `public.users`.
- Column-level grants hide `branch_inventory.unit_cost` from `authenticated`; costs are exposed only via `get_inventory_cost()` (checks `view_finance` + branch access). Inventory/POS queries select only granted columns.
- `can_access_branch` returns TRUE for any branch UUID when membership is org-wide (no existence check); tenant resolution additionally verifies the branch exists within the organization (404 otherwise).

## Verified TC additions
- TC-01 adds `org_type`, `kra_compliance_enabled`, and `payroll_compliance_enabled` to organizations, plus `register_organization()`.
- TC-02 adds `record_navigation_violation()`.
- TC-03 adds `get_current_org_id()` and `set_current_org_context()` compatibility helpers.

## Relationships
Verified live foreign keys cover organization ownership, branch ownership, sales, inventory, finance, procurement, transfers, payments, returns, WhatsApp, and memberships. The read-only foreign-key scan also surfaced numerous composite and cross-table references that should be inspected by exact constraint definitions before ORM use.

## Local migration status
- `001_tc01_organization_registration.sql`: live-verified by TC-01.
- `002_tc02_rbac_navigation_audit.sql`: live-verified by TC-02.
- `003_tc03_tenant_rls_helpers.sql`: live-verified by TC-03.
- Earlier live migration changes have no complete repository migration set established locally.

## Not verified
- Storage policies and buckets: no buckets found.
- Edge Functions: no verified inventory/schema evidence.
- Realtime subscriptions: not verified.
- Supabase migration history: no local migration framework or live migration table audit was completed.
- Index coverage and trigger definitions require targeted review, though trigger and policy counts were collected.

## Protection rule
Do not run migrations or apply data changes. Qoder must inspect exact constraints and create a rollback plan before future database work.
