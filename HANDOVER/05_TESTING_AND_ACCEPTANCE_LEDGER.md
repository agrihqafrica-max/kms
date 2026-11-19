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

## Slice 1 additional browser acceptance registration (2026-11-19)

Existing TC-01 through TC-40 are unchanged. These additions are registered before browser execution; unit checks do not establish live Supabase/database acceptance.

| ID | Scope | Initial status |
|---|---|---|
| TC-41 | Browser sign-in, session, refresh, expiry, sign-out (AC-1.1–1.7, 2.6) | NOT EXECUTED |
| TC-42 | Organisation/branch selection, isolation, denial/revocation (AC-5.1–5.8) | NOT EXECUTED |
| TC-43 | Live views, configuration, errors, connectivity, placeholders (AC-6.1–6.9, 7.7) | NOT EXECUTED |
| TC-44 | Controlled-mailbox recovery end to end (AC-2.3–2.4) | BLOCKED: SMTP/redirect/test mailbox unverified |
| TC-45 | First run/no staff/no automatic provisioning (AC-7.1–7.2, 2.1) | NOT EXECUTED |
| TC-46 | Accessibility, performance, i18n, money, secret exclusion (AC-2.2, 2.5, 7.3–7.6) | NOT EXECUTED |

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

## Phase 0 / SLICE-01 continuation — executed evidence (2026-11-19)

Append-only QA evidence for the approved frontend auth/API bootstrap. TC-01–TC-40 and the initial TC-41–TC-46 registration above are historical and unchanged; current additional-test dispositions follow. **No full AC, slice, security approval, or phase gate is declared PASS.** SECURITY re-review is still running according to Main's handoff; approval is not established here.

### Environment, commands, provenance, and test sources

- Independent QA: `E:/MotorCycle/kms-main`, Windows 10 x64 / Git Bash; `node --version` → `v24.22.1`; `npm --version` → `11.19.1`. Existing dependencies only; no install, config/source changes, server start, live Auth/mail/API/database action, or backend pytest run.
- **Independent execution:** `npm --prefix "E:/MotorCycle/kms-main/frontend" test` → **20 passed, 0 failed, 0 skipped**, runner duration **484.5544 ms**. Expands to `node --test tests/*.test.js`; injected/synthetic auth, fetch and API responses, not live services.
- **Independent execution:** `npm --prefix "E:/MotorCycle/kms-main/frontend" run lint` → **0 warnings, 0 errors**, **2.3 s**, 32 files / 104 rules; no fix flag.
- **Main-reported prior execution, not independently rerun as build/browser work here:** from repository root, `npm --prefix frontend test` → 20 passed; `npm --prefix frontend run lint` → 0 warnings/errors; `npm --prefix frontend run build` → **Vite 8.3.8 PASS, approximately 21 s**, initial JS total approximately **148.8 KB gzip**. Bundle-size evidence only, not full-page/device/latency/counter-speed performance.
- **Main-reported browser execution:** real in-app browser against the running local Vite app with actual Supabase SDK; `installFixture()` intercepting `/auth/v1` and configured local API requests before exercised flows; protected POS deep-link/sign-in setup, then `runBrowserChecks()` → **17 passed scenario groups**. QA inspected the actual sources but did not independently rerun the browser. Fixture interception matches Auth paths and API port 8000; other requests fall through to original fetch, so this is not a general network sandbox.
- Evidence location: this continuation's Bash tool outputs (independent test/lint/version results), Main's supplied task handoff (build/browser execution), and this ledger entry. No separate raw browser trace, build log, screenshot or coverage artifact was supplied or created here. Test source inspection establishes assertion scope, not independent proof of Main's execution.
- **U-A:** `E:/MotorCycle/kms-main/frontend/tests/apiClient.test.js` — 11 executed tests: current bearer/tenant headers, bootstrap header omission, old-token 401 rotation, failed/second-401 bounds, 403 no retry, stale tenant response discard, account-switch refresh isolation, 409 selection replay, 500 sanitation/no unauthenticated fetch, absolute-URL credential rejection.
- **U-S:** `E:/MotorCycle/kms-main/frontend/tests/selection.test.js` — 5 executed tests: explicit multi-org choice, stale/cross-tenant selection rejection, valid selection/org-wide handling, configuration validation, decimal-string formatting/Nairobi dates.
- **U-R:** `E:/MotorCycle/kms-main/frontend/tests/sessionState.test.js` — 4 executed tests: recovery invalidation on account replacement, same-session rotation, password mutation bound to original recovery token/replacement rejection, selected-bootstrap membership-revocation recovery.
- **B1–B17** below are ordinal references to Main's returned groups, not new TC IDs. Sources: `E:/MotorCycle/kms-main/frontend/tests/browser-checks.js` and `E:/MotorCycle/kms-main/frontend/tests/browser-fixture.js`.

