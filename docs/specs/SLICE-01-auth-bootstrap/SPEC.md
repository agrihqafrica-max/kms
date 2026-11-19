# SPEC — SLICE-01: Frontend Auth + API-Client Bootstrap

| Field | Value |
|---|---|
| Feature ID | SLICE-01-auth-bootstrap |
| Spec version | 1.0 — **APPROVED** by release-manager 2026-11-19 under D-011 delegation (see §16) |
| Author | product-specification-architect |
| Date | November 2026 |
| Roadmap phase | Phase 0 — Platform Foundation (RM §2.1, p3) |
| Requirements | REQ-001, REQ-002, REQ-005, REQ-006 (REQUIREMENT_REGISTER §2.1, §9 slice 1) |
| Binding business rules | BR-011 (cost visibility), BR-013 (tenant boundary), BR-015 (material-action confirmation), BR-017 (flag safety — sequencing note §1.3) |
| Binding decisions | D-001, D-003, D-004, D-007, D-011, D-012, D-024, D-027 (HANDOVER/06) |
| Contradictions addressed | C-003 (demo values — closed by this slice), C-012 (credentials — resolved by D-012), C-004/C-007 (browser legs remain untested until QA executes) |
| Backend baseline | AUTH-01 COMPLETE, 44/44 regression (HANDOVER/05, D-010). **No backend or database changes in this slice.** |

Citation shorthand: **BP** = `docs/Master_Ecosystem_Blueprint.pdf` v2.0 (extract: `docs/reference-text/Master_Ecosystem_Blueprint_v2.0.extracted.txt`; PDF wins). **RM** = `docs/Phased_Implementation_Roadmap.pdf` v2.0 (extract likewise). **RR** = `docs/requirements/REQUIREMENT_REGISTER.md`. **H0n** = `HANDOVER/0n_*.md`. Backend contracts below were extracted by direct read of the cited source files, not from handover prose.

> Register status note: RR header still says "DRAFT v0.1", but H06 (release-manager decisions block, 2026-11-19) declares the register FINALISED v1.0 with OQ-01…OQ-16 resolved as D-012…D-027. This spec treats D-012…D-027 as binding. The stale RR header is an editorial refresh for the release-manager / raw-information-interpreter; it is not a product contradiction and blocks nothing here.

---

## 1. Scope

### 1.1 In scope

1. **REQ-001** — Supabase Auth client in the React frontend: sign-in, session persistence, automatic token refresh, 401 → one silent refresh → re-auth; `Authorization: Bearer <access token>` on every protected API call.
2. **REQ-002 (per D-012)** — Launch credentials = **Supabase email + password**: sign-up, sign-in, password reset/recovery. Phone OTP is deferred until an SMS provider is approved (BP §4.1 preference recorded as future direction). Supabase Auth is the credential authority; **no credentials are stored in application tables** (C-012 resolved).
3. **REQ-005** — Organization/branch selection UX: multi-org picker (409 payload and `/auth/me` `context:null`), `X-Organization-Id` / `X-Branch-Id` headers, persisted selection, org/branch switcher in the app shell, clear 403 permission-denied states.
4. **REQ-006** — API-client abstraction: env-configured base URL (replaces the hard-coded `http://127.0.0.1:8000` in `frontend/src/App.jsx:4`), central 401/403/409 handling, loading/empty/error states, and replacement of **all** demo dashboard values and static demo POS products with live API data or honest empty/error/unavailable states (C-003).

### 1.2 Out of scope (explicit exclusions — do not implement here)

| Item | Owner slice | Note |
|---|---|---|
| Organisation onboarding wizard, first-owner bootstrap UI (`POST /organizations/register` consumption) | Slice 2 (REQ-003) | Contract documented in §6.4 for reference only. First-run screen points to it honestly (§4.8). |
| Staff invitation / role & branch assignment UI, approval-limit attributes | Slice 2 (REQ-004, D-024) | |
| Feature flags | Slice 3 (REQ-007, D-018) | See §1.3. |
| Git/CI, observability, staging, backup drill | Slice 3 (REQ-008/009/010) | |
| Idempotency framework, device enrolment, sync contract | Slice 4 (REQ-012/013/022) | |
| POS cart, checkout, payments, receipts, discounts | Slice 5 (REQ-026…029/036) | Slice 1 shows **live item data only**; checkout control is visibly disabled (§5.3). |
| Offline PWA, outbox, local store, offline trading | Slice 6 (REQ-020/021/024/025/041) | Slice 1 shows an **offline banner only** (§5.5). No offline write capability is specified or implied. |
| Sync reconciliation, conflict policy execution | Slice 7 (REQ-022/023) | |
| Returns/refunds, notification service, external receipt channels | Slice 8 (REQ-030/016/037) | |
| Reports service, exports, localisation completion (SW review) | Slice 10 (REQ-038/040) | i18n **scaffolding** is in scope per D-027 (§9). |
| Phone OTP / passwordless / device trust / security notifications | Later (REQ-014, BP §4.1) | D-012 deferral; Supabase-managed auth emails only (§8). |
| Any backend, migration, RLS, or Supabase project-schema change | — | AUTH-01 is verified; gaps found are listed in §11, not redesigned. |

### 1.3 BR-017 sequencing note

BR-017 requires new capabilities to deploy behind flags, disabled by default. The flag framework (REQ-007) does not exist yet and is slice 3, which the approved backlog (RR §9) sequences **after** slice 1. Slice 1 is therefore the approved bootstrap exception: it ships as the application baseline (replacing a demo-only SPA), not as a tenant-facing new capability. From slice 3 onward BR-017 applies to every new capability. This sequencing is per the approved register, not an invented exemption.

---

## 2. Traceability

| REQ | Requirement (RR §2.1) | Stories | Acceptance criteria | Existing TC hooks (H05) | Proposed new TC IDs (§10.3) |
|---|---|---|---|---|---|
| REQ-001 | Browser auth bootstrap, session, refresh, bearer | US-S1-01, US-S1-02, US-S1-06 | AC-1.1 … AC-1.7 | TC-01/TC-02 browser legs (currently untested) | TC-41 |
| REQ-002 | Launch credential method (D-012: email+password) | US-S1-03, US-S1-04 | AC-2.1 … AC-2.6 | TC-05 re-scoped per D-012/C-012; TC-01 browser leg (sign-up only) | TC-44 |
| REQ-005 | Org/branch selection UX, headers, 403 clarity | US-S1-05, US-S1-07 | AC-5.1 … AC-5.8 | TC-02/TC-04 browser legs; TC-39 (API, already PASS — not re-run/renumbered) | TC-42 |
| REQ-006 | API client, env URL, states, demo replacement | US-S1-08, US-S1-09 | AC-6.1 … AC-6.9 | TC-02 browser leg (cashier dashboard denial); C-003 closure evidence | TC-43 |
| Cross-cutting (NFR/security/first-run) | BP §10/§11; D-004/D-024/D-027 | US-S1-10 | AC-7.1 … AC-7.7 | TC-01 browser leg (first-run); TC-05 re-scoped (secrets leg) | TC-45, TC-46 |

Every AC in §10 is Given/When/Then, observable, and mapped to a test. **No AC in this document claims an executed result.** QA registers proposed TC IDs in `HANDOVER/05_TESTING_AND_ACCEPTANCE_LEDGER.md` before execution; existing TC-01…TC-40 IDs are never renumbered (AGENTS.md).

---

## 3. Epics and user stories

Epic E1 — "I can sign in and stay signed in" (REQ-001/002; RM §2.1; BP §4.1).
Epic E2 — "I work in the right shop and branch, and I can switch" (REQ-005; RM §2.1; BP §7.1, D-001).
Epic E3 — "Every number I see is real" (REQ-006; RM §2.1/§2.5; C-003; BP §2.3 trust principle).

Roles at launch per D-024: owner, manager, cashier, accountant (storekeeper = Phase 2; platform_admin = console slice). Stories are expressed from those users' perspectives; all are Phase 0.

