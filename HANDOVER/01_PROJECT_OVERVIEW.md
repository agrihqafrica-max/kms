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
Backend modules and a dashboard shell exist. The live database is extensively provisioned. User-facing data is largely not integrated, Auth sign-in is absent, and most PRD/test-suite workflows remain unimplemented or untested.

## Git limitation
No `.git` directory was present at repository root. Current Git branch, history, and uncommitted diff could not be verified.