### Main-reported browser groups and inspected assertion scope

| Group | Reported passing execution / assertion boundary |
|---|---|
| B1 | Sign-in setup restores `/app/pos`; fixture inventory renders; inventory requests have auth-present/org/branch metadata; checkout disabled. Metadata records auth presence, not bearer contents; U-A tests bearer construction separately. |
| B2 | Search sends `?search=empty` and shows no-match state; no debounce timing/request-frequency benchmark. |
| B3 | Fixture 500 detail sanitized; Retry restores fixture dashboard amount. |
| B4 | Synthetic offline event plus fetch failure clears populated amount; online event restores it/removes banner. Not physical network outage or PWA persistence. |
| B5 | Backend-only fetch failure clears financial amount while `navigator.onLine` stays true; reconnect event refetches. |
| B6 | Delayed SDK logout response clears tenant amount and gates sign-in form until logout finishes. |
| B7 | Logout removes tested organisation-selection key; not exhaustive SDK/branch-key storage or browser-Back audit. |
| B8 | Invalid credentials show generic error; subsequent sign-in remains usable. |
| B9 | Zero memberships show first-run UI; registration disabled; no `/organizations/register` call. No database absence/provisioning proof. |
| B10 | Multi-org picker selects B; switch to A replaces amounts without retaining previous amount. No sibling-branch/audit/RLS assertion. |
| B11 | Fixture cashier 403 shows denial with no fixture financial amount or Finance navigation; no server/audit evidence. |
| B12 | Org-wide fixture shows honest missing-branch message; does not establish actual backend 400 response. |
| B13 | Short-password validation blocks network; mismatched confirmation shows error. Real provider password policy unverified. |
| B14 | Intercepted signup shows confirmation-required UI; no delivered mail/created Auth identity established. |
| B15 | One reset request shows generic confirmation; direct recovery route without authority shows invalid-link guard. No existing/unknown-address or rate-limit matrix. |
| B16 | SDK account replacement removes recovery authority and populated password form; no password PUT occurs. |
| B17 | Synthetic valid recovery submits exactly one intercepted `/auth/v1/user` PUT and completes local sign-out (SDK session null). No real password change or old/new-password login verification. |

### Current TC-41–TC-46 dispositions

| ID | Current status | Executed evidence and remaining boundary |
|---|---|---|
| TC-41 | PARTIAL | U-A/U-R; B1, B6–B8 client auth/session safeguards. Real persistence/reload, SDK refresh/expiry lifecycle, full sign-out storage/Back behavior unexecuted. |
| TC-42 | PARTIAL | U-A/U-S/U-R; B1, B10–B12 client selection/denial. Browser reload, 409 picker/replay, sibling-branch rejection/audit and real tenant/RLS isolation unexecuted. |
| TC-43 | PARTIAL | Config helper; fixture data/search/error/connectivity UI; disabled checkout. Full config UI, demo sweep, role/data-state matrix, populated radar and placeholder assertions unexecuted. |
| TC-44 | PARTIAL (fixture only); controlled-mailbox E2E NOT EXECUTED / BLOCKED | U-R; B15–B17 recovery guards/token binding/one update/sign-out. SMTP, redirect allowlist, delivered links, rate limits, real old/new-password verification unestablished; live actions prohibited here. |
| TC-45 | PARTIAL | B9/B14 no-org/confirmation UI, no registration request. Staff-link banner, real Auth identity creation and application-table no-provisioning checks unexecuted. |
| TC-46 | PARTIAL | U-S formatting/config; B13 validation; Main's build size only. Secret-exclusion scan, visual/mobile-360/touch/contrast, full a11y, i18n and device/performance certification NOT EXECUTED. |

### AC-to-test coverage matrix (all 37 spec ACs)

Authority: `E:/MotorCycle/kms-main/docs/specs/SLICE-01-auth-bootstrap/SPEC.md` §10. Registered TC mapping is complete; **mapping is not executed coverage**. PARTIAL names only executed subsets; remaining clauses are not accepted. B evidence is Main-reported, U evidence independently executed here.

