# 06 — Contradictions and Decision Register

## C-001: TC-03 tenant context method
- Conflict: Master Test Suite mentions `app.current_org_id`; live implementation uses `auth.uid()` membership helpers and optional GUC compatibility helper.
- Authority: Verified live RLS behavior and TC-03 isolation pass; Auth/membership is preferred.
- Status: Resolved for implementation direction; retain compatibility helper but do not depend on GUC-only isolation.
- Confidence: HIGH.

## C-002: Supabase snapshot vs live schema
- Conflict: `supabase.txt` describes the original 19-table snapshot, while live database has 32 public tables.
- Authority: Live database metadata and migration evidence.
- Status: Resolved: live schema is authoritative for current work; snapshot is retained as historical evidence.
- Confidence: HIGH.

## C-003: Frontend dashboard demo values
- Conflict: Overview displays metrics/sales while no data source or real dashboard query is connected.
- Authority: Source code proves frontend demo values.
- Status: Documented as placeholder; do not present as verified live metrics.
- Confidence: HIGH.

## C-004: TC-01 registration UI and real Auth bootstrap
- Conflict: Backend route/RPC exists, but no verified browser registration/Auth session and no live memberships/org rows.
- Authority: Live database and test evidence.
- Status: PARTIAL; frontend and first-owner bootstrap remain blocked by Auth setup/approval.
- Confidence: HIGH.

## C-005: Direct SQLAlchemy service-like connection vs Supabase JWT RLS
- Conflict: FastAPI uses a direct database URL with no demonstrated JWT propagation.
- Authority: Security requirement and existing live RLS policy design.
- Status: RESOLVED 2026-11-19 by AUTH-01. Every protected request verifies the Supabase JWT and runs in a transaction bound to `authenticated` with `request.jwt.claim.sub`/`request.jwt.claims` set transaction-locally (see 03). Verified by JWT, API-auth, tenancy, TC-04, session-lifecycle, registration, and module test suites.
- Confidence: HIGH.
- Blocker: No longer.

## C-006: Models vs live extended schema
- Conflict: ORM models do not cover the newly migrated 32-table schema completely and may use stale fields/relationships.
- Authority: Live schema and migration evidence.
- Status: Blocked; review exact live columns before expanding ORM. AUTH-01 mapped `users.auth_user_id` (exists live, was unmapped) because staff attribution requires it.
- Confidence: HIGH.

## C-007: Test-suite TC-01/TC-02 status
- Conflict: Structural tests are not equivalent to real registration/cashier-owner browser acceptance.
- Authority: Test evidence hierarchy in handover.
- Status: PARTIAL, not PASS for whole modules. AUTH-01 added real signed-JWT API tests (registration end-to-end, cashier/manager/accountant/owner matrix); browser integration remains untested.
- Confidence: HIGH.

## C-008: Test harness committed fixtures (found 2026-11-19)
- Conflict: `api_harness` used `async with conn.begin():`, which COMMITS on clean exit; the "rolled-back" harness committed one seeded world (2 orgs, 3 branches, 7 auth users, 5 staff, 3 inventory rows, 7 memberships, 9 audit rows, all AUTH01/example.test-tagged, created 2026-11-19 07:05 UTC).
- Authority: Live row inspection; identical transaction timestamps across seed and denial-audit rows.
- Status: RESOLVED 2026-11-19. Harness fixed earlier (explicit `outer.rollback()`; per-run unique seed emails). Leftovers purged on 2026-11-19 with explicit product-owner approval: read-only inspection confirmed the exact tagged set (2 orgs, 3 branches, 5 staff, 7 memberships, 3 inventory rows, 9 audit rows, 7 auth users, all created 2026-11-19 07:05:19.436205 UTC, no other tables affected); single transaction disabled `audit_logs_append_only`, deleted the 9 audit rows first then dependents by exact ID, re-enabled the trigger before commit; post-commit verification: trigger enabled, all six public tables and auth.users at 0 rows.
- Confidence: HIGH.

