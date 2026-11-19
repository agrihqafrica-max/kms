# 08 — Next Development Roadmap

## Immediate recommended task
Close the outstanding Slice 1 security/acceptance gates before calling it stable: obtain independent security re-review after the reviewer service is available, execute the uncovered ACs in HANDOVER/05 (including live browser/mail and visual/mobile checks), and record actual results. The frontend checkpoint has 21 passing local tests and 18 passing intercepted browser groups, not full acceptance. Phase 0 remains open.

Next implementation after Slice 1 acceptance: organisation/staff onboarding (Slice 2), following the approved register and phase pipeline. Foundation ADR-001/003 remain BLOCKED under D-032; do not implement their drafts or apply migrations. Production/external-side-effect restrictions remain unchanged.

The numbered roadmap below is historical. R-001/R-002 already have AUTH-01 API evidence; R-005 has client/fixture implementation evidence. Blueprint/Roadmap v2.0 and D-012–D-027 supersede legacy PIN, offline and M-Pesa sequencing; retain original TC IDs.

## R-001 — Auth session baseline
Objective: establish authenticated API requests using Supabase JWT; set `auth.uid()` context safely for RLS.
Acceptance:
- Login/token dependency exists.
- Organization and branch context comes from membership.
- Unauthorized requests return 401/403.
- No service-role key is accepted by browser/API normal flow.
Verification: signed-in owner/cashier test scripts and TC-03 repeated isolation test.

## R-002 — Complete TC-04 Branch Assignment
Objective: verify branch manager scope against Branch X vs Branch Y.
Dependencies: R-001.
Acceptance: Branch Y returns zero for branch X manager and an audit record is written if required.

## R-003 — TC-05 Password/PIN Hashing
Objective: replace plaintext/placeholder account setup with bcrypt/argon2 hashing.
Acceptance: plaintext password and 6-digit PIN absent from live rows; verification succeeds.

## R-004 — Complete organization bootstrap frontend
Objective: real registration and owner membership flow.
Dependencies: R-001.
Acceptance: first org owner created, compliance toggles stored, membership and audit event created transactionally.

## R-005 — Live frontend API client
Objective: replace demo dashboard metrics and static POS products with real API calls.
Dependencies: R-001 and backend route completion.
Acceptance: loading/error/empty states and real organization/branch filtering.

## R-006 — POS rollback test TC-40
Objective: inject a database failure after order header and prove full rollback.
Dependencies: stable POS RPC and Auth context.
Acceptance: no partial order, stock, payment, or audit records after forced failure.

## R-007 — POS acceptance TC-12–TC-18
Objective: offline queue, sync, mechanic referral, and M-Pesa.
Dependencies: PWA architecture and real provider credentials.
Acceptance: offline sale queue, deduplication, STK/callback/reconciliation tests.

## R-008 — Continue test suite sequentially
Objective: proceed TC-04 through TC-40 after approved prerequisites.
Acceptance: one test case at a time with migrated SQL, tests, evidence, and no untested marking as PASS.