| AC | TC | Evidence / status / remaining gap |
|---|---|---|
| AC-1.1 | TC-41 | PARTIAL — B1 + U-A bearer construction; live sign-in identity and real `/auth/me` propagation unexecuted. |
| AC-1.2 | TC-41 | PARTIAL — U-A no-session fetch suppression, B1 inventory headers; full browser protected-route/request matrix unexecuted. |
| AC-1.3 | TC-41 | NOT EXECUTED — browser reload/close/reopen session restoration has no direct test in inspected suites. |
| AC-1.4 | TC-41 | PARTIAL — U-A rotation/retry bounds with injected auth; actual SDK expired-token/concurrent-401 browser lifecycle unexecuted. |
| AC-1.5 | TC-41 | PARTIAL — U-A failed-refresh/second-401 expiry callback; browser expired notice/full storage cleanup unexecuted. |
| AC-1.6 | TC-41 | PARTIAL — B1 POS intended destination; specified Overview deep-link/full unauthenticated network assertion unexecuted. |
| AC-1.7 | TC-41 | PARTIAL — B6/B7 logout gate/org key, B17 recovery-session null; full SDK/branch keys, protected links and browser Back unexecuted. |
| AC-2.1 | TC-45 | PARTIAL — B9/B14 first-run/confirmation UI; real Auth creation, signup-with-session branch, application-table absence and duplicate-submit matrix unexecuted. |
| AC-2.2 | TC-46 | PARTIAL — B13 short/mismatch validation; provider policy unknown (D-030), mismatch no-network count not directly asserted. |
| AC-2.3 | TC-44 | PARTIAL — B15 single generic reset response; existing/nonexistent address equivalence and rate-limit branch unexecuted. |
| AC-2.4 | TC-44 | PARTIAL — U-R + B15–B17 invalid/replacement/valid synthetic recovery and one PUT/sign-out; real links/redirects/old-new-password logins unexecuted. |
| AC-2.5 | TC-46 | NOT EXECUTED — no source/env/dist/log secret-exclusion scan here; configuration validation is not that scan. |
| AC-2.6 | TC-41 | PARTIAL — B8 invalid fixture login/subsequent usable form; real provider wrong-password/unknown-email cases unexecuted. |
| AC-5.1 | TC-42 | PARTIAL — B1 single-org inventory headers, U-S resolution; real membership/role/branch bootstrap matrix unexecuted. |
| AC-5.2 | TC-42 | PARTIAL — B10 explicit multi-org selection, U-S no silent assignment; exact membership/role listing and persisted storage not exhaustively asserted. |
| AC-5.3 | TC-42 | PARTIAL — U-A 409 callback/select/retry once; browser 409 interstitial/source-options validation unexecuted. |
| AC-5.4 | TC-42 | PARTIAL — U-S valid stored-selection resolver; browser reload/localStorage/header restoration unexecuted. |
| AC-5.5 | TC-42 | PARTIAL — B10 changed amounts, U-A old-context response discard; branch switching/all visible resources/real isolation unexecuted. |
| AC-5.6 | TC-42 | PARTIAL — U-A generic 403/no retry, U-S invalid branch rejection only; branch-manager sibling attempt, branch-specific UI and audit row unexecuted. |
| AC-5.7 | TC-42 | PARTIAL — U-S stale selection, U-R selected-bootstrap denial reload once; browser mid-session revocation/storage/message and real membership change unexecuted. |
| AC-5.8 | TC-42 | PARTIAL — B12 honest org-wide gap, U-S no invented branch; actual backend 400/known-branch options unexecuted. |
| AC-6.1 | TC-43 | PARTIAL — U-S missing/unsafe config names only; complete source-origin scan, changed target and startup config-error UI unexecuted. |
| AC-6.2 | TC-43 | PARTIAL — B1/B3/B10 known fixture values; exhaustive demo-artifact/source/rendered-number provenance sweep unexecuted. |
| AC-6.3 | TC-43 | PARTIAL — B3/B10 fixture amounts, U-S date/money helpers; full roles, actual date query, zero/missing measures and ledger provenance unexecuted. |
| AC-6.4 | TC-43 | PARTIAL — B11 cashier fixture denial/no finance nav or amount; real server denial/audit row unexecuted. |
| AC-6.5 | TC-43 | PARTIAL — B1/B2 fixture inventory/search/no-match/disabled checkout; real inventory, empty branch, exhaustive cost/margin payload/DOM and submit-attempt assertions unexecuted. |
| AC-6.6 | TC-43 | PARTIAL — B2/B3/B4 no-match, sanitized 500/Retry/network handling; slow-loading and empty/error/retry matrix for every surface unexecuted. |
| AC-6.7 | TC-43 | PARTIAL — B4/B5 synthetic offline/backend-only outage clearing/reconnect; actual offline persistence/trading/sync not implemented or accepted by this evidence. |
| AC-6.8 | TC-43 | NOT EXECUTED — fixture always returns empty radar; no direct populated-row or radar-empty-state assertions. |
| AC-6.9 | TC-43 | PARTIAL — B4/B5 fixture health/network behavior; exact ok/degraded/unreachable indicator matrix and real health response unexecuted. |
| AC-7.1 | TC-45 | PARTIAL — B9 first-run/disabled registration/no register call; Check again and full protected-route exclusion matrix unexecuted. |
| AC-7.2 | TC-45 | NOT EXECUTED — fixture supplies null staff ID but no direct banner/dismissal/no-staff-write assertions; database inspection prohibited. |
| AC-7.3 | TC-46 | NOT EXECUTED — 360 px target dimensions/contrast and visual review absent. |
| AC-7.4 | TC-46 | PARTIAL — Main's approximately 148.8 KB gzip initial-JS report; no independent bundle graph audit, five-run throttled device timing or p95 data measurement. |
| AC-7.5 | TC-46 | NOT EXECUTED — exhaustive rendered-string catalogue audit, SW review markers and catalogue-swap test absent. |
| AC-7.6 | TC-46 | PARTIAL — U-S decimal precision/Nairobi dates; read of `E:/MotorCycle/kms-main/frontend/src/lib/format.js` shows string-to-Intl formatting; B3/B10 grouping. Full rendered-money/no-arithmetic audit unexecuted. |
| AC-7.7 | TC-43 | NOT EXECUTED — Inventory/Finance/Dispatch placeholder-page assertions absent. |