## AUTH-01 decisions (approved 2026-11-19)
- D-001: Tenant selection via `X-Organization-Id`/`X-Branch-Id` headers; 409 with the caller's own membership options when multiple organizations and no header. Never trust client IDs as proof.
- D-002: The DB dependency owns the transaction (commit/rollback before response via `Depends(..., scope="function")`); routes never commit manually.
- D-003: Staff FKs resolved server-side from `users.auth_user_id`; unresolved → NULL. Client-supplied staff IDs removed from request schemas.
- D-004: No auto-provisioning of `public.users` from `auth.users`.
- D-005: Pre-existing TC-01 transaction test fixed by inserting a throwaway `auth.users` row inside the already-rolled-back transaction (membership FK requires it).
- D-006: Parts Radar statuses now use DB defaults (`Open`/`Pending`) instead of the old lowercase router values; responses refresh from DB.
- D-007: Cost visibility follows the live column-grant design: `unit_cost` is not selectable by `authenticated`; the costs endpoint uses `get_inventory_cost()` (view_finance-gated). Aligned with Master_Ecosystem_Blueprint v2.0 cost-visibility rule.
- Authority for direction: `docs/Master_Ecosystem_Blueprint.pdf` (v2.0, 2026-11-19, authoritative system specification) — §7 tenant isolation at the database layer, RBAC+ABAC, immutable audit, separation of duties (EOD approval requires `approve`), §3.3 role matrix.

## C-009: M-Pesa STK at POS launch vs v2.0 phase split (found 2026-11-19, raw-information-interpreter)
- Conflict: PRD v3.0 Pillar 5 Mode A, Master Test Suite TC-16–TC-18, and handover 08 R-007 treat M-Pesa STK push/callback/reconciliation as launch POS scope. Roadmap v2.0 Phase 1 §3.1 requires only "mobile-money reference" capture; provider integration (M-Pesa webhooks, refunds, reconciliation) is Phase 6 §8.1.
- Authority: Roadmap v2.0 phase sequencing (S-01 §1 precedence). Direction: Phase 1 = reference capture; STK = Phase 6. TC-16–18 scheduling follows.
- Status: OPEN — product-owner confirmation required (REQUIREMENT_REGISTER OQ-02, assumption A-01; REQ-028).
- Confidence: HIGH (document conflict is explicit; resolution direction proposed, not decided).

## C-010: Offline sync mechanism in old test suite vs Blueprint §6 (found 2026-11-19, raw-information-interpreter)
- Conflict: TC-12 prescribes `offline_sales_queue` with immediate local stock decrement; TC-13 prescribes Background-Service-Worker-triggered `POST /api/v1/sales/sync-batch`. Blueprint v2.0 §6.2/§6.3 require a write-ahead outbox (local persist before UI confirmation), client UUID/device ID/sequence/idempotency keys, stock reservations at POS (not bare decrements), retries that never rely on Background Sync alone, and server-side conflict detection. Current backend has no `/api/v1` convention and no sync route (handover 01/02).
- Authority: Blueprint v2.0 §6. TC-12/TC-13 IDs are preserved (AGENTS.md) but pass criteria must be re-derived from the outbox/reservation design; endpoint contract to be specified (REQ-022).
- Status: OPEN — design decision pending solution-architect; recorded in REQUIREMENT_REGISTER §8.
- Confidence: HIGH.

## C-011: Discount approval mechanism — three divergent behaviours (found 2026-11-19, raw-information-interpreter)
- Conflict: (a) TC-19/TC-20 + PRD §4.3: fixed 5% cashier discount limit with Manager 6-digit Override PIN at the counter; (b) Blueprint v2.0 §4.4/§3.3 + Roadmap §11.4: configurable policy thresholds by role/branch/amount with an approval engine and separation of duties; (c) live verified behaviour: `create_pos_sale` denies ALL cashier discounts (owner/manager only) — handover 04/05, signed-JWT test evidence.
- Authority: Blueprint/Roadmap v2.0 define the target (configurable approval policy). Interim live behaviour (c) remains until the owner decides mechanism and threshold values; no agent may pick the PIN-vs-approval-request design.
- Status: OPEN — REQUIREMENT_REGISTER OQ-04 (blocking REQ-036/BR-001); TC-19/20 criteria to be re-derived after decision.
- Confidence: HIGH.

## C-012: Local password/PIN hashing vs Supabase Auth-managed credentials (found 2026-11-19, raw-information-interpreter)
- Conflict: TC-05 and handover 08 R-003 require bcrypt/argon2-hashed passwords and 6-digit override PINs stored in application tables. AUTH-01 (verified 2026-11-19) uses Supabase Auth-managed credentials with D-004 (no auto-provisioning of `public.users`); Blueprint §4.1 specifies phone OTP/passwordless options. Local password hashing may be inapplicable; override-PIN storage (if C-011 resolves toward PIN) is undesigned.
- Authority: Supabase Auth is the credential authority (verified implementation + Blueprint §4.1). TC-05 must be re-scoped to "no plaintext credentials anywhere; any chosen override secret securely hashed" after OQ-01/OQ-04 answers.
- Status: OPEN — REQUIREMENT_REGISTER OQ-01/OQ-04; R-003 wording stale.
- Confidence: HIGH.

