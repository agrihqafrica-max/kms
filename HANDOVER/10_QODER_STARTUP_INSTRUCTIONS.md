# 10 — Qoder AI Startup Instructions

## First responsibility
Do not start rewriting code. First read `AGENTS.md` and every file in this `HANDOVER/` directory. Inspect the repository independently and verify every claim that affects implementation.

## Required baseline work
1. Inspect the source tree, frontend, backend, tests, migrations, and environment configuration.
2. Verify Supabase metadata with read-only queries.
3. Re-run TC-01, TC-02, and TC-03 evidence commands.
4. Build the frontend and run the FastAPI health route.
5. Identify any drift between models, migrations, live schema, and routers.
6. Present a concise inherited-state summary.
7. Present the recommended first development task from `08_NEXT_DEVELOPMENT_ROADMAP.md`.
8. Obtain explicit human approval before significant code or database changes.

## Required implementation rule
Work strictly one approved test case or feature at a time. Establish preflight evidence, implement only missing pieces, run isolated tests, document actual output, and obtain approval before the next task.

## Do not assume
- No Supabase table can be safely changed without live verification.
- No frontend demo value is a real system integration.
- No test PASS means the entire module is complete.
- No service-role database context is safe for normal browser/API requests.
