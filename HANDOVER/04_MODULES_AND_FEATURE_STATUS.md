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

---

## Phase 0, Phase 1 & Phase 2 Full Inventory Audit & Implementation (2026-11-19 Continuation)

Status: **146 P0/P1/P2 functions mapped (103 Complete, 43 Blocked); 133 P3–P8 functions Deferred**. Authoritative register: `docs/traceability/function-traceability.md` and `docs/release/PHASE_0_1_2_BACKLOG.md`.

### Implemented in Active Workspace
- **P0 Platform & Operations**:
  - Multi-company branding (**Kenya Motorcycle Spare Parts General** with companies `Kenya Motor`, `Kirinyaga Spares & Workshop`, `Rift Valley Boda Parts`), active/suspended tenant toggle, `TenantSettings` (`PLT-002`, `IDN-011`), branch manager (`PLT-003`), feature flags (`PLT-007`), staff RBAC onboarding (`IDN-007`, `IDN-010`), trusted device enrolment & remote wipe (`IDN-005`, `IDN-006`), API key lifecycle (`INT-013`), workspace backup export & ledger integrity verifier (`PLT-014`), PWA shell (`UX-001`), Express sliding-window rate limiter & security headers (`INT-014`, `SEC-010`), structured JSON access logs (`OPS-001`), `X-Request-Id` tracing (`OPS-003`), and `GET /api/observability/metrics` + `evaluateOpsAlertRules` (`OPS-002`, `OPS-004`, `OPS-008`, `RPT-014`).
- **P1 Counter POS, Finance, Reporting, Notifications & Support**:
  - Keyboard/barcode Enter-to-scan quick-add (`CAT-009`, `POS-001`, `UX-005`), price-version lock (`POS-003`), role-capped discount approval requests (`POS-004`, `IDN-009`), single & split-tender payment validation (`POS-006`, `CMP-010`, `FIN-011`), 80mm thermal print + consent-gated email receipt (`POS-007`), write-ahead offline outbox with conflict detection & manual resolution (`POS-008`, `OPS-005`, `UX-003`), separation-of-duties returns & reversing journal entries (`POS-009`, `FIN-012`), cash-drawer shift control & variance separation (`POS-019`, `POS-020`, `FIN-007`, `FIN-008`), consent/opt-out/template/delivery notification engine (`IDN-018`, `NTF-001`, `NTF-002`, `NTF-007..010`, `SEC-007`), Nairobi EAT date-range & payment-method report filters (`RPT-001..005`, `PLT-011`), support ticketing, FAQ, onboarding readiness checklist, and training sandbox mode (`ADM-002..005`).
- **P2 Inventory, Catalogue & Procurement**:
  - Pareto ABC inventory classification (`INV-017`), approval-gated stock adjustments (`INV-007`), pack breaking (`INV-020`), printable barcode shelf labels (`INV-021`), physical storage bins (`PLT-004`), bike-model registry & fitment matrix (`CAT-003`, `CAT-004`, `CAT-005`), purchase requisitions (`PRC-002`), supplier RFQs & ranked award (`PRC-003`), inbound container stage tracking (`PRC-011`), and supplier purchase returns (`PRC-013`).
- **Explicit Remaining Blockers**:
  - Plaintext offline `localStorage` encryption remains **Blocked** under `D-028` (`SEC-002`, `UX-002`, `POS-008`).
  - Dual-backend canonical DB choice & Postgres foundation ADR-001/003 remain **Blocked** under `D-032` (`PLT-001`, `FIN-002`).
  - Kiswahili native review remains **Blocked** under `D-027` (`UX-012`).
  - External SMTP/Resend live secrets (`TC-44`), WhatsApp Cloud API, SMS gateway, cloud storage buckets (0 provisioned), hardware barcode/thermal printers, and hosted CI/staging remain **Blocked**.

---

## Full 279-Function Code Audit, Navigation & Utility Wiring Reconciliation (2026-11-19 Continuation)

Status: **279 functions mapped across Phases P0–P8 (103 Complete, 41 Partial, 35 Blocked, 100 Deferred)** in `docs/traceability/function-traceability.md`.