## C-013: PRD front-loads AI/OCR/automation vs v2.0 human-in-the-loop sequencing (found 2026-11-19, raw-information-interpreter)
- Conflict: PRD v3.0 Pillar 6 "automated restock purchase orders", Pillar 8 expense OCR receipt snap (TC-31 OCR leg), Pillar 5 AI visual/voice part lookup at POS (TC-15) are Stage-1 scope. Blueprint §2.2 mandates "AI assists; authorised humans decide"; Roadmap v2.0 sequences reorder recommendations with approval in Phase 2, AI agents in Phase 5, and Phase 1 §3.1 expense capture/search with no OCR or AI.
- Authority: Roadmap v2.0 sequencing + Blueprint §2.2. Direction: Phase 1 = manual expense capture and barcode/text search; OCR/AI/automated POs deferred to their phases behind approval gates; TC-15, TC-31 (OCR leg), TC-34 scheduling follows phases.
- Status: OPEN — owner to confirm deferrals (non-blocking for Phase 1 core); recorded in REQUIREMENT_REGISTER §8.
- Confidence: HIGH.

Note (2026-11-19, raw-information-interpreter): handover 08's "immediate recommended task" (R-001 auth session baseline) and R-002 are satisfied at API level by AUTH-01 (see 04/05); H08 is stale, not contradictory. Release-manager should refresh H08. Requirement register for Phase 0 gaps + Phase 1 created at `docs/requirements/REQUIREMENT_REGISTER.md` (DRAFT pending open questions OQ-01…OQ-16).

## Product-owner decisions (2026-11-19, agent-pipeline session)
- D-008: C-008 purge explicitly approved and executed (see C-008 resolved status). Transaction-local trigger disable/enable was the approved means; no permanent trigger or RLS change.
- D-009: Continue implementation following `Master_Ecosystem_Blueprint` v2.0 and `Phased_Implementation_Roadmap` v2.0 phase by phase; the formal TC acceptance pass follows implementation increments. Per-feature acceptance criteria are still recorded so tests can be derived. Project agents in `.qoder/agents/` operate under `docs/AGENT_OPERATING_RULES.md`.
- D-010: Baseline regression independently re-run 2026-11-19: `pytest -q tests/` → 44 passed, 0 failed (405.40s) against the live database, before the purge.
- D-011 (2026-11-19): Product owner delegated implementation and phase-gate approval authority to the release-manager for autonomous, uninterrupted phase-by-phase delivery ("remove my permission on each gate and each phase… follow the protocol of phases only"). Delegated: specs, designs, code, rollback-planned migrations, tests, gate decisions, test-data cleanup, and resolution of open questions via conservative Blueprint-aligned defaults recorded as decisions. NOT delegated (hard limits, Blueprint §2.2/§8): live payment execution/payouts, live eTIMS submission, external messages to real recipients, production exposure of real users, secret exposure, destructive operations beyond verified test data or rollback-planned schema changes. Recorded in AGENT_OPERATING_RULES.md §4–5 and PHASE_GATE_TRACKER.md.