### Unexecuted gaps, defects, and mandatory-family verdicts

- **Blocking test-coverage gaps for full slice acceptance:** AC-1.3, AC-2.5, AC-6.8, AC-7.2, AC-7.3, AC-7.5, AC-7.7 have TC mappings but no direct assertion in inspected executable suites. Other partial clauses remain open above. Route test completion to QA/frontend-engineer and acceptance disposition to release-manager; registration alone cannot close gaps.
- **Observed failures:** no independent local test/lint failures (20/20, lint clean); no new runtime product defect reproduced. Main reports screenshot capture failed because viewport was hidden: evidence-capture limitation, not a diagnosed UI defect. No usable screenshot or visual/mobile-360/full a11y/i18n/performance certification. No root-cause hypothesis or security defect-closure claim inferred from green fixtures; SECURITY re-review remains pending.
- **Offline verdict:** fixture banner/data clearing/reconnect only. No offline sale/receipt/expense/stock issue, durable local store, sync, or last-unit/price/customer/count conflicts under Blueprint §6.3. TC-12/TC-13 remain NOT IMPLEMENTED; phase-level requirements are not waived by this read-only slice.
- **Duplicate-prevention verdict:** B17 one recovery update; U-A bounded refresh/selection retries. No full form double-submit matrix or server idempotency-key replay returning original sale/payment/stock/request results. No business duplicate-prevention acceptance.
- **Stock/financial reconciliation verdict: NOT EXECUTED.** Disabled checkout and fixture amounts do not prove source-document movements, count variance proposals, stock/value/COGS-to-ledger reconciliation, balanced journals, reversal-only correction, expected/count cash, settlement references or refund/credit-note stock-and-ledger reversal. No business writes tested.
- **Permissions/tenant isolation verdict:** client selection/data clearing, generic denial and account-bound recovery only. Full role × branch × attribute matrix, thresholds/separation of duties, real cost/margin restrictions, DB RLS/audit, and cross-tenant API/report/search/file/cache/AI-context attack tests (IDOR, escalation, injection, webhook spoofing) unexecuted here. Fixture headers/responses are not tenant-database evidence.
- **Integration/UAT verdict:** no live Auth/mail/API/DB actions; no eTIMS/WhatsApp/payments/logistics integration execution. Future integrations require approved sandboxes/mocks. Real cashier/storekeeper/owner/mechanic/rider UAT and <10 s counter-speed measurement NOT EXECUTED. Controlled mailbox/SMTP/real redirects remain blocked by scope/unverified prerequisites; D-030 prevents claiming verified provider minimum password length.
- Historical **44-test backend AUTH-01 evidence was not rerun**; frontend checks neither refresh nor invalidate it. No database read/write, schema change, cleanup or production action occurred here.

