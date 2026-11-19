# 09 — Environment and Dependencies

## Required environment variables
- `DATABASE_URL`: Supabase PostgreSQL connection string used by SQLAlchemy and asyncpg utilities.
- Future frontend variables should be namespaced for Supabase URL and public anonymous key only. Do not add service-role keys to frontend configuration.

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
