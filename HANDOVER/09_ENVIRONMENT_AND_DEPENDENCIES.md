# 09 — Environment and Dependencies

## Required environment variables
- `DATABASE_URL`: Supabase PostgreSQL connection string used by SQLAlchemy and asyncpg utilities.
- Frontend requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL`; missing/unsafe values show a configuration error. Set values locally, never in source or handover. Do not add service-role keys to frontend configuration. `frontend/.env*` is ignored, including examples; do not force-add them.
- Frontend uses Supabase JS v2 and React Router v7. Verify with `npm --prefix frontend test`, `npm --prefix frontend run lint`, and `npm --prefix frontend run build`.
- Browser fixtures must intercept requests before application modules load because the API client captures fetch at creation. Install the fixture through the browser navigation init script, then run `runBrowserChecks()`; installing it after load does not isolate API calls. The fixture is not a general network sandbox.

## Optional backend auth variables (AUTH-01)
- `SUPABASE_URL`: project URL used to build the JWT issuer and JWKS endpoint. If unset, it is derived from the `DATABASE_URL` username (`postgres.<project-ref>` → `https://<project-ref>.supabase.co`).
- `SUPABASE_JWT_SECRET`: enables HS256 verification ONLY when explicitly set. Production uses the project JWKS (ES256) and must not set this. The test suite sets a test-only value in `tests/conftest.py`; it is not a real project secret.
- New dependencies: `pyjwt[crypto]`, `cryptography`, `httpx`, `pytest` (see requirements.txt).

## Secret storage
The active `.env.local` is ignored by Git patterns. Its contents must never be documented or committed. The handover contains no secret values.

## Backend installation
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Backend run:
```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

## Frontend installation
```powershell
npm --prefix frontend install
npm --prefix frontend run dev -- --host 127.0.0.1
```

Frontend build:
```powershell
npm --prefix frontend run build
```

## Ports
- FastAPI: 127.0.0.1:8000
- Vite: 127.0.0.1:5173
- Swagger: 127.0.0.1:8000/docs

## External services
- Supabase PostgreSQL and Auth.
- No verified M-Pesa, WhatsApp, OCR, AI, KRA/eTIMS, or QR integrations are present.

## Delivery pipeline baseline (REQ-009, devops-integration-engineer, 2026-11-19)
- Git repository initialised (branch `main`, local only; no remote, no push). Comprehensive `.gitignore` verified with `git check-ignore` (`.env.local`, `.venv`, `node_modules`, caches, strays excluded); no secret staged or committed.
- CI workflow added: `.github/workflows/ci.yml` (backend pytest + frontend lint/build). Backend job BLOCKED until repository secret `DATABASE_URL` is configured against a non-production test DB; workflow has not yet run on a hosted runner.
- `requirements.txt` pinned to versions verified installed in `.venv` via `pip show` (fastapi 0.164.0, uvicorn 0.54.0, sqlalchemy 2.1.9, asyncpg 0.32.0, pydantic 2.14.3, python-dotenv 1.2.4, pyjwt 2.15.1, cryptography 50.0.2, httpx 0.28.1, pytest 9.2.0). pytest-asyncio not required (synchronous tests using asyncio.run).
- Ops runbook skeleton: `docs/ops/RUNBOOK.md` (environments, secret names, D-025 backup/restore outline, D-026 monitoring thresholds, incident outline; unbuilt capabilities marked TODO).
- Local evidence 2026-11-19: `npm run build` PASS (4.30s), `npm run lint` PASS (0 warnings/0 errors), `pytest --collect-only -q tests/` → 44 tests collected (collection only; full suite not re-run).
- Stray files left on disk, untracked, pending frontend-engineer review: `frontend/src/App.jsx.tmp` (0 bytes), `frontend/src/index.css.new`, `inspect_schema.tmp` (0 bytes).