| ID | Story | REQ links | Epic |
|---|---|---|---|
| US-S1-01 | As a **cashier**, I can sign in with my email and password and land on my counter workspace, so that I start selling without an admin. | REQ-001/002 | E1 |
| US-S1-02 | As an **owner**, my session survives a browser reload and refreshes silently, so that I am not logged out mid-day; when refresh is impossible I am asked to sign in again with a clear message. | REQ-001 | E1 |
| US-S1-03 | As a **new owner**, I can create my account with email+password and verify my email, so that I have a secure identity before registering my business (business registration itself is slice 2). | REQ-002 | E1 |
| US-S1-04 | As **any staff member**, I can reset my password by email and set a new one, so that I recover access without calling support. | REQ-002 (recovery leg of REQ-014) | E1 |
| US-S1-05 | As a **manager who belongs to two businesses**, I am asked which organisation I am working in, I pick one, and the app remembers it, so that I never see the wrong shop's data. | REQ-005 | E2 |
| US-S1-06 | As **any staff member**, I can sign out and know my session and shop selection are cleared on this device. | REQ-001/005 | E1/E2 |
| US-S1-07 | As a **branch manager**, when I try to open a branch I do not belong to, I get a clear "permission denied" explanation and a way to choose another branch — never a blank screen or silent failure. | REQ-005; BR-013 | E2 |
| US-S1-08 | As an **owner**, my dashboard shows today's real sales/profit figures from the API (or honest zeros / "not yet available"), so that I trust the numbers without an analyst. | REQ-006; BP §10.1 | E3 |
| US-S1-09 | As a **cashier**, my POS screen lists our real items with selling price and stock only, so that I never see buying costs and never see fabricated products. | REQ-006; BR-011 | E3 |
| US-S1-10 | As a **newly signed-up user with no organisation yet**, I see an honest "no organisation yet" screen telling me what happens next, instead of a fake dashboard. | REQ-001/006; D-004/D-024 | E3 |

---

## 4. User workflows

### 4.1 Sign-up (REQ-002, D-012)

