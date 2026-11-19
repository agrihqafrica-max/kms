# 01 — Project Overview

## Project
Kenya Motorcycle Spare Parts & Supply Chain Ecosystem.

## Sources
- `MASTER PRODUCT REQUIREMENTS DOCUMENT.pdf` — 5-page Stage 1 product requirements.
- `MASTER TEST SUITE.pdf` — 40 test cases, TC-01 through TC-40.
- `supabase.txt` — Supabase schema/report snapshot and recommendations.
- Live Supabase metadata audit — verified on 2026-11-19.

## Runtime
- Backend: Python, FastAPI, Uvicorn, SQLAlchemy async, asyncpg, Pydantic, python-dotenv.
- Frontend: React 19, Vite 8, CSS, browser SPA.
- Database: Supabase-hosted PostgreSQL; Supabase Auth and RLS are in use.
- Package managers: `pip`/`venv` and npm.

## Entry points
- Backend: `main.py` → FastAPI application.
- Frontend: `frontend/src/main.jsx` → `frontend/src/App.jsx`.
- Database connection: `database.py`.
- Models: `models.py`.
- Validation: `schemas.py`.
- Routers: `routers/pos.py`, `inventory.py`, `finance.py`, `radar.py`, `organizations.py`.

## Development state
Backend modules exist with historical AUTH-01 evidence. Frontend auth, tenant selection and read-only API views are implemented with local/fixture verification (HANDOVER/05); independent security re-review and live browser acceptance remain open. Most business workflows are still unimplemented or untested; Phase 0 is not closed.

## Git status
Git was absent at the original audit but is now initialized; the frontend continuation is on `work/phase0-auth-bootstrap`. Publication is a review-pending feature-branch checkpoint, not a release (D-033).
