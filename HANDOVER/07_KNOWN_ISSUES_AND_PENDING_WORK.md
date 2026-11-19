# 07 — Known Issues and Pending Work

## Critical
1. ~~No actual Supabase Auth sign-in/JWT propagation exists in FastAPI or frontend.~~ Backend JWT verification and user-scoped sessions implemented 2026-11-19 (AUTH-01); frontend sign-in flow still missing.
2. ~~Direct database connection can undermine RLS if user identity is not set on the session.~~ Resolved for protected routes: every request runs as `authenticated` with transaction-local JWT claims (see 03). `/health/db` still uses the unscoped `get_db` (read-only health check).
3. No real organization/member/branch data exists, so end-to-end workflows are unverified.
4. Frontend has demo metrics and demo POS products.
5. No complete repository migration history is recorded locally.

## Backend
- ~~Organization registration endpoint converts some database errors to generic HTTP 500.~~ Central DBAPIError handler maps sqlstates to 400/403/409/422; unknown errors return a generic 500 without internal detail.
- POS route has prevalidation but also RPC enforcement; JSON payment keys and RPC returns need integration tests. AUTH-01 added a signed-JWT cashier checkout test (stock decrement, server-side cashier attribution, discount restriction).
- ~~Inventory route directly queries but writes through RPC; hidden unit-cost access should be verified.~~ Verified: `authenticated` cannot select `unit_cost`; list/POS queries select granted columns only; costs use `get_inventory_cost()` (view_finance-gated).
- ~~Finance direct SQL routes do not consistently call permission helper/RPC.~~ Expenses/EOD/dashboard now enforce `manage_expenses`/`manage_finance`/`view_finance`/`approve` with tenant-scoped payloads.
- ~~No authentication dependency decodes Supabase JWT or sets user identity.~~ Implemented (`auth.py`, `tenant.py`, `database.user_scoped_session`).
- Session revocation is not checked per request beyond `auth.users` existence/ban state; a revoked refresh session's access token remains valid until expiry (Supabase access tokens are short-lived). Documented limitation.
- ~~Committed AUTH01 test leftovers from a harness bug remain in the live database (see 06 C-008); purge awaits explicit approval because the append-only audit trigger blocks deletion cascades.~~ Purged 2026-11-19 with explicit approval (see 06 C-008 resolved); all public application tables and auth.users at 0 rows.

## Frontend
- No login/registration flow.
- No API client abstraction, loading/error state architecture, or React Router.
- Hard-coded API URL should become environment configuration.
- POS cart is not implemented.
- Inventory/radar/finance/dispatch pages are placeholders.
- Dashboard CSS contains legacy/template and nested syntax that should be reviewed across browsers.
- Frontend must send `Authorization: Bearer <access token>` and, when needed, `X-Organization-Id`/`X-Branch-Id`; handle 401 (re-auth), 403 (denied), 409 organization-selection payload.

## Database
- Live exact constraint and trigger definitions require a targeted audit.
- 84 unused indexes were reported historically; usage must be reassessed with real data.
- Composite foreign-key query in handover should not be relied on as exact relationship evidence without constraint validation.
- 32 public tables are RLS-enabled, but every policy needs role-specific integration testing.
- ORM models still omit some live columns/tables (C-006). AUTH-01 added `users.auth_user_id` and radar `status` server defaults; SQLAlchemy inserts explicit NULL for columns without a declared default, so any future ORM insert relying on a DB default must declare `server_default` in the model.

## Testing
- AUTH-01 suites executed 2026-11-19 (see 05/11 for actual results). TC-05 onward still lack execution evidence except where noted.
- ~~`test_tc01_transaction.py` is a written test but not a confirmed passing test.~~ Fixed and executed (see 05).
- Test harness: write tests join one outer transaction via savepoints and roll back; read-only concurrency/cancellation tests use committed fixtures on non-audited tables and delete them afterwards. Never use `async with conn.begin():` for rollback fixtures — it commits on clean exit.
- No CI pipeline or coverage report; pytest runs against the live Supabase database (tests are transaction-isolated).
- Frontend build was verified once in prior work; rebuild should be repeated in takeover.

## External integrations
M-Pesa, WhatsApp, OCR, AI, eTIMS/KRA, QR/POD, notifications, payroll, and storage uploads are not verified as implemented.
