# 00 — Read First

## Current handover status
This repository is a mixed FastAPI/React proof-of-implementation workspace. Supabase is live and contains 32 public base tables, RLS, policies, functions, and triggers. AUTH-01 (user-scoped Supabase authentication and FastAPI database sessions) was implemented and verified on 2026-11-19: full regression 44/44 passed. See 05/11 for evidence and 06 C-008 for committed test leftovers awaiting approved cleanup.

## Mandatory startup order
1. Read `AGENTS.md` at the project root.
2. Read all 11 handover documents in numeric order.
3. Inspect actual source, migrations, tests, and frontend files independently.
4. Verify database objects through read-only metadata queries.
5. Establish a baseline test run.
6. Present a proposed next task and obtain approval before significant changes.

## Highest-risk facts
- The workspace was not a Git repository during handover, so branch, commit, and diff history could not be verified.
- ~~FastAPI currently uses a direct `DATABASE_URL` connection. Supabase Auth JWT propagation is not yet demonstrated across normal API requests.~~ Resolved 2026-11-19 (AUTH-01): protected routes verify the Supabase JWT and run as `authenticated` with transaction-local claims; see 03. Frontend sign-in is still missing.
- The frontend contains live layout components but substantial dashboard data and POS interactions are still demo or placeholder.
- TC-01/TC-02/TC-03/TC-04 now have signed-JWT API evidence (05), but browser integration and real business data remain unverified; they are not evidence that whole modules are production-ready.
- Public application tables were empty at audit time except AUTH01 test leftovers (06 C-008); production behavior was not exercised with real business data.

## Secrets
Never copy `.env.local`, database URLs, passwords, service-role keys, or tokens into documentation or chat output.