## Release-manager decisions under D-011 delegation (2026-11-19) — resolve register OQ-01…OQ-16
All are conservative Blueprint/Roadmap-aligned defaults; the product owner may override any of them later. They unblock the requirement register (now FINALISED v1.0) without inventing requirements: every default cites its authority.
- D-012 (OQ-01, C-012): Launch credentials = Supabase email+password (sign-up/sign-in/reset). Phone OTP deferred until an SMS provider is approved (BP §4.1 preference recorded as future direction). No credentials in application tables; Supabase Auth is credential authority. TC-05 re-scoped: "no plaintext credentials anywhere; any chosen override secret securely hashed".
- D-013 (OQ-02, resolves C-009): Phase 1 mobile-money = manual reference capture only; M-Pesa STK/webhooks/reconciliation = Phase 6 (RM §3.1 vs §8.1). TC-16–18 scheduled in Phase 6.
- D-014 (OQ-03): Offline tender = cash + mobile-money reference (BP §6.1). Bank/card references online-only. Configurable offline per-sale value cap, default KES 50,000 (policy default, not a source fact).
- D-015 (OQ-04, resolves C-011): Discount mechanism = approval request through the central approval engine (RM §11.4, BP §4.4), NOT counter PIN. Default cashier limit 5% (TS TC-19 value adopted as configurable default), per-role/branch thresholds configurable. Interim live deny-all-cashier-discounts behaviour stays until the engine ships. TC-19/20 criteria re-derived at that point.
- D-016 (OQ-05): Cash-variance tolerance default KES 0 — any variance persists, alerts owner+manager, and opens investigation (BP §4.8); tolerance configurable per tenant.
- D-017 (OQ-06): Launch receipt channels = browser print (58/80mm thermal CSS) + PDF + in-app. WhatsApp/SMS/email receipts after provider setup + consent UX; consent captured at sale when the customer supplies a channel (Consent Record per BP §7.3). External sends remain sandbox/mock until credentials + hard-limit policy (D-011).
- D-018 (OQ-07): Feature flags DB-backed, tenant-scoped, API-served, client-cached (assumption A-03 approved). Minimal admin console REQUIRED for Phase 0 gate: tenant list/onboard/suspend, flag toggles, integration health; platform_admin role; no access to tenant financial data (RM §2.1, BP §10.1).
- D-019 (OQ-08): PWA local store encrypted AES-GCM (WebCrypto); device-bound key wrapped via PBKDF2(user-id + device-id) so offline unlock survives browser restart without a passphrase. Trade-off recorded: protects at-rest data, not against a fully compromised unlocked device; optional passphrase lock later. Solution-architect to detail in ADR.
- D-020 (OQ-09): Read-only live-schema audit executed 2026-11-19; results in docs/architecture/live-schema-audit-2026-11-19.md (authoritative for column-level facts; supersedes H03 unknowns).
- D-021 (OQ-10): Phase 1 sellable item = extend `branch_inventory` (barcode, price-version linkage); canonical Product/SKU Parts Master introduced in Phase 2 (RM §4). Domain model must map Sale→sales_orders etc. explicitly, no parallel re-invention.
- D-022 (OQ-11): Free-text bike-model attribute on items for Phase 1 search; structured fitment registry = Phase 2.
- D-023 (OQ-12): Phase 1 customer credit = display-only balance + purchase history; credit sales/limits/ageing = Phase 3 (RM §5). Mechanic referral tagging at POS deferred to Phase 3/4 commissions; TC-14 scheduled accordingly.
- D-024 (OQ-13): Staff onboarding = staff self-signup via Supabase Auth + owner explicitly creates the public.users row and membership through an owner-only RPC. This is an explicit owner action, not auto-provisioning — consistent with D-004's intent (no automatic auth.users→public.users mirroring). Phase 1 roles: owner/manager/cashier/accountant; storekeeper added Phase 2; platform_admin for the console.
- D-025 (OQ-14): Backup posture: document Supabase-managed backups (plan entitlement verification is an owner dashboard action — flagged, not assumed); add logical pg_dump backup procedure + restore drill against a local/non-production target before pilot (RM §12). No destructive action on live DB.
- D-026 (OQ-15): Observability = structured JSON logs + lightweight metrics endpoint + alert rules, no third-party dependency. Default thresholds: 5xx rate >1%/5min, p95 API latency >2s, sync lag >15min, any dead-letter item → alert. Configurable.
- D-027 (OQ-16): English-first with full i18n scaffolding from slice 1; Kiswahili glossary drafted from market-native terms, marked REQUIRES NATIVE REVIEW before pilot (BP §10.3).
- Contradiction statuses: C-009 resolved by D-013; C-010 direction fixed (BP §6 outbox+reservations win; TC-12/13 IDs preserved, criteria re-derived at sync design); C-011 resolved by D-015; C-012 resolved by D-012; C-013 resolved — RM v2.0 sequencing wins: OCR/AI/automated POs deferred to Phases 2/5 with approval gates; TC-15/31(OCR)/34 scheduled accordingly. Original entries above remain unchanged (append-only).

## C-014: Handover schema claims vs live audit (found 2026-11-19, release-manager)
- Conflict: H03's 32-table list includes journal_entries/journal_lines/inventory_reservations/receipts/credit_notes/expense_categories etc., and H04 states "eod and ledger objects/RPC functions exist". Read-only live audit (docs/architecture/live-schema-audit-2026-11-19.md, D-020) shows a DIFFERENT 32-table set: NO ledger tables or functions, no reservations/receipts/credit-notes/cash-session/device/flag/idempotency/sync/price-version/notification tables. Returns RPCs DO exist (create_sales_return/resolve_sales_return/enforce_return_refund_cap). customers has consent columns; memberships key on auth_user_id with no limit attributes; organizations lacks profile fields.
- Authority: Live information_schema/pg_proc audit (executed 2026-11-19).
- Status: RESOLVED — audit file is authoritative for column-level facts; H03/H04 schema claims marked stale. Ledger-first (REQ-043) requires building the ledger from scratch in the Phase 0/1 data foundation.
- Confidence: HIGH.
