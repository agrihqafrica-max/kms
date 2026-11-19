# 08 — Next Development Roadmap

## Immediate recommended task
Implement and verify a real, user-scoped Supabase Auth/JWT database session for FastAPI. This is required before TC-04 and later tenant workflows can be safely implemented.

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
