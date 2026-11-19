# 04 — Module and Feature Status

## Authentication and tenant context — AUTH-01 (implemented 2026-11-19)
Status: IMPLEMENTED and verified by signed-JWT API tests (see 05/11).
- JWT verification (JWKS ES256/RS256; HS256 only if explicitly configured), user-scoped transactions as `authenticated`, membership-based org/branch resolution with explicit header selection, server-side staff attribution, denial auditing, central sqlstate→HTTP mapping.
- `GET /auth/me` returns identity, memberships, and resolved context.
- Missing: frontend sign-in/registration flow and token refresh handling.

## Tenant onboarding — TC-01
Status: PASS for authenticated API registration transaction (2026-11-19); browser bootstrap untested.
- Existing: organization type/compliance columns, registration RPC, registration API route (now JWT-scoped), RLS.
- Verified: outsider registers org via API → org + owner membership + audit created; new owner can call /auth/me; invalid org_type rejected.
- Missing: frontend registration workflow.

## RBAC — TC-02
Status: PARTIAL/PASS evidence for policy/helper behavior plus signed-JWT role matrix.
- Existing: role helper, finance dashboard protection, cost-route guard, navigation audit RPC.
- Verified via API: cashier/manager/accountant/owner permission matrix on expenses, EOD approval (separation of duties), dashboard, inventory, POS discounts; denials audited.
- Missing: browser integration.

## RLS isolation — TC-03
Status: PASS in isolated transactional test.
- Existing: membership RLS and authenticated cross-tenant inventory isolation.
- Missing: broader table isolation tests and browser JWT propagation.

## Branch scoping — TC-04
Status: PASS in signed-JWT API tests (2026-11-19); see 05.
- Verified: branch-manager denied sibling branch (403 + audit), own branch allowed, org-wide owner access, cross-tenant emptiness, interleaved-request identity isolation, payload branch mismatch denied.

## POS
Status: PARTIALLY IMPLEMENTED.
- Backend: checkout calls `create_pos_sale` under user-scoped session; stock and payment workflow is RPC-driven; cashier resolved server-side; discounts restricted to owner/manager by RPC.
- Verified: signed-JWT cashier checkout (201, stock decrement, cashier attribution), cashier discount denial.
- Frontend: static demo products and empty cart; no live item fetch or checkout submit.
- Tests: no TC-12 onward or offline acceptance tests.

## Inventory
Status: PARTIAL.
- Backend: create/list/cost endpoints exist, JWT-scoped; list selects only columns granted to `authenticated` (unit_cost hidden); costs via `get_inventory_cost()` (view_finance-gated).
- Database: inventory movements and protected RPCs exist.
- Frontend: placeholder page only.
- Missing: live inventory list, UOM, receiving, returns, transfer, and TC-09–TC-11 workflow tests.

## Finance/EOD
Status: PARTIAL.
- Backend: expense, EOD, and dashboard routes enforce permissions and tenant scope; recorder/manager attributed server-side; EOD approval requires `approve`; duplicate EOD per branch/date → 409; dashboard via `get_dashboard_summary`.
- Database: eod and ledger objects/RPC functions exist.
- Missing: COGS completeness, OCR, payroll/statutory modules, TC-31–TC-38 verification.

## Parts Radar
Status: PARTIAL.
- Backend: request/quote routes JWT-scoped; statuses use DB defaults (`Open`/`Pending`); own-org quotes rejected; cross-org quoting verified.
- Database: live request/quote tables and policies/RPC support should be reviewed.
- Missing: 48-hour expiration, notification, reservation, acceptance and frontend integration.

## Dispatch
Status: NOT IMPLEMENTED for frontend/backend acceptance.
- Database tables exist for manifests/transfers.
- Missing: waybill, OTP/POD, status lifecycle, notifications and tests.

## WhatsApp
Status: NOT IMPLEMENTED.
- Tables exist.
- No verified webhook, AI intent parser, consent UI, or outbound delivery integration.

## Compliance, M-Pesa and tax
Status: NOT IMPLEMENTED/NOT TESTED.
- Compliance toggle fields exist on organizations.
- No M-Pesa webhook/STK implementation or eTIMS/VSCU workflow evidence.