### Verified Implementation Remediations
- **Grouped Sidebar Navigation, SVG Icons & URL `?tab=` Deep Linking (`Shell.jsx`, `App.css`, `en.js`, `sw.js`)**:
  - Expanded desktop sidebar into **4 operational groups (`navGroupOps`, `navGroupSupply`, `navGroupFinance`, `navGroupAdmin`) with 18 deep links** synchronized to `?tab=` search params across `Pos`, `Inventory`, `Finance`, and `Network`.
  - Added inline 16×16 stroke SVG `NavIcon` components (`aria-hidden="true"`) on both desktop sidebar links and `.mobile-nav` bottom links.
  - Preserved strict Cashier Finance RBAC gating (`requiresFinanceRole: true` keeps `/app/finance` nav links hidden from `cashier`).
- **Remediated Orphaned Utilities & Static Placeholders**:
  - `ADM-004` (`Complete`): Replaced static `ONBOARDING_CHECKLIST` in `Network.jsx` with dynamic `evaluateOnboardingChecklist(...)` readiness scoring and deep-links to `?tab=`.
  - `RPT-002` (`Complete`): Replaced hardcoded `WEEKLY_BARS` in `Overview.jsx` with real 7-day `Africa/Nairobi` EAT sales bucketing via `buildWeeklySalesTrend` (`reportingEngine.js`).
  - `PLT-010` (`Partial`): Wired `parseCustomerCsvImport` (`Pos.jsx`), `parseSupplierCsvImport` (`Inventory.jsx`), and Opening Balance GL Cutover Importer (`Network.jsx` -> `postOpeningCutoverJournal`, validated via `accountingEngine.js` & `firestore.rules` `'opening_cutover'` entryType). Postgres live migration rehearsal remains blocked (`D-032`).
  - `PLT-014` (`Partial`): Wired `runBackupRestoreDrill` (non-destructive dry-run) and WebCrypto AES-256-GCM `.kmsbak` export (`packageEncryptedBackup`) in `Network.jsx -> health`. Automated server `pg_dump` schedule & KMS key-wrapping remain pending.
  - `INT-001` (`Partial`): Wired live `GET /api/integrations/registry` endpoint in `server.js` and Server Integration Registry table in `Network.jsx -> health`.
  - `POS-007` (`Partial`) & `INV-021` (`Partial`): Wired binary ESC/POS `.bin` receipt download (`generateEscPosReceipt` in `Pos.jsx`) and thermal ZPL `.zpl` label download (`generateZplBarcodeLabel` in `Inventory.jsx`); physical thermal printer hardware testing remains pending.
  - `CAT-007` / `FIN-006` / `UX-006` (`Partial`): Wired compressed local `mediaVault.js` (`sku` photos in `Inventory.jsx`, `expense` receipt photos in `Finance.jsx`) explicitly labeled **Local Vault Only (Cloud Bucket Pending)**.
  - `PLT-005` (`Partial`): Wired `PLAN_ENTITLEMENTS` and tenant `planTier` selector/quotas in `Network.jsx -> governance`.
- **Honest P3–P8 `Partial` Reclassification (Previously Over-Grouped as `Deferred`)**:
  - Documented 33 active Phase P3–P8 modules with real code/UI/API across `Dispatch.jsx` (`IDN-015`, `FUL-001/003/004/006`, `FIN-009`, `POS-016`), `Radar.jsx` (`CAT-006/014`, `RAD-001/002/004/005/007/011`), `Assistant.jsx` (`AI-001/003/005/006/015`), `Finance.jsx`/`Pos.jsx`/`kmsDomain.js` (`POS-005/012/015`, `FIN-015/016/018`, `CMP-001/002/003/005`), `Inventory.jsx` (`RAD-009`), and `Network.jsx` (`PLT-005`, `AI-010`).
- **Explicit Retained Blockers (`35 Blocked`)**:
  - `D-032` dual-backend Postgres ADR-001/003 (`PLT-001`, `FIN-002`), `D-028` plaintext offline `localStorage` encryption (`SEC-002`, `UX-002`, `POS-008`), `D-027` Kiswahili native review (`UX-012`), `C-011` discount/cash-variance owner policy (`IDN-009`, `POS-004`, `POS-020`), unprovisioned cloud buckets (`CAT-008` + cloud sync for `CAT-007`/`FIN-006`/`UX-006`), external SMS/WhatsApp/SMTP secrets (`NTF-003..005`, `INT-004/007/008`, `IDN-001/002/004/010/019`), hosted CI/staging (`OPS-006`, `OPS-007`, `PLT-008`), and compliance/security re-review (`SEC-011`, `SEC-012`, `UX-011`).



