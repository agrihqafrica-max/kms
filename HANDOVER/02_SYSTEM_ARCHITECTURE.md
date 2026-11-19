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
- React Router provides guarded auth/tenant routes and lazy-loaded pages.
- Supabase Auth handles sign-in, sign-up and recovery; AuthProvider coordinates in-flight authentication and verified local sign-out across route changes.
- The API client reads the current bearer token, applies membership-derived tenant headers, bounds 401 refresh/replay and invalidates stale account/tenant responses.
- Overview, POS item search and Parts Radar read API endpoints; unavailable metrics remain explicit. Checkout is disabled; Inventory/Finance/Dispatch workflow pages remain placeholders.
- Local tests and intercepted browser scenarios verify client behavior only. Independent security re-review and live Supabase browser/RLS acceptance are outstanding (05).

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
