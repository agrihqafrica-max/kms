# 00 — Read First

## Current handover status
Phase 0 remains IN PROGRESS; this is not a production-ready release. AUTH-01 backend retains historical 44/44 regression evidence. Slice 1 frontend auth/API bootstrap is implemented with session-race corrections: latest local verification is 21/21 tests, clean lint, successful build, and 18 intercepted browser scenario groups (2026-11-19). Independent security re-review could not start (provider 403); approval remains outstanding. Live Supabase browser/mail acceptance, visual/mobile QA, staging and hosted CI are not established. See 05 for exact evidence and 07/08 for remaining work.

Git now exists on `work/phase0-auth-bootstrap`; publication is a review-pending checkpoint, not a merge or release. Respect `.gitignore`; never force-add environment files, keys, dependencies, build output or local session state. Blocked foundation drafts remain local. C-008 cleanup was approved and completed (06); no database changes were made in this frontend continuation. Original audit observations below are historical; D-033 records their current corrections.

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
