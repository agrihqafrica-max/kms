# Operations Runbook — Kenya Motorcycle Spare Parts & Supply Chain Ecosystem

Status: SKELETON (REQ-009 / REQ-008 / REQ-010 baseline, 2026-11-19).
Sections marked **TODO** are not yet built. Nothing in this document claims an
operational capability that does not exist. Authority: Roadmap v2.0 §12,
Blueprint v2.0 §9/§11; decisions D-025 (backup) and D-026 (observability) in
`HANDOVER/06_CONTRADICTIONS_AND_DECISION_REGISTER.md`.

## 1. Environments

| Environment | Status | Backend | Frontend | Database |
|---|---|---|---|---|
| Local development | ACTIVE | `.venv` (Python 3.14), `uvicorn main:app` on 127.0.0.1:8000 | `frontend/` Vite dev server, 127.0.0.1:5173 | Live Supabase PostgreSQL via `DATABASE_URL` (transaction-isolated tests only) |
| Staging | TODO — does not exist | — | — | Staging DB decision belongs to solution-architect (REQ-009). Required before pilot release (Roadmap §12 staging gate: all critical workflows pass in staging). |
| Production | NOT DEPLOYED | — | — | The live Supabase project currently holds schema + RLS only; no real business data, no production deployment. Any production deployment requires explicit human approval (D-011 hard limits). |

Release path (Roadmap §12): development → staging → internal release → pilot
tenants → gradual rollout (tenant-stable cohorts) → general availability →
flag retirement. Each stage advances only on its documented exit evidence;
feature flags deploy disabled by default (D-018). Rollback must not require
redeployment. **TODO:** feature-flag service and admin console not built.

## 2. Version control and CI

- Git repository initialised 2026-11-19, branch `main`, local only (no remote,
  no push — remote hosting decision pending). Baseline commit recorded in git log.
- CI: `.github/workflows/ci.yml` — backend (Python 3.12, `pip install -r
  requirements.txt`, `pytest tests/`) and frontend (Node 24, `npm ci`, lint,
  build) on push/PR.
- **CI cannot go green until** repository secret `DATABASE_URL` is configured
  pointing at a NON-PRODUCTION test database. The suite is DB-dependent
  (HANDOVER/05/11). No secret values are stored in the workflow.
- `requirements.txt` pinned to versions verified in `.venv` (2026-11-19).
- **TODO:** branch protection, required checks, release tagging, deployment
  jobs — all pending remote hosting and staging decisions.

## 3. Secret inventory (NAMES ONLY — values never documented)

| Name | Where used | Storage | Notes |
|---|---|---|---|
| `DATABASE_URL` | `database.py`, asyncpg utilities, tests | `.env.local` (git-ignored); CI: GitHub Actions secret (TODO: configure) | Live credential. Never print, log, or commit. |
| `SUPABASE_URL` | `auth.py` (JWKS/issuer) | Optional env; derived from `DATABASE_URL` if unset | Not a secret per se; project URL. |
| `SUPABASE_JWT_SECRET` | `auth.py` HS256 legacy path | MUST NOT be set in production. `tests/conftest.py` sets a synthetic test-only value. | Production uses JWKS (ES256). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (planned names) | Frontend auth client (TODO: not built) | Frontend env, public anon key only | Never place service-role keys in frontend config (HANDOVER/09). |
| Supabase service-role key | Not used by application code | Owner-held only | Never in repo, logs, or chat. |

Rules: secrets live in `.env.local` or a secrets manager; per-environment
isolation; rotate on exposure or staff change; redact before sharing any log.
**TODO:** secrets manager selection, rotation schedule, CI secret provisioning.

## 4. Backup and restore (D-025, REQ-010)

Current posture: Supabase-managed backups assumed available but **entitlement
UNVERIFIED** — verifying the plan's backup/PITR entitlement in the Supabase
dashboard is an OWNER ACTION (flagged, not assumed; OQ-14).

Logical backup procedure (outline — **TODO: not yet executed or scripted**):
1. Owner retrieves a read-only connection credential for the backup window.
2. `pg_dump` (logical, custom format `-Fc`) of the application schemas to an
   encrypted, access-controlled off-host location. Never dump `auth` schema
   secrets into shared storage.