### Infrastructure correction (append-only; supersedes historical no-CI statement)

- Verified 2026-11-19 with `ls -la "E:/MotorCycle/kms-main" "E:/MotorCycle/kms-main/docs/specs/SLICE-01-auth-bootstrap" "E:/MotorCycle/kms-main/.github/workflows" "E:/MotorCycle/kms-main/frontend/tests"` and direct file read: **`E:/MotorCycle/kms-main/.github/workflows/ci.yml` exists**. Workflow authored for backend pytest plus frontend lint/build; it does not currently invoke frontend `npm test`. This corrects “No CI configuration ... was found” above without rewriting history.
- **Hosted CI and staging NOT EXECUTED/verified here.** Backend job requires configured non-production database secret; no secret value/hosted run inspected. Workflow existence is not green CI, staging acceptance, a coverage report, security approval or phase-gate closure.

## Slice 1 checkpoint closeout — 2026-11-19 (supersedes prior running-review status)

### Fresh main-agent execution
- `npm --prefix frontend test && npm --prefix frontend run lint && npm --prefix frontend run build` exited 0: **21 passed, 0 failed, 0 skipped** (1645.882 ms); oxlint **0 warnings / 0 errors** (33 files); Vite 8.3.8 build **PASS** (3.59 s). No backend test rerun; historical 44-test evidence is unchanged.
- Browser: existing local Vite server, pre-application navigation fetch interception, synthetic sign-in at the protected POS deep link, then `runBrowserChecks()` returned **18 passing groups**. Console query returned no warnings/errors. Real React and Supabase SDK; intercepted Auth/API responses, not live Supabase/RLS acceptance.
- B1–B17 above passed again. **B18:** hold the password grant pending, navigate sign-in → sign-up → sign-in, assert both submit buttons stay disabled, release the grant, verify dashboard, then complete sign-out. This proves route-independent form coordination and subsequent sign-out, not every possible simultaneous teardown timing.
- Additional real-SDK test `frontend/tests/sdkSessions.test.js`: replacement account B waits for account A's held/rejected SDK refresh, then refreshes successfully; A's API request aborts, B remains the SDK identity and no expiry callback fires. This adds one test to the prior 20-test evidence.
- Main source review covered AuthProvider/AuthPages, sessionState, API client, router and tenant bootstrap. Provider-scoped operation lock survives navigation; teardown drains pending auth before SDK local removal, ignores outgoing events and verifies no remaining session. Superseded auth results abort. API refresh drains a previous account's SDK flight before refreshing the new account. This is not independent review approval.

### Publication safety and gate disposition
- Local read-only credential/exclusion audit: **143 candidate files, 112 historical blobs**, no historical paths matched current ignore rules and no findings for known local credential values, private-key/access-token markers or service-role JWTs. Built assets were checked for known privileged values and credential markers; the expected public anon configuration is not a privileged secret. Values were never printed. This is a bounded scan, not exhaustive secret certification.
- Keep ignored environment/key files, build/dependency output, temporary files and local session state out of commits. Blocked foundation ADRs/contracts stay local; stage only reviewed frontend sources/tests, Slice 1 spec/ADR/dashboard contract and handover/register updates.
- The mandatory independent `code-security-reviewer` could not start: **provider 403**. Earlier BLOCK findings have implementation/regression corrections but **independent re-review remains NOT APPROVED**. Do not merge or label the slice stable, accepted or release-ready.
- Publication is a **review-pending feature-branch checkpoint only**, under the user's GitHub push request. Main and production are not changed. Phase 0 stays IN PROGRESS; TC-01–TC-40 are unchanged; TC-41–TC-46 remain PARTIAL. The known-value scan supplies partial AC-2.5 evidence, not full certification; the remaining coverage matrix and live/visual/CI/staging gaps still apply.
- No backend/schema/migration change, database cleanup, real payment, eTIMS submission, live mail or production deployment was performed in this closeout. Next: independent re-review plus uncovered acceptance evidence, then gate decision.
