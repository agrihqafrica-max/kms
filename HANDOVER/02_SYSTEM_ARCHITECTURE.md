# 02 — System Architecture

## High-level architecture
```text
React/Vite browser UI
        |
        | HTTP local or deployed API origin
        v
FastAPI/Uvicorn routers
        |
        | SQLAlchemy async / asyncpg
        v
Supabase PostgreSQL
  - public application tables
  - Auth JWT and membership helpers
  - RLS policies
  - SECURITY DEFINER RPC functions
```

## Backend
- `database.py` loads `.env` and `.env.local`, creates SQLAlchemy async engine with NullPool and disabled asyncpg statement cache; `user_scoped_session` binds each request transaction to the verified JWT subject as `authenticated`.
- `auth.py` verifies Supabase access tokens (JWKS ES256/RS256; HS256 only when explicitly configured) and exposes `get_current_identity` / `get_user_db` dependencies.
- `tenant.py` resolves organization/branch from verified memberships (`X-Organization-Id`/`X-Branch-Id` selection, 409 when ambiguous) and enforces payload/query scope.
- `main.py` registers auth, POS, inventory, finance, radar, and organizations routers, enables local CORS, and maps database sqlstates to HTTP responses without leaking internals.
- `core_rbac.py` exposes shared permission enforcement; denials raise `TenantDenial` and are audited in a fresh transaction after rollback.
- Business RPC calls are used for POS, inventory creation/costs, registration, and reporting; staff attribution is resolved server-side from `users.auth_user_id`.

## Frontend
- Single React component controls page navigation without a router library.
- Overview, POS, inventory, radar, finance, and dispatch sections are present in one page component.
- Overview sales and chart values are frontend demo values.
- POS products are static demo products and do not yet drive the backend checkout end-to-end.
- No Supabase Auth client or login flow is present; backend now requires `Authorization: Bearer` on protected routes.

## Database
- 32 public base tables, 32 RLS-enabled tables, 73 public RLS policies, 30 public functions, 12 triggers, and 0 storage buckets were live-audited.
- Public application tables were empty at audit time except AUTH01 test leftovers (06 C-008).
- Live migration-added objects include memberships, inventory movements, sales payments/returns, procurement, transfers, customers, and suppliers.
- `authenticated` holds column-level grants on `users` and `branch_inventory` (unit_cost excluded); cost visibility flows through SECURITY DEFINER RPCs.

## Architectural risks
- Frontend organization/branch identifiers are not yet established through verified authenticated sessions (backend enforcement exists; frontend integration pending).
- ~~Direct database URLs and service privileges could bypass application boundaries if reused incorrectly.~~ Mitigated for protected routes by per-request `SET LOCAL ROLE authenticated` + transaction-local claims; unscoped `get_db` remains only for the health check.
- Models cover the original/later schema inconsistently and should be validated against live columns before ORM use; columns relying on DB defaults must declare `server_default` (SQLAlchemy inserts explicit NULL otherwise).
- No migration framework or migration ledger is present locally; migration files 001–003 coexist as standalone SQL, while many earlier live migrations have no local files.