3. Record dump checksum, size, timestamp, and schema version in a backup log.
4. Retention and frequency: **TODO** — define RPO/RTO with product owner.

Restore drill (required before pilot release, Roadmap §12):
1. Restore the latest dump into a LOCAL or non-production PostgreSQL target
   (`pg_restore` into a fresh database). Never restore over the live DB.
2. Verify table counts, RLS policies, functions, and triggers against
   `docs/architecture/live-schema-audit-2026-11-19.md`.
3. Run the transaction-isolated test suite against the restored target.
4. Record drill evidence (date, duration = measured RTO, data freshness = RPO)
   in `HANDOVER/05_TESTING_AND_ACCEPTANCE_LEDGER.md`.
No destructive operation on the live database is permitted at any step.

## 5. Monitoring and alerting (D-026, REQ-008)

Plan: structured JSON logs + lightweight metrics endpoint + alert rules; no
third-party dependency (D-026). **TODO: none of this is implemented yet.**

| Signal | Default threshold (configurable) | Status |
|---|---|---|
| API 5xx rate | > 1% over 5 min → alert | TODO |
| API latency p95 | > 2 s → alert | TODO |
| Offline sync lag | > 15 min → alert | TODO (sync engine not built) |
| Dead-letter queue | any item (> 0) → alert | TODO (queue not built) |
| Integration failures / queue depth | per-integration policy | TODO (no integrations live) |

Dashboard targets: error rate, API latency, queue depth, sync lag, integration
failures, active tenants (Blueprint §11; Roadmap §11.5 integration dashboard).
Acceptance (REQ-008): injected error/latency/backlog must trigger an alert
within threshold; platform health report renders real values.
**TODO:** metrics endpoint, log schema, alert delivery channel, dashboards.

## 6. Integrations (Blueprint §9, Roadmap §11.5)

No external integration is live (HANDOVER/09). Each integration, before
enablement, must define: auth, data mapping, failure handling, retry policy,
reconciliation, and health status in the integration registry.

- KRA eTIMS VSCU: sandbox + certification first; async submission queue;
  invoice lifecycle (created/queued/submitted/accepted/rejected/retried/
  cancelled/manually resolved). Live submission requires explicit human
  approval. **TODO — Phase 6.**
- M-Pesa/Daraja: sandbox only in Phase 1 (manual reference capture per D-013);
  STK/webhooks/reconciliation Phase 6. Live payment/payout requires explicit
  owner approval. **TODO.**
- WhatsApp/SMS/email: provider credentials + consent infrastructure + template
  management first; external sends sandbox/mock until human-gated (D-017).
  **TODO.**
- Cross-cutting (**TODO**): webhook receiver with signature verification,
  replay protection, idempotency, dead-letter handling; reconciliation engine
  for payments, eTIMS, stock movements, deliveries, referrals, settlements.

## 7. Incident communication (outline)

**TODO: formalise.** interim path:
1. Detect (alert per §5, or user report) → log incident with timestamp, scope,
   affected tenants.
2. Contain: feature-flag disable (once flags exist) or service stop; never
   destructive DB actions; no live external sends during mitigation.
3. Communicate: devops-integration-engineer → release-manager → product owner;
   tenant-facing notices only through approved channels with human approval.
4. Resolve, verify reconciliation (ledger/stock integrity), record evidence in
   HANDOVER, post-incident review.
Escalation contacts and on-call rota: **TODO — owner to provide.**

## 8. Known gaps / risks (as of 2026-11-19)

- No remote repository; CI workflow exists but has never executed on a runner.
- CI backend job blocked on `DATABASE_URL` secret + non-production test DB.
- No staging environment; tests run against the live Supabase DB
  (transaction-isolated) — acceptable interim, must change before pilot.
- Backup entitlement unverified (owner dashboard action); no restore drill yet.
- Monitoring, feature flags, integrations: not built (see TODOs above).
- Stray local files left untracked pending frontend-engineer review:
  `frontend/src/App.jsx.tmp` (0 bytes), `frontend/src/index.css.new`,
  `inspect_schema.tmp` (0 bytes).