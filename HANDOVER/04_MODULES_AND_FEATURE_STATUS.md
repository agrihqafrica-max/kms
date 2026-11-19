# 04 — Module and Feature Status

## Current continuation — 2026-11-19 (supersedes frontend snapshot below)
- Slice 1 auth/API bootstrap is IMPLEMENTED, REVIEW PENDING: sign-in/sign-up/reset/recovery, guarded routes, tenant selection, bounded refresh and provider-scoped authentication/sign-out coordination.
- Overview, POS inventory search and Radar are API-connected read-only views; fixture browser verification is not live acceptance. Checkout is disabled. Organisation onboarding and Inventory/Finance/Dispatch workflow pages remain unavailable.
- Latest evidence: 21 tests, clean lint/build, 18 fixture browser groups; independent security re-review unavailable (provider 403). TC-41–TC-46 remain PARTIAL and Phase 0 remains open; see 05.
- The old ledger-exists statement below is superseded by C-014/D-020: no ledger was found in the recorded live audit. Foundation ADR-001/003 remain BLOCKED (D-032); no migration was applied.

## Historical backend/module snapshot
The entries below preserve the inherited audit, not current frontend completion claims. Current frontend status is above; database facts require renewed live verification before changes.

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

---

## Phase 2 — Inventory, Catalogue, Procurement & SaaS Visual Overhaul (2026-11-19)

Status: **IMPLEMENTED & VERIFIED** on the active Firebase/Firestore workspace (`docs/specs/SLICE-02-phase2-inventory-procurement/SPEC.md`, `docs/architecture/adr/ADR-004-phase2-inventory-procurement.md`); Supabase/Postgres backend modules remain historical.

### Implemented & Verified Capabilities
- **Parts Master & Availability (`Inventory.jsx`, `firestoreStore.jsx`, `kmsDomain.js`)**:
  - Added full Parts Master attributes (`brand`, `barcode`, `qualityGrade`, `uom`, `packSize`, `binLocation`, `reservedQuantity`, `oemCrossRefs`, `fitmentConfidence`) and net available stock (`computeAvailableStock`).
  - Added valuation CSV export (`buildInventoryValuationCsv`), inline reservation adjustments, velocity filtering (`fast`, `normal`, `slow`, `dead`), and Google Search OEM cross-reference lookup.
- **Automated Reorder & Dead-Stock Capital Recovery**:
  - `buildReorderRecommendations` flags below-threshold SKUs, ranks by priority (`Critical` / `Reorder`), detects open PO coverage, and supports 1-click draft PO creation plus dead-stock branch transfer / markdown logging.
- **Purchase Orders, Partial/Full GRN & Supplier Registry**:
  - Extended `PurchaseOrder` status (`PartiallyReceived`), freight/customs/handling landed cost settlement (`computeGrnSettlement`), partial/damaged lot receiving, atomic stock credit + `stockMovements` (`receipt`, `damage`) persistence, and Supplier Reliability Scorecard (`evaluateSupplierScore`).
- **Cycle Counts & Immutable Movement Ledger**:
  - Added `/users/{userId}/stockCounts/{countId}` variance submission and manager approval workflow (`resolveStockCount`) using atomic `writeBatch` updates to SKU quantity, `count_variance` ledger rows, and audit log entries.
- **Enterprise SaaS Visual & Layout Overhaul (`index.css`, `App.css`, `Shell.jsx`, `SelectionPages.jsx`)**:
  - Replaced Vite starter `56px` heading scale and stacked headers with compact single-row SaaS workspace header (`66px` topbar, `18px` `h1`), `Plus Jakarta Sans` + `DM Sans` + `JetBrains Mono` typography, single-elevation flat borders, squared `4px` semantic tags, and responsive `390px` mobile layout (`0px` horizontal overflow).