1. User opens `/signup`, enters email + password (+ confirm password).
2. Client validates format and password length against the configured Supabase policy (default minimum 6; the project's actual setting must be verified during design — §11 GAP-04) **before** any network call.
3. Submit button disables while pending (duplicate-submission guard, §7 E11).
4. Client calls `supabase.auth.signUp({ email, password })`.
5. **Branch A — session returned** (email confirmation disabled): proceed to first-run resolution (§4.8). A new auth user has zero memberships → "no organisation yet" screen.
6. **Branch B — no session, confirmation required**: show "Check your email" state naming the address, with "Back to sign-in". No session exists; no protected call is made.
7. Supabase error (e.g. user already registered, rate limit): show the provider's message in readable form; never reveal whether an account exists beyond what Supabase itself returns; form stays usable.
8. **No application-table write occurs.** Sign-up creates only `auth.users` (Supabase-managed). `public.users` is never auto-provisioned (D-004); staff linkage is an explicit owner action in slice 2 (D-024).

### 4.2 Sign-in (REQ-001)

1. User opens `/signin` (unauthenticated deep links redirect here, preserving the intended destination).
2. Enter email + password → `supabase.auth.signInWithPassword`.
3. On success: supabase-js persists the session; `AuthProvider` fetches `GET /auth/me` **without** tenant headers first, then with any persisted selection that validates against the returned memberships (§4.5).
4. Route by memberships/context:
   - `context != null` → app shell (§5.2), intended destination restored.
   - `context == null` and ≥2 distinct organisations → organisation picker (§4.5).
   - `memberships == []` → "no organisation yet" (§4.8).
5. Invalid credentials → readable "Invalid email or password" error; no session; no redirect loop.
6. Suspended/deleted auth user: backend returns 401 (`database.py:59-64`); client treats as refresh-failed (§4.4 step 4) with the server detail shown at sign-in.

### 4.3 Password reset (REQ-002; recovery leg only — REQ-014 notifications are later)

1. `/reset-password`: user enters email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/update-password })`.
2. UI **always** shows the same generic confirmation ("If an account exists for this address, a reset link has been sent") regardless of outcome, except provider rate-limit errors which are shown honestly. No account enumeration.
3. User opens the email link → Supabase redirects to `/update-password` with a recovery session; `onAuthStateChange` fires `PASSWORD_RECOVERY`.
4. `/update-password` requires the recovery session (guard: without it, redirect to `/reset-password` with an explanatory message). User enters new password + confirm → `supabase.auth.updateUser({ password })`.
5. On success: confirmation state, then sign-out of the recovery session and redirect to `/signin` ("Password updated — sign in with your new password"). New password works; old password fails (AC-2.4).
6. Expired/invalid recovery link → honest "Link expired or invalid — request a new one" state with a link to `/reset-password`.

### 4.4 Session expiry / refresh (REQ-001; binding session-handling decision)

1. supabase-js (`autoRefreshToken: true`, `persistSession: true`) refreshes proactively; `onAuthStateChange` handles `TOKEN_REFRESHED`, `SIGNED_OUT`, `USER_UPDATED`.
2. The API client attaches the **current** access token at request time (never a token captured at module load).
3. On **401** from any protected call:
   a. Single-flight refresh: if a refresh is already in progress, await it; otherwise call `supabase.auth.refreshSession()` (or `getSession()` if the SDK already rotated the token).
   b. Retry the original request **exactly once** with the new token.
   c. If refresh fails or the retry is still 401 → clear local session and selection, redirect to `/signin` with "Your session has expired. Please sign in again." No further retries, no loop.
4. On **403**: never retry silently; render the permission-denied state (§5.4) with the server detail.
5. Known limitation (H07, documented, accepted): a revoked refresh session's access token remains valid until expiry; the backend additionally checks `auth.users` existence/ban per request (`database.py:55-64`). Slice 1 does not attempt to close this gap; short token TTL + the 401 path are the mitigation.

### 4.5 Organisation selection and switching (REQ-005, D-001)

1. After sign-in, `GET /auth/me` (no headers) returns `{user_id, email, memberships[], context}`. Single-organisation users get `context` auto-resolved (`routers/auth.py:33-48`); multi-org users get `context:null`.
2. Persisted selection (localStorage, namespaced per auth user id — §7.3) is applied **only if** the stored organisation id appears in the returned memberships; otherwise it is discarded (AC-5.7).
3. Multi-org with no valid selection → full-screen picker listing exactly the caller's organisations (name + role from the payload). No organisation is pre-selected.
4. On selection: persist, then re-fetch `/auth/me` with `X-Organization-Id`. If the selected organisation has multiple branch memberships or an org-wide membership, resolve branch per §4.6.
5. Any tenant-scoped call returning **409** with `detail.code == "organization_selection_required"` → show the picker populated from `detail.organizations` (the caller's own options, `tenant.py:85-93`); after selection, retry the original request once with headers.
6. Switcher (app shell, §5.2): changing organisation clears all cached tenant data, persists the new selection, re-fetches `/auth/me` and all visible screens. Changing branch persists and re-fetches branch-scoped data. Data from the previous tenant is never displayed after a switch (AC-5.5).
7. Sign-out clears the selection (§4.7).

### 4.6 Branch selection

1. Branch options come **only from the caller's memberships** for the selected organisation (`/auth/me` memberships carry `branch_id`, `role`; branch **names are not available** — §11 GAP-01).
2. Branch-scoped membership (`branch_id != null`) → that branch is the default; send `X-Branch-Id`.
3. Org-wide membership (`branch_id == null`, `org_wide: true`) → default "All branches (org-wide)": send `X-Organization-Id` only. Branch-required endpoints then return 400 (`tenant.py:134-138`); the UI shows "This action needs a branch" and offers the known branch options. If no branch is known (no branch membership rows, no enumeration endpoint — GAP-01), show the honest message: "Branch list is not available yet. Ask your owner to assign you to a branch, or try again in the next release." No fabricated branch list.
4. A selected branch outside membership scope → 403 + server audit (`tenant.py:100-103`); UI per §5.4 with "Choose another branch". A branch UUID not belonging to the organisation → 404 (`tenant.py:104-107`); UI shows "Branch not found in this organisation" and clears the stored branch.

### 4.7 Sign-out

1. User menu → "Sign out" → `supabase.auth.signOut()` (local session revoked; SDK clears its storage).
2. Client clears persisted org/branch selection and all in-memory tenant data.
3. Redirect to `/signin`. Protected deep links redirect back to `/signin`; browser Back does not re-display tenant data (screens re-fetch on mount and find no session).

### 4.8 First run — zero memberships (D-004 / D-024 honesty rule)

1. Authenticated user, `memberships: []` → dedicated screen: "You don't have an organisation yet."
2. Two honest paths, clearly labelled:
   - **"Register your business"** — labelled "Coming in the next release". It is a **disabled/informational placeholder**, not a working form: organisation registration (REQ-003) is slice 2. It must not call `POST /organizations/register` in this slice and must not pretend to succeed.
   - **"Invited by an owner?"** — explanatory text: your owner must add you as staff (slice 2, D-024); a "Check again" button re-fetches `/auth/me` so a user added mid-session can proceed without re-login.
3. Sign-out remains available. No dashboard, no demo numbers, no fake navigation (AC-7.1).

### 4.9 Membership revoked mid-session

1. Any call returns 403 "No active organization membership" (`tenant.py:71-72`) or 403 "Not a member of this organization" (`tenant.py:79-81`).
2. Client clears the stored selection, re-fetches `/auth/me` once without headers, and routes to picker (other memberships remain) or the §4.8 screen (none remain). The user is told plainly: "Your access to this organisation has changed." No silent retry against the revoked tenant (AC-5.7).

---

## 5. Screen and state inventory

Router: client-side routes (suggested `react-router-dom`). All `/app/*` routes are session-guarded; tenant-scoped screens additionally require a resolved context.

### 5.1 Auth screens (unauthenticated)

| Route | Screen | States |
|---|---|---|
| `/signin` | Email+password form; link to signup/reset | idle, submitting (button disabled), invalid-credentials error, session-expired notice (redirect reason), provider/rate-limit error |
| `/signup` | Email+password+confirm | idle, submitting, field validation errors, "check your email" success (Branch B), provider error |
| `/reset-password` | Email form | idle, submitting, generic confirmation, rate-limit error |
| `/update-password` | New password+confirm (recovery-session guarded) | idle, submitting, success, expired-link error, no-recovery-session redirect |
| `/select-organization` | Membership options picker (also rendered as interstitial on 409) | options list, selecting, error (with retry) |
| `/no-organization` | §4.8 first-run screen | static + "Check again" loading/error |

### 5.2 App shell (authenticated + context)

- **Top bar**: organisation name (from context), branch label (branch id shortened per GAP-01, or "All branches"), connectivity indicator fed by `GET /health/db` (ok / degraded / unreachable — honest, replaces the demo "Database live" dot), user menu (email from Supabase user, role from context, sign out).
- **Org/branch switcher**: organisations = caller's memberships; branches = §4.6 rules. Switching follows §4.5 step 6.
- **Navigation** (role-driven display, server-enforced security — §7.1): Overview (all roles; content differs by permission), Counter POS (all roles), Inventory / Parts Radar / Finance / Dispatch = honest placeholders (§5.6). Finance nav item hidden for roles without `view_finance` behaviour (cashier); hiding is UX only — the server remains the boundary.
- **Staff-link banner**: when `context.staff_user_id == null` (auth user has membership but no `public.users` row — D-004), show a persistent, dismissible-per-session banner: "Your staff profile is not linked yet. Ask your owner to complete your staff setup." The app stays usable for reads permitted by the role; the client never attempts to create a `public.users` row (AC-7.2).
- **Offline banner**: §5.5.

### 5.3 Authenticated screens wired to live data

| Screen | Data source (contract §6) | Behaviour |
|---|---|---|
| **Overview — stat cards** | `GET /finance/dashboard?start_date=<today>&end_date=<today>` (branch context required) | Render returned measures (at minimum `net_sales`, verified key). Zero rows → API zeros rendered as real zeros. Keys not returned (e.g. COGS-dependent profit — H04 known gap) → card reads "Not yet available", never a fabricated number. Cashier (403) → permission-denied panel (§5.4), no financial figures. Org-wide user without branch → branch-prompt state (§4.6.3). |
| **Overview — weekly revenue chart** | **No endpoint exists** (GAP-03) | Honest placeholder card: "Revenue trend is not available yet." No demo bars. |
| **Overview — Parts Radar card** | `GET /radar/requests` | Live org-scoped list (part_description, motorcycle_model, urgency_status, status, created_at); empty → "No open part requests"; error → error state with retry. |
| **Overview — latest sales table** | **No endpoint exists** (GAP-03) | Honest placeholder: "Recent sales list is not available yet." `demoSales` removed. |
| **Counter POS — item grid + search** | `GET /inventory/branches/{branch_id}?search=<q>` | Live items: `part_name`, `part_number`, `retail_price`, `stock_quantity` only (BR-011). Search input debounced, server-side `search` param. Empty branch → "No items in this branch yet." Loading skeleton while fetching. **Cart/checkout**: visibly disabled control labelled "Checkout arrives in a later release" — no fake totals, no fake VAT computation on demo items, no submit. Static demo product array removed. |
| **Inventory / Finance / Dispatch pages** | — | Honest placeholders (§5.6). |
| **Parts Radar page** | `GET /radar/requests` (read-only list, same contract as the card) | Live list or honest empty/error; **no create/quote actions** in this slice (later slices); no "Add new record" button that pretends to work. |

### 5.4 Permission-denied state (403)

Full-panel state: title "You don't have access to this", the server `detail` text in readable form, and context-appropriate actions: "Choose another branch" (branch denial), "Switch organisation" (org denial), "Back to Overview". Never auto-retries. Never displays partial tenant data alongside the denial.

### 5.5 Connectivity / offline banner (network loss only — NOT offline trading)

- Trigger: `navigator.onLine == false`, or a fetch fails with a network error (TypeError / abort), or `/health/db` unreachable.
- Persistent banner: "You are offline. Live data is unavailable." In-flight screens fall to error states with a Retry action; cached on-screen data is labelled stale ("Last loaded <time>") or cleared — never presented as current.
- On reconnect: banner clears, visible screens re-fetch.
- **No offline write, queue, or local trading capability exists or is implied** (slice 6, REQ-020/021/041). TC-12/TC-13 remain NOT IMPLEMENTED.

### 5.6 Honest placeholder pages

Inventory, Finance & EOD, Dispatch (and any unimplemented nav item): title + one-line description + explicit badge "Not yet available in this release". **No action buttons** (the current `SimplePage` "Add new record" button is removed — it implies non-existent functionality). AC-7.7.

### 5.7 Global states

| State | Trigger | Presentation |
|---|---|---|
| Loading | any in-flight fetch | skeleton/spinner within the affected card/screen; controls disabled while submitting |
| Empty | 200 with `[]` / zero measures | friendly empty message; zeros shown as real zeros where the API returned them |
| Error | 4xx/5xx/network | readable message (server `detail` when safe; generic otherwise), Retry button; never raw stack traces, SQL, or internals |
| 401 | expired/invalid token | §4.4 silent refresh → retry once → re-auth redirect |
| 403 | permission/tenant denial | §5.4, no retry |
| 409 (org selection) | `detail.code` marker | picker interstitial (§4.5.5) |
| 409 (other, e.g. duplicate) | string detail | readable conflict message (no org picker) |
| Configuration error | missing/invalid `VITE_*` env (§9.3) | full-screen "App is not configured" with the missing variable **names** (never values); no demo fallback, no partial app |
| Session expired | refresh failed | redirect `/signin` with notice |

---

## 6. API-client contract table (derived from actual routers)

### 6.1 Transport rules (all FastAPI calls)

- Base URL: `import.meta.env.VITE_API_BASE_URL` only. No hard-coded origin anywhere in `src/`.
- Auth: `Authorization: Bearer <current Supabase access token>` on every protected call. Token read at request time from supabase-js session.
- Tenant headers: `X-Organization-Id: <uuid>` and (when resolved) `X-Branch-Id: <uuid>` from the persisted, membership-validated selection. Values must be UUIDs; the client never sends IDs not present in `/auth/me` memberships/context (BR-013; server re-validates regardless — `tenant.py`).
- `Content-Type: application/json` on JSON requests. No cookies/credentials mode needed (bearer auth); backend CORS currently allows `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000` with all headers (`main.py:26-32`) — dev origins only; staging origin configuration is a slice-3 deployment note, not a slice-1 backend change.
- Central response interceptor implements §4.4 (401), §5.4 (403), §4.5.5 (409 marker), §5.5 (network). Money fields arrive as **strings** (e.g. `"7850.00"`); the client formats for display and never does floating-point arithmetic on them.

### 6.2 Endpoints consumed in slice 1

| # | Method & path | Auth / headers | Success shape | Error shapes | Source (verified by read) |
|---|---|---|---|---|---|
| 1 | `GET /health/db` | none | `{status:"ok", database:"connected", server_time:<ISO>}` | 503 `{detail:"Database connection failed"}`; network error | `main.py:67-82` |
| 2 | `GET /auth/me` | Bearer; optional `X-Organization-Id`/`X-Branch-Id` | 200 `{user_id:<uuid str>, email:<str|null>, memberships:[{organization_id, organization_name, branch_id:<uuid str|null>, role}], context: null | {organization_id, organization_name, branch_id, role, org_wide:<bool>, staff_user_id:<uuid str|null>}}` | 401 `{detail}` (+`WWW-Authenticate: Bearer`); 403 `{detail}` when a header selects a non-member org or no active membership; 400 malformed header UUID. **Never 409**: the route suppresses the selection 409 and returns `context:null` (`routers/auth.py:37-40`). Multi-org detection = `context==null && distinct orgs in memberships > 1`. | `routers/auth.py:14-49`; `auth.py`; `tenant.py:69-123` |
| 3 | `GET /finance/dashboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` (optional `branch_id`, `organization_id` query — client omits both and uses headers) | Bearer + tenant headers; **branch required** (header or membership); permission `view_finance` | 200 = JSON object returned by `get_dashboard_summary(org, branch, start, end)`; **`net_sales` key verified** (`tests/test_auth01_modules.py:68`); full key set undocumented locally → GAP-02; client renders known keys defensively, unknown/missing measures → "Not yet available" | 401; 403 `{detail}` (no `view_finance`, e.g. cashier — verified; or branch/org mismatch, audited); 400 missing branch (`require_branch`) or bad UUID; 404 branch not in org; 409 org-selection object; 422 `{detail:"start_date and end_date must be ISO dates (YYYY-MM-DD)"}` | `routers/finance.py:146-182`; `tenant.py:134-138` |
| 4 | `GET /inventory/branches/{branch_id}?search=<text>` | Bearer + `X-Organization-Id`; branch read access via `can_access_branch` (no extra permission) | 200 `[{id, part_name, part_number, category, retail_price:<str>, stock_quantity:<int>, reorder_level:<int>}]` ordered by part_name; **`unit_cost` is never present** (column grants, D-007/BR-011) | 400 bad UUID; 403 `{detail}` branch outside scope (audited) / org mismatch; 409 org-selection; 401 | `routers/inventory.py:78-108` |
| 5 | `GET /radar/requests` (optional `status_filter`) | Bearer + `X-Organization-Id` | 200 `[{id, part_description, motorcycle_model, urgency_status, status, created_at:<ISO|null>}]` newest first, org-scoped | 401; 403 org mismatch (audited); 409 org-selection | `routers/radar.py:81-99` |

### 6.3 Supabase Auth calls (via `@supabase/supabase-js`, project URL from env — not FastAPI)

| Call | Purpose | Notes |
|---|---|---|
| `signUp({email, password})` | §4.1 | Session or confirmation-required branch; provider errors surfaced readably |
| `signInWithPassword({email, password})` | §4.2 | |
| `resetPasswordForEmail(email, {redirectTo})` | §4.3 | Generic UI confirmation regardless of result |
| `updateUser({password})` | §4.3 | Requires recovery session |
| `signOut()` | §4.7 | |
| `getSession()` / `refreshSession()` | §4.4 | Single-flight refresh on 401 |
| `onAuthStateChange` | session lifecycle | `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `PASSWORD_RECOVERY`, `USER_UPDATED` |

Client config: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`. The anon key is public by design (D-012); **no service-role key or any secret may appear in frontend code, env, or build output** (AC-2.5).

### 6.4 Documented for slice 2 — NOT consumed in slice 1

`POST /organizations/register` (`routers/organizations.py:11-39`, schema `schemas.py:58-64`): Bearer required (no tenant context — the caller becomes owner via SECURITY DEFINER `register_organization()` reading `auth.uid()`). Request: `{name: str(2..255, required), kra_pin: str|null(≤50), org_type: "IMPORTER"|"WHOLESALER"|"RETAIL"|"MECHANIC"|"CUSTOMER" (required, regex-validated), subscription_tier: str="standard"(≤50), kra_compliance_enabled: bool=false, payroll_compliance_enabled: bool=false}`. Success 201 `{organization_id, name, org_type, kra_compliance_enabled, payroll_compliance_enabled}`. Errors: 401; 422 validation / invalid org_type (`22023` mapping); 403 (`42501`); 409 (`23505`). RPC signature verified in `docs/architecture/live-schema-audit-2026-11-19.md:401,409-432`. Field coverage vs RM §2.1 (hours/currency/language/timezone) remains a slice-2 audit item (RR OQ-09(d) / D-020).

### 6.5 Error-body conventions (verified)

- FastAPI `HTTPException` → `{"detail": <string>}`; the tenant-selection 409 is `{"detail": {"code":"organization_selection_required","message":...,"organizations":[{organization_id,name,role}]}}` (`tenant.py:85-93`).
- Validation (422) → FastAPI default `{"detail":[{loc,msg,type},...]}`; the dashboard date error is a string detail (`routers/finance.py:169`).
- DB sqlstate mapping (`main.py:42-59`): `42501`→403 "Forbidden"; `23505`→409 duplicate; `23503`→409; `23502`/`23514`/`22023`→422; `22P02`→400; unknown→500 generic (no internals leaked).
- 401 responses carry `WWW-Authenticate: Bearer` (`auth.py:58-59`).

---

## 7. Permissions and data rules

### 7.1 Role × action matrix (slice 1 surface; server is the only security boundary)

Verified behaviour sources: `tests/test_auth01_modules.py` (signed-JWT matrix), `tests/test_tc02.py:34-50` (live `has_org_permission` role groups `('owner','manager','accountant')` and `('owner','manager','cashier')`; dashboard gated by `view_finance`), H04/H05. The exact permission→role mapping lives in the live `has_org_permission()` function; the frontend **displays** by `context.role` and **never enforces** security client-side.

| Action / screen | Owner | Manager (branch) | Accountant | Cashier |
|---|---|---|---|---|
| Sign in / out, password reset | yes | yes | yes | yes |
| Org picker / switcher | own memberships only | own memberships only | own memberships only | own memberships only |
| Overview financial dashboard (`view_finance`) | yes (org-wide or branch) | yes, own branch (verified 200) | yes, branch-scoped (verified) | **no — 403 + audit** (verified); UI shows §5.4 panel |
| POS item grid (selling price + stock) | yes | yes | yes | yes (branch read access) |
| Buying cost / margin anywhere | only via `manage_finance`-gated costs endpoint — **not consumed in slice 1** | same | same | **never** (BR-011; `unit_cost` not selectable by `authenticated`, D-007) |
| Parts Radar list (own org) | yes | yes | yes | yes (read; create requires `parts_radar` — cashier denied, verified; creation not in slice 1) |
| Expense/EOD/checkout writes | later slices | later slices | later slices | later slices |
| Branch scope | org-wide if membership org-wide; else own branch | own branch only; sibling branch → 403 + audit (TC-04 verified) | per membership | per membership |
| Approval limits / customer ownership attributes | not exercised in slice 1 (no approval flows); storage/enforcement = slice 2+ (REQ-004) | | | |

Separation of duties: slice 1 ships no approval workflows; the verified server-side rules (EOD approver ≠ recorder, cashier discount denial, etc.) are untouched. No slice-1 UI control may imply an approval capability exists.

### 7.2 Tenant header rules (BR-013, D-001)

1. Headers express selection, never proof: the server validates every header/payload/query ID against verified memberships; mismatch → 403 + `record_navigation_violation` audit (`tenant.py:141-166`, `core_rbac.py`).
2. The client sends only IDs obtained from `/auth/me` (memberships/context). It must not accept org/branch IDs from URL params, user-typed text, or other tenants' payloads.
3. Payloads in slice 1 are read-only (GET); no client-supplied tenant IDs in bodies exist. Query params `organization_id`/`branch_id` are omitted in favour of headers.
4. On org/branch switch, all cached data from the previous context is discarded before new data renders (AC-5.5) — client-side tenant hygiene mirroring the server boundary.

### 7.3 Client-side data rules

| Item | Rule |
|---|---|
| Supabase session | Persisted by supabase-js in localStorage under its default key (`sb-<project-ref>-auth-token`). Contains access/refresh tokens — treat as sensitive: never logged, never copied into app state dumps, never sent to FastAPI anywhere except the Authorization header. |
| Tenant selection | localStorage keys namespaced per auth user: `kms.<auth_user_id>.organizationId`, `kms.<auth_user_id>.branchId`. Values validated as UUIDs and against current memberships before use (§4.5.2). Cleared on sign-out and on 403-revocation recovery. |
| Credentials | **None stored by the application** (D-012): no password, PIN, hash, or token in any application table, localStorage key of our own, log, or analytics. Supabase Auth is the credential authority (C-012 resolved). |
| In-memory tenant data | React state/query cache only; never persisted to disk in slice 1 (offline store = slice 6, D-019). Discarded on switch/sign-out. |
| Money | API decimal strings; display via `Intl.NumberFormat('en-KE', {style:'currency', currency:'KES'})`; no client float math on amounts. |
| Dates | ISO `YYYY-MM-DD` for API params; display in Kenya locale/timezone (Africa/Nairobi) per BP §11. |
| Retention | Selection keys live until sign-out/revocation; no other client persistence. Server audit retention unchanged (append-only, C-008 trigger intact). |
| Canonical entities (BP §5.1) | Read-only touch: User (auth identity), Tenant→`organizations`, Branch→`branches`, Role→`organization_memberships.role`, Session (Supabase-managed). Audit Event rows are written **only by the server** (denial audits). No schema change, no new entity, no numbering rule in this slice. |

---

## 8. Notifications (slice 1 subset — BP §4.10 pattern)

The central notification service (REQ-016) is **not** built here. Slice 1 uses only Supabase-managed transactional auth emails and in-app states. Account-security notification set (REQ-014: suspicious-login, permission-changed, etc.) is slice 10.

| ID | Purpose | Trigger | Audience | Channel | Priority | Opt-out rule |
|---|---|---|---|---|---|---|
| N-01 | Verify email ownership | `signUp` with confirmation enabled | the signing-up user | Email (Supabase Auth SMTP) | transactional | Not opt-out-able (credential verification); Supabase project template settings |
| N-02 | Password recovery | `resetPasswordForEmail` | the requesting address | Email (Supabase Auth) | transactional | Not opt-out-able; generic UI response prevents enumeration (§4.3) |
| N-03 | Session expired | refresh failed / retry 401 | current user | In-app redirect notice | high | n/a (system state) |
| N-04 | Offline / connectivity loss | §5.5 trigger | current user | In-app persistent banner | high | n/a |
| N-05 | Permission denied | any 403 | current user | In-app panel with server detail | high | n/a |
| N-06 | Staff profile not linked | `context.staff_user_id == null` | current user | In-app dismissible banner | medium | Dismissible per session; reappears next session until linked |

**External-send gate (D-011 hard limit):** verification of N-01/N-02 uses test mailboxes only (QA-controlled addresses). No external messaging to real recipients, and no production exposure of real users, until the owner-approved gates apply. Supabase SMTP configuration is a project-settings verification item (GAP-04), not a code change.

---

## 9. Non-functional requirements

1. **Performance (BP §11, mid-range Android).** Spec-defined measurable targets (not source facts): sign-in submit → app shell interactive ≤ 3 s on a throttled mid-range Android profile (4× CPU slowdown, Fast-3G-ish network emulation) with warm backend; dashboard/POS data render ≤ 2 s p95 on local network after context resolution. Route-level code splitting; initial auth-route JS ≤ 300 KB gzipped (build-analyzer evidence). No blocking waterfall: `/auth/me` then parallel screen fetches.
2. **Touch & readability (BP §10.3).** Primary interactive controls (sign-in/up buttons, picker rows, switcher, nav, retry) ≥ 44×44 CSS px; high-contrast readable typography; progressive disclosure — cashier surfaces show selling price + stock only.
3. **i18n scaffolding (D-027).** Every user-facing string resolves through an i18n catalogue (`en` complete at launch). A `sw` catalogue stub exists with market-native draft terms, each entry marked `REQUIRES NATIVE REVIEW` (BP §10.3); no component hardcodes display strings. Language switcher UI may be hidden until SW review, but the mechanism must exist and be testable by catalogue swap. KES currency, Kenyan date/phone formats (§7.3).
4. **Secrets (D-012, H09).** Frontend env contains only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`. `.env.example` lists names with empty placeholders only. No service-role key, `DATABASE_URL`, JWT secret, or real token in source, env files, build output, logs, tests, or docs. The anon key is public by design and may appear in the bundle.
5. **Env validation.** At startup, validate the three variables are present and URL-shaped; on failure render the configuration-error screen (§5.7) naming the missing variables (names only). No silent fallback to any hard-coded URL or demo mode.
6. **Accessibility & states.** Every async surface has loading/empty/error variants (§5.7); errors are readable, never internals; focus management on route changes; forms labelled and keyboard-operable.
7. **BR-015 scope statement.** Slice 1 contains no destructive or financially material action (reads + auth only). Password change is gated by the emailed recovery link and an explicit submit. Disabled future capabilities are visibly labelled (§5.6); nothing pretending to be a material action ships.

---

## 10. Acceptance criteria

Numbering scheme: `AC-<REQ group>.<n>` — group 1 = REQ-001, 2 = REQ-002, 5 = REQ-005, 6 = REQ-006, 7 = cross-cutting NFR/security/first-run. All criteria are executable in a browser against the verified AUTH-01 backend with QA-provisioned test fixtures (transaction-isolated or approved-cleanup per AGENTS.md / H05 harness rules). **None is claimed as executed.** Test fixtures must include: single-org owner, branch manager, cashier, accountant, multi-org user (≥2 active memberships), org-wide user, zero-membership auth user, membership-without-`public.users` user, and an empty-data org.

### 10.1 REQ-001 — auth bootstrap (→ TC-01/TC-02 browser legs; proposed TC-41)

- **AC-1.1** Given a provisioned active user with one membership, when they submit valid email+password at `/signin`, then a Supabase session exists, the app shell renders the organisation name from `GET /auth/me` `context`, and the network log shows that call carrying `Authorization: Bearer <token>`.
- **AC-1.2** Given a signed-in user, when any protected screen loads, then every FastAPI request in the network log carries a Bearer token; and given no session, when a protected route is opened directly, then no protected request fires and the user is redirected to `/signin`.
- **AC-1.3** Given a signed-in user, when the browser tab is reloaded (or closed and reopened within the refresh-token lifetime), then the session is restored without re-entering credentials and `/auth/me` is re-fetched successfully.
- **AC-1.4** Given a valid refresh token and an expired access token (forced via test manipulation), when a protected call returns 401, then the client performs exactly one refresh and one retry, and the retried request succeeds; the network log shows at most one refresh call and one retry per original request (single-flight under concurrent 401s).
- **AC-1.5** Given a revoked/expired refresh token, when a protected call returns 401 and refresh fails, then the local session and tenant selection are cleared, the user lands on `/signin` with a "session expired" notice, and no retry loop occurs (≤ 1 refresh attempt).
- **AC-1.6** Given a signed-out user, when they open `/app/overview` directly, then they are redirected to `/signin`, and after successful sign-in they are returned to `/app/overview`.
- **AC-1.7** Given a signed-in user with a persisted org/branch selection, when they sign out, then the Supabase session storage and `kms.<user>.*` selection keys are empty, protected deep links redirect to `/signin`, and browser Back does not re-display tenant data without a new authenticated fetch.

### 10.2 REQ-002 — credentials per D-012 (→ TC-05 re-scoped; proposed TC-44; TC-01 sign-up leg)

- **AC-2.1** Given a fresh email, when the user completes `/signup`, then an `auth.users` identity is created via Supabase (session returned, or "check your email" state when confirmation is enabled), and a read-only inspection shows **no new row in `public.users` or any application table** caused by sign-up (D-004).
- **AC-2.2** Given the signup form, when a password shorter than the configured Supabase minimum (default 6) or a mismatched confirmation is entered, then a field-level error appears before any network call and no account is created.
- **AC-2.3** Given any email address (existing or not), when a reset is requested, then the UI shows the identical generic confirmation; when Supabase returns a rate-limit error, the UI shows a readable "try again later" message; the response never reveals account existence.
- **AC-2.4** Given a valid recovery link, when the user sets a new password at `/update-password`, then sign-in with the new password succeeds and sign-in with the old password fails; given an expired/invalid link, the screen shows "link expired or invalid" with a path to request a new one.
- **AC-2.5** Given the built frontend (`dist/`) and all frontend env files, when scanned, then the only Supabase/API configuration values present are the project URL, the public anon key, and the API base URL; no service-role key, database URL, JWT secret, or user credential appears in source, bundle, or logs (TC-05 re-scoped per D-012: "no plaintext credentials anywhere").
- **AC-2.6** Given a wrong password or unknown email, when sign-in is submitted, then a readable "Invalid email or password" error appears, no session is created, and the form remains submittable.

### 10.3 REQ-005 — org/branch selection (→ TC-02/TC-04 browser legs; proposed TC-42)

- **AC-5.1** Given a user with exactly one active membership, when they sign in, then no picker appears, `context` is auto-resolved, the shell shows the org name and branch (or "All branches"), and subsequent tenant calls carry `X-Organization-Id` (and `X-Branch-Id` when branch-scoped).
- **AC-5.2** Given a user with ≥2 organisation memberships and no valid stored selection, when they sign in, then `/auth/me` returns `context:null`, a picker lists exactly the caller's organisations (name + role), and selecting one persists the choice and resolves context on the next `/auth/me` call with `X-Organization-Id`.
- **AC-5.3** Given a multi-org user with no selection, when a tenant-scoped endpoint returns 409 with `detail.code == "organization_selection_required"`, then the picker appears populated from `detail.organizations`, and after selection the original request is retried once with headers and succeeds.
- **AC-5.4** Given a persisted org+branch selection, when the browser is reloaded, then the same selection is restored (validated against memberships) and the same headers are sent without re-prompting.
- **AC-5.5** Given a user viewing org A data, when they switch to org B (or another branch) via the shell switcher, then all visible data re-fetches under the new headers and no value from org A remains rendered (DOM inspection + network log).
- **AC-5.6** Given a branch-scoped manager, when a request targets a sibling branch (forced via stored-selection manipulation in test), then the API returns 403, the UI shows the permission-denied panel with "Choose another branch", no silent retry occurs, and a read-only query confirms a `navigation_violation` audit row for the attempt.
- **AC-5.7** Given a stored organisation the user no longer belongs to (membership revoked in test fixture), when the app loads or a call returns 403 membership denial, then the stored selection is cleared, `/auth/me` is re-fetched once without headers, and the user lands on the picker (other memberships) or the no-organisation screen (none), with an explanatory message.
- **AC-5.8** Given an org-wide user with no branch selected, when a branch-required endpoint (dashboard) is called, then the 400 `X-Branch-Id` requirement is rendered as a "choose a branch" prompt listing known branch options, or — when none are known — the honest GAP-01 message (§4.6.3); no fabricated branch list appears.

### 10.4 REQ-006 — API client & demo replacement (→ proposed TC-43; TC-02 cashier leg; C-003 closure)

- **AC-6.1** Given the frontend source, when scanned, then no hard-coded API origin exists (the `App.jsx:4` constant is gone); changing `VITE_API_BASE_URL` changes the request target; removing any required `VITE_*` variable produces the configuration-error screen naming the variable, with no demo fallback.
- **AC-6.2** Given the frontend source and rendered screens, when scanned for the known demo artefacts (`demoSales`, `KSh 284,650`, `KSh 76,420`, the static six-product array, "James Mwangi", demo radar rows, demo chart bars), then none exists; every displayed number traces to an API response field or is explicitly labelled unavailable/zero-from-API.
- **AC-6.3** Given an owner/manager/accountant with branch context in an org with recorded sales, when Overview loads, then `GET /finance/dashboard` is called with today's ISO dates and the returned measures (including `net_sales`) render formatted as KES; in an empty org the API's zeros render as real zeros; measures absent from the response render "Not yet available" — never invented values.
- **AC-6.4** Given a cashier, when Overview loads, then the dashboard call returns 403, the UI shows the permission-denied panel with no financial figures, finance navigation is hidden, and a read-only query confirms the denial audit row.
- **AC-6.5** Given a branch with inventory rows, when Counter POS loads, then items come from `GET /inventory/branches/{branch_id}` showing only name, part number, selling price, and stock (no cost/margin field in payload or DOM); typing in search re-queries with `search=`; an empty branch shows "No items in this branch yet"; the checkout control is visibly disabled with a "later release" label and cannot submit.
- **AC-6.6** Given any data screen, when its fetch is slow, returns `[]`, or fails (500/network), then distinguishable loading, empty, and error-with-retry states appear respectively; the error state shows a readable message and never raw internals; retry re-issues the request.
- **AC-6.7** Given the browser is set offline, when a screen fetch fails, then the persistent offline banner appears, affected screens show error/stale-labelled states with Retry, and no offline trading capability is offered; on reconnect the banner clears and data re-fetches.
- **AC-6.8** Given an org with Parts Radar requests, when Overview loads, then the radar card lists live `GET /radar/requests` rows (description, model, urgency, status); with none, it shows an honest empty state; the demo rows are gone.
- **AC-6.9** Given the backend health endpoint reachable/unreachable, when the shell loads, then the connectivity indicator reflects `GET /health/db` truthfully (ok / unreachable), replacing the unconditional demo "Database live" dot.

### 10.5 Cross-cutting — first run, NFR, security (→ TC-01 first-run leg; proposed TC-45, TC-46)

- **AC-7.1** Given an authenticated user with zero memberships, when sign-in completes, then the "no organisation yet" screen appears with the registration path honestly labelled "Coming in the next release" (no working registration form, no call to `/organizations/register`), a "Check again" action that re-fetches `/auth/me`, and sign-out; no dashboard or demo data is reachable.
- **AC-7.2** Given a user whose membership resolves but `context.staff_user_id` is null (no `public.users` row), when the shell loads, then the staff-link banner (N-06) appears, permitted reads still work, and the client makes no attempt to create a staff row (network log + read-only table inspection).
- **AC-7.3** Given the auth screens and app shell on a 360 px-wide viewport, when measured, then all primary interactive targets are ≥ 44×44 CSS px and text meets readable contrast (BP §10.3/§11).
- **AC-7.4** Given a throttled mid-range Android profile, when sign-in → shell and dashboard render are timed (5 runs), then median shell-interactive ≤ 3 s and local-network data render ≤ 2 s p95; the initial auth-route bundle is ≤ 300 KB gzipped (build evidence). Targets are spec-defined (§9.1).
- **AC-7.5** Given the i18n catalogue, when every rendered string is audited, then all resolve through the catalogue (`en` complete; `sw` stub entries marked REQUIRES NATIVE REVIEW per D-027); swapping the catalogue changes UI language without code edits.
- **AC-7.6** Given API money strings (e.g. `"7850.00"`), when rendered, then amounts display as KES with locale grouping and two decimals, and no client-side floating-point arithmetic is performed on money values (code inspection).
- **AC-7.7** Given the Inventory, Finance, and Dispatch placeholder pages, when opened, then each shows a "Not yet available in this release" badge and contains no enabled action button implying non-existent functionality (the demo "Add new record" button is removed).

**Total: 37 acceptance criteria** (7 + 6 + 8 + 9 + 7).

### 10.6 Test mapping and proposed new TC IDs

Existing IDs are preserved and never renumbered (AGENTS.md). Proposed additions — **to be registered by qa-test-engineer in HANDOVER/05 before execution**; this spec does not modify the ledger:

| Proposed ID | Scope | ACs |
|---|---|---|
| TC-41 | Browser sign-in/session persistence/refresh/re-auth/sign-out | AC-1.1…1.7, AC-2.6 |
| TC-42 | Browser org/branch selection, switching, 409/403/400 handling, revocation recovery | AC-5.1…5.8 |
| TC-43 | API-client honesty: env config, demo removal, live dashboard/POS/radar, states, offline banner | AC-6.1…6.9, AC-7.7 |
| TC-44 | Password reset/recovery end-to-end (test mailboxes) | AC-2.3, AC-2.4 |
| TC-45 | First-run: zero memberships; membership without staff row | AC-7.1, AC-7.2, AC-2.1 |
| TC-46 | NFR: touch targets, performance, i18n scaffolding, KES formatting, secrets scan | AC-2.2, AC-2.5, AC-7.3…7.6 |

Existing hooks: **TC-01** browser leg (sign-up + first-run only; full registration remains slice 2 — TC-01 stays PARTIAL until then); **TC-02** browser leg (cashier vs owner UI matrix, AC-6.4/AC-5.6); **TC-04** browser leg (AC-5.6); **TC-05** re-scoped per D-012 (AC-2.1/2.5 — no plaintext credentials anywhere; Supabase-managed); **TC-39** already PASS at API level — not renumbered, not re-claimed. TC-12/TC-13 remain NOT IMPLEMENTED (slice 6).

---

## 11. Edge cases (mandatory coverage)

| # | Scenario | Required behaviour | ACs |
|---|---|---|---|
| E1 | Expired access token, valid refresh | One silent refresh + one retry; success invisible to user | AC-1.4 |
| E2 | Refresh failed / revoked session / banned or deleted auth user (401 from `database.py:59-64`) | Clear session+selection → `/signin` with notice; no loop | AC-1.5, AC-2.6 |
| E3 | Membership revoked mid-session | 403 → clear selection → re-fetch `/auth/me` → picker or no-org screen; plain message | AC-5.7 |
| E4 | Multi-org, no header | `/auth/me` `context:null` → picker; tenant routes 409 marker → picker + one retry | AC-5.2, AC-5.3 |
| E5 | Wrong branch (outside membership) | 403 + server audit; permission panel + "Choose another branch"; no silent retry | AC-5.6 |
| E6 | Branch UUID not in org | 404 → "Branch not found in this organisation"; clear stored branch | §4.6.4 |
| E7 | Org-wide user, branch-required call | 400 `require_branch` → branch prompt or honest GAP-01 message | AC-5.8 |
| E8 | Network loss | Offline banner; error/stale states with retry; **no offline trading** (slice 6) | AC-6.7 |
| E9 | Env misconfiguration | Configuration-error screen naming missing variables; no demo fallback | AC-6.1 |
| E10 | Auth account, no `public.users` row (D-004) | `staff_user_id:null` → N-06 banner; no auto-provisioning; reads still work | AC-7.2 |
| E11 | Duplicate submission (idempotency) | Sign-up/sign-in/reset/submit buttons disable while pending; double-click creates at most one Supabase call (network log). Server-side idempotency framework is slice 4 (REQ-012/BR-008); slice 1 performs no tenant writes, so no server idempotency key is required here. Supabase "user already registered" errors are surfaced honestly. | AC-2.1, AC-2.2, §4.1.3 |
| E12 | Stale persisted selection (org renamed/deactivated, branch deleted) | Selection validated against memberships each load; 403/404 recovery paths E3/E6; deactivated org (`o.is_active` filter, `tenant.py:53`) simply absent from memberships | AC-5.4, AC-5.7 |
| E13 | Clock skew | Backend allows 30 s leeway (`auth.py:96`); client relies on Supabase expiry, no local expiry math | AC-1.4 |
| E14 | Empty data org (post-purge baseline, D-008) | API zeros/`[]` render as honest zeros/empty states — never demo fill | AC-6.3, AC-6.5, AC-6.8 |
| E15 | eTIMS unavailable | **N/A in slice 1** — no eTIMS call exists or is specified (Phase 6, RM §8; RR REQ-023 boundary). Recorded so QA does not expect coverage here. | — |
| E16 | Last-unit stock conflict / price-version change mid-offline / partial fulfilment / returns-reversals | **N/A in slice 1** — no trading writes ship (slices 5–8; BR-004/005/008 execution belongs to REQ-023/024/035 specs). The POS screen is read-only; disabled checkout cannot create a sale. | AC-6.5 |
| E17 | Approval above threshold | **N/A in slice 1** — no approval flows (slice 2 attributes, slice 5 discount engine per D-015). No UI implies approval capability. | §7.1 |
| E18 | Permission denied on any screen | Uniform 403 panel (§5.4); nav display is UX, server is boundary | AC-6.4, AC-5.6 |
| E19 | Recovery link expired / opened without recovery session | Honest error + re-request path; `/update-password` guarded | AC-2.4 |
| E20 | Concurrent 401s (parallel screen fetches) | Single-flight refresh; each original request retried at most once | AC-1.4 |

---

## 12. Reports

No report or export capability ships in slice 1 (reporting service = REQ-038, slice 10; RM §11.2). The Overview dashboard is a **live operational view**, not a report: audience owner/manager/accountant (`view_finance`), measures = whatever `get_dashboard_summary` returns for the selected branch and today's date, filters = date fixed to "Today" and branch via context (range filters later), export = none. The weekly-trend and recent-sales surfaces are honest unavailable placeholders pending GAP-03. COGS completeness is a known backend gap (H04); any profit measure that cannot be computed from returned data must read "Not yet available", never an estimate.

---

## 13. Contract gaps found (list only — no backend redesign in this slice)

| ID | Gap | Evidence | Slice-1 mitigation (specified) | Resolution path |
|---|---|---|---|---|
| GAP-01 | **No branch-enumeration endpoint and no branch names in any auth payload.** `/auth/me` memberships carry `branch_id` but not branch name; no `GET /organizations/{id}/branches` exists (`routers/organizations.py` has only `/register`). Org-wide users cannot list/name branches to switch into. | `routers/auth.py:24-29`; `tenant.py:46-58`; `routers/organizations.py` | Switcher lists only membership-derived branches, labelled "Branch …<last 4 of UUID>" (honest, not fabricated names); org-wide default sends no branch header; branch-required calls show §4.6.3 prompt/message | Propose minimal read-only branch-list endpoint (id+name, membership-gated) in slice 2 design; backend addition requires release-manager approval — AUTH-01 code itself unchanged |
| GAP-02 | **`get_dashboard_summary` full JSON shape undocumented locally.** Only `net_sales` is verified (`tests/test_auth01_modules.py:68`); the live-schema audit lists the signature but not the definition (`docs/architecture/live-schema-audit-2026-11-19.md:392`). | cited | Client renders known keys defensively; missing measures → "Not yet available"; AC-6.3 tests against the actual response | Solution-architect extracts `pg_get_functiondef` read-only during design and publishes the exact shape in `docs/architecture/api-contracts/` before frontend design sign-off |
| GAP-03 | **No sales-list or time-series endpoint** for "latest sales" / weekly revenue (`routers/pos.py` has only `POST /checkout`). | `routers/pos.py` | Honest unavailable placeholders (§5.3) | Sales list/trend endpoints belong to slice 5/9 specs (REQ-027/034/038) |
| GAP-04 | **Supabase project Auth settings unverified** (email confirmation on/off, password minimum, SMTP for reset emails, redirect-URL allowlist for `/update-password`). H09 records no verification. | H09; RR REQ-002 state | Both sign-up branches specified (§4.1); reset flow specified against standard Supabase behaviour | Design-phase verification task (read-only project settings inspection + test-mailbox drill); redirect URL must be added to the Supabase allowlist — a project-settings action for devops/release-manager, not application code |
| NOTE-01 | `/auth/me` never returns 409 (suppressed to `context:null`) — contract nuance, not a defect. | `routers/auth.py:37-40` | Multi-org detection uses `context==null` + memberships; 409 marker handling applies to tenant routes | Documented in §6.2 |
| NOTE-02 | Backend CORS allowlist is dev-origins only. | `main.py:28` | Dev works as-is | Staging origin = slice-3 deployment configuration (REQ-009) |
| NOTE-03 | Session-revocation latency (access token valid until expiry after refresh-token revocation). | H07 Backend; `database.py:55-64` ban/delete check | Accepted documented limitation; short TTL + 401 path | Out of slice-1 scope; revisit at security review |

No gap requires modifying verified AUTH-01 code. If design-stage inspection (GAP-02/04) reveals a genuine contract defect, it goes to the release-manager as a new decision/contradiction entry — not a silent redesign.

---

## 14. Implementation notes for frontend-engineer (non-binding structure; binding contracts are §6/§7/§10)

Suggested module layout inside the existing Vite app (`frontend/`):

```
frontend/
  .env.example            # names only: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
  .env.local              # real values, never committed/shared (no git yet — treat as secret file)
  src/
    lib/env.js            # startup validation (§9.5)
    lib/supabase.js       # single createClient (§6.3 config)
    lib/apiClient.js      # fetch wrapper: base URL, bearer at request time, tenant headers,
                          # central 401 single-flight refresh / 403 / 409-marker / network handling
    auth/AuthProvider.jsx # session state, onAuthStateChange, /auth/me bootstrap, guards
    auth/SignIn.jsx  auth/SignUp.jsx  auth/ResetPassword.jsx  auth/UpdatePassword.jsx
    tenancy/TenantProvider.jsx  tenancy/OrgPicker.jsx  tenancy/BranchSwitcher.jsx
    components/states/    # Loading, EmptyState, ErrorState(retry), PermissionDenied,
                          # OfflineBanner, ConfigError, NotYetAvailable
    pages/Overview.jsx  pages/Pos.jsx  pages/Radar.jsx  pages/Placeholder.jsx
    i18n/index.js  i18n/en.js  i18n/sw.js   # sw entries marked REQUIRES NATIVE REVIEW (D-027)
    router.jsx            # route table + session/tenant guards
```

- **Dependencies to add:** `@supabase/supabase-js` (v2), `react-router-dom` (v7). No state-management or UI-framework dependency needed; React context + the existing CSS suffice. Keep existing scripts (`dev/build/lint/preview`) and React 19 / Vite 8.
- **Remove:** `demoSales`, the static product/price arrays, demo chart bars, demo radar rows, "James Mwangi" footer, the hard-coded `API` constant, and `SimplePage`'s "Add new record" button (`frontend/src/App.jsx`). `App.jsx` may be decomposed into the structure above; `App.css`/`index.css` may be reused (H07 notes legacy/nested CSS — review while touching, do not rewrite wholesale).
- **Must NOT change:** any backend file (`auth.py`, `tenant.py`, `database.py`, `core_rbac.py`, `routers/*`, `schemas.py`, `main.py`, migrations), the database, Supabase schema, or the pytest suite. AUTH-01 is verified (44/44); a discovered defect is reported as a gap (§13), not patched in this slice.
- **Money/dates:** decimal strings in, `Intl` formatting out (§7.3). **Tokens:** never `console.log` sessions or Authorization headers.
- **QA fixtures:** browser tests need the user set listed in §10; provision via the existing API/test-harness patterns with rollback or approved exact-ID cleanup (H05 infrastructure; C-008 rules). Test emails only for N-01/N-02 (D-011 external-send limit).
- **Evidence:** after implementation, run `npm --prefix frontend run build` and `lint`, execute the mapped browser tests, and record results in HANDOVER/05 via qa-test-engineer; update H04 slice status via release-manager. Never mark unexecuted functionality PASS.

---

## 15. Handoff

1. **Review:** release-manager approves this spec under D-011 delegation (evidence-based gate, D-011). Open items GAP-02/GAP-04 are design-phase verification tasks with specified mitigations — they do not block spec approval, but GAP-02's exact dashboard shape must be published before frontend design sign-off.
2. **On approval → `solution-architect`:** spec path `docs/specs/SLICE-01-auth-bootstrap/SPEC.md`; AC IDs AC-1.1…1.7, AC-2.1…2.6, AC-5.1…5.8, AC-6.1…6.9, AC-7.1…7.7; affected canonical entities (read-only): User, Tenant (`organizations`), Branch (`branches`), Role/membership (`organization_memberships`), Session (Supabase-managed), Audit Event (server-written denials). Deliverables: ADR for the frontend auth/API-client architecture, published API contracts (incl. GAP-02 resolution), security model note (token storage, anon-key exposure, tenant header hygiene).
3. **Then → `frontend-engineer`** (implementation strictly from §6/§7/§10/§14) **→ `qa-test-engineer`** (register TC-41…TC-46 proposals in HANDOVER/05, execute every AC, record evidence) **→ `code-security-reviewer`** (mandatory: auth + tenant data) **→ `release-manager`** (gate decision in `docs/release/PHASE_GATE_TRACKER.md`).

This specification is the contract QA tests against. Any deviation requires a spec revision approved through the same gate — not an inline implementation decision.

---

## 16. Release-manager approval record (2026-11-19, D-011)

- **APPROVED.** 37 ACs are executable and observable; scope exclusions match the register backlog; no backend changes; honesty rules (C-003/D-004) enforced. BR-017 bootstrap exception accepted per RR §9.
- **GAP-02 CLOSED:** exact dashboard shape published at `docs/architecture/api-contracts/dashboard.md` — response keys are `sales_count`, `net_sales`, `expense_total`, `low_stock_count`, `inventory_items_count` (numeric strings/ints). No COGS/profit/cash-position keys exist → those cards render "Not yet available" per §5.3. Date-range guard: end ≥ start, span ≤ 366 days, else 42501→403.
- **GAP-05 ADDED (configuration, owner action):** no Supabase anon key exists anywhere in the local environment (verified by search 2026-11-19). `VITE_SUPABASE_URL` is derivable from the pooler DATABASE_URL username (same derivation as `auth.py:_project_url`, public project URL). `VITE_SUPABASE_ANON_KEY` must be supplied by the product owner from Supabase dashboard → Project Settings → API (anon/public key — public by design, safe for frontend env). Implementation may proceed with `.env.example`; **browser sign-in QA (TC-41/44/45) is blocked until the key is provided**. SUPABASE_URL is NOT required in backend env (derived automatically).
- **GAP-04 CLOSED (2026-11-19, verified via read-only `GET /auth/v1/settings` with the anon key):** `disable_signup=false`, `mailer_autoconfirm=false` → **Branch B (email confirmation required) is the live behaviour**; `password_min_length=null` → Supabase default 6; email provider enabled, phone disabled (consistent with D-012). Remaining project-settings action for devops/QA: add `http://127.0.0.1:5173/update-password` (and localhost variant) to the Supabase redirect-URL allowlist before TC-44 reset drill; SMTP delivery uses test mailboxes only (D-011).
- **GAP-05 CLOSED (2026-11-19):** product owner supplied the anon key (keys.txt, git-ignored). Verified: role=anon, project ref matches DATABASE_URL pooler project. `frontend/.env.local` written with VITE_SUPABASE_URL (https://spuazefszsxrsjihroeg.supabase.co), VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL=http://127.0.0.1:8000. Key value never printed/logged. Browser sign-in QA unblocked. Note: local machine has a malformed proxy env var — HTTP clients must use trust_env=False / no-proxy for Supabase probes.
- Next: solution-architect design approval (ADR-004) → frontend-engineer → qa-test-engineer (register TC-41…TC-46) → code-security-reviewer → gate.
