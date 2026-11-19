# 05 — Testing and Acceptance Ledger

## Test case status summary

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| TC-01 | Organization registration | PASS (API transaction) | Structural 5/5 + API 1/1 + authenticated end-to-end registration test passed 2026-11-19; browser bootstrap untested |
| TC-02 | Cashier vs owner RBAC | PARTIAL | 6 structural checks + signed-JWT role matrix (expenses/EOD/dashboard/POS discounts) passed 2026-11-19; browser matrix untested |
| TC-03 | Cross-tenant RLS isolation | PASS | 4 pytest checks passed with temporary Auth identities and rollback on 2026-11-19 |
| TC-04 | Branch assignment/scoping | PASS (API) | Signed-JWT branch-isolation suite passed 2026-11-19 (denial+audit, own-branch read, org-wide owner, cross-tenant emptiness, interleaved identity isolation, payload mismatch) |
| TC-05 | Password/PIN hashing | NOT TESTED | No verified user creation test |
| TC-06–TC-08 | Import logistics | NOT IMPLEMENTED | Tables/RPC inventory requires review; no acceptance tests |
| TC-09–TC-11 | UOM/network search/velocity | NOT IMPLEMENTED | No verified implementation |
| TC-12–TC-13 | Offline PWA sync | NOT IMPLEMENTED | No frontend IndexedDB/service-worker implementation found |
| TC-14–TC-15 | Mechanic referral/AI search | NOT IMPLEMENTED/NOT TESTED | Mechanic table exists; no AI integration |
| TC-16–TC-18 | M-Pesa | NOT IMPLEMENTED | No verified Daraja/STK/callback implementation |
| TC-19–TC-21 | Discounts/PIN/audit | PARTIAL | Cashier discount denial verified via signed-JWT checkout (RPC 42501→403); denial audit rows asserted; TC-20/21 not executed |
| TC-22–TC-24 | Parts Radar | PARTIAL | Signed-JWT request/quote tests passed (Open/Pending defaults, own-org quote rejection, cross-org quote, org-scoped listing); no reservation/expiration tests |
| TC-25–TC-26 | WhatsApp | NOT IMPLEMENTED | Tables exist; no webhook/AI parser implementation verified |
| TC-27–TC-28 | Dispatch/POD | NOT IMPLEMENTED | Tables exist; no waybill/OTP flow verified |
| TC-29–TC-30 | Pickup analytics/churn | NOT IMPLEMENTED | Table exists; no engine/alert implementation verified |
| TC-31–TC-33 | Expenses/EOD/cash variance | PARTIAL | Signed-JWT expense/EOD tests passed (permission matrix, server attribution, approval separation, duplicate 409); no OCR/cash-variance acceptance tests |
| TC-34–TC-35 | Payout batches/sign-off | NOT IMPLEMENTED | Tables exist; no workflow/approval implementation verified |
| TC-36–TC-38 | Tax/payroll toggles | NOT IMPLEMENTED | Organization fields partly exist; no VSCU/statutory engine evidence |
| TC-39 | Tenant context pool reset | PASS (API) | 12 concurrent /auth/me requests on separate NullPool connections kept distinct identities; cancelled request left pool clean (2026-11-19) |
| TC-40 | Checkout rollback | PARTIAL | Forced-failure-after-write probe rolled back cleanly and connection stayed usable; checkout-specific injected failure not executed |

## AUTH-01 execution evidence (2026-11-19)
Full regression: `python -m pytest -q tests/` → **44 passed, 0 failed** (347.78s) against the live Supabase database.
- `test_auth01_jwt.py` — 15 passed: valid/expired/bad-signature/wrong-iss/wrong-aud/missing-exp/missing-sub/non-UUID-sub/malformed/alg-none/service-role/HS256-disabled/ES256-JWKS/ES256-tampered/unknown-kid.
- `test_auth01_api_auth.py` — 4 passed: 401 matrix across 7 protected routes, unknown-user 401, OpenAPI bearer security, function-scope wiring.
- `test_auth01_tenancy.py` — 1 passed: selection matrix (auto-select, branch default, multi-org 409, explicit selection, outsider 403, non-member header 403+audit, bad header 400, foreign branch 404, payload mismatch 403+audit, org-wide writer 400, no persisted writes).
- `test_tc04_branch_isolation.py` — 1 passed: TC-04 matrix incl. interleaved A/B/A leakage loop and cashier checkout attribution.
- `test_auth01_sessions.py` — 4 passed: identity binding + rollback + reuse, commit with server attribution, 12-way concurrency, cancellation cleanup.
- `test_auth01_registration.py` — 1 passed: authenticated registration end-to-end (org + owner membership + audit), new-owner /auth/me, invalid org_type 422.
- `test_auth01_modules.py` — 1 passed: finance/radar authorization matrix.
- `test_tc01_transaction.py` — 1 passed (fixed: throwaway auth.users row inside rolled-back transaction).
- Pre-existing suites re-run green: `test_tc01.py` (5), `test_tc01_api.py` (1), `test_tc02.py` (6), `test_tc03.py` (4).
Write tests run inside one outer transaction joined via savepoints and roll back; read-only concurrency/cancellation tests use committed fixtures on non-audited tables and delete them afterwards. Post-run inspection confirmed no new committed test rows.

## TC-01 evidence
- Database: 5/5 structural tests passed.
- API: 1/1 route check passed.
- Authenticated transaction test passed 2026-11-19 (registration via signed JWT; org/membership/audit asserted; rolled back).
- Browser registration/Auth bootstrap remains untested.

## TC-02 evidence
- 6/6 structural/RPC/policy tests passed on 2026-11-19.
- Signed-JWT API role matrix passed 2026-11-19 (cashier/manager/accountant/owner across expenses, EOD approval, dashboard, POS discounts, inventory costs).
- Browser session matrix remains untested.

## TC-03 evidence
- 4/4 tests passed on 2026-11-19.
- Isolation used temporary Auth identities and public-table test data inside a transaction with rollback.

## Test infrastructure
- pytest in project virtual environment; listed in requirements.txt.
- `tests/conftest.py` sets test-only SUPABASE_URL/SUPABASE_JWT_SECRET (HS256 enabled for tests only; production uses JWKS).
- `tests/auth01_utils.py`: savepoint harness (`api_harness`), seeded world, committed read-only fixtures. Harness rolls back explicitly — `async with conn.begin():` must not be used for rollback fixtures (it commits on clean exit; see 06 C-008).
- `.venv` and `frontend/node_modules` are ignored development artifacts.
- No CI configuration or test coverage report was found.
