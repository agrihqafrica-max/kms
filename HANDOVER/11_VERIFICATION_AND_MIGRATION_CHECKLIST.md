# 11 — Verification and Migration Checklist

## Safe baseline verification
- [x] Read all handover documents.
- [x] Confirm project root and source-tree inventory.
- [x] Run `python -m pytest -q tests/test_tc01.py tests/test_tc01_api.py`. (6 passed, 2026-11-19 regression)
- [x] Run `python -m pytest -q tests/test_tc02.py`. (6 passed, 2026-11-19 regression)
- [x] Run `python -m pytest -q tests/test_tc03.py`. (4 passed, 2026-11-19 regression)
- [x] Run `npm --prefix frontend run build`. (2026-11-19 Slice 1 continuation: Vite 8.3.8 build passed; 21 frontend tests passed, lint 0 warnings/errors; 18 fixture browser groups passed. Independent security and live acceptance remain open; see 05.)
- [ ] Run backend health endpoint. (not re-run during AUTH-01; handler detail made generic)
- [x] Run read-only Supabase table, RLS, policy, trigger, and function metadata queries. (grants, policies, triggers, RPC definitions re-verified 2026-11-19)

## AUTH-01 verification (2026-11-19)
- [x] Full regression `python -m pytest -q tests/` → 44 passed, 0 failed (347.78s), live database.
- [x] JWT verification matrix (15 tests) incl. ES256 via JWKS, alg-none/service-role rejection.
- [x] 401 matrix over all protected routes; OpenAPI bearer security; function-scope teardown wiring.
- [x] Tenant selection matrix incl. multi-org 409 and audited denials.
- [x] TC-04 branch isolation incl. interleaved cross-tenant requests.
- [x] Session lifecycle: binding, rollback after forced failure, commit attribution, 12-way concurrency, cancellation cleanup.
- [x] Authenticated registration end-to-end (org + membership + audit).
- [x] Finance/radar authorization matrix incl. EOD approval separation and duplicate 409.
- [x] Post-run inspection: no new committed test rows (write tests rolled back; committed read-only fixtures deleted).
- [x] Purge of pre-existing committed AUTH01 leftovers (2 orgs / 7 auth users / 9 audit rows from harness bug, see 06 C-008) — approved and executed 2026-11-19; exact-ID single-transaction delete, append-only trigger disabled transaction-locally and re-enabled before commit; post-purge all tables 0 rows, trigger enabled.

## Migration verification
- [ ] Verify migration SQL is saved and applied only after live review.
- [x] Compare live table columns against migration and models. (AUTH-01: users.auth_user_id mapped; radar status server defaults declared; unit_cost column-grant design confirmed)
- [ ] Verify constraints and indexes are not conflicting.
- [x] Verify RLS helper functions use `auth.uid()` and no legacy GUC-only policy remains.
- [ ] Verify rollback SQL or disable procedure exists for side-effecting changes. (AUTH-01 made no schema changes; model-only fixes)
- [x] Confirm no real data is deleted or modified during testing. (transaction-isolated; leftovers documented in 06 C-008)

## Handover completion
- [x] 11 handover documents exist.
- [x] `AGENTS.md` exists.
- [x] Secrets excluded.
- [x] Git limitation recorded.
- [x] Database state verified against live metadata.
- [x] Test ledger recorded without overstating PASS status.
- [x] Next development task actionable and approved before execution.
