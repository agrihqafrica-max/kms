# Project Agent Instructions

- Treat Supabase, migrations, and existing test evidence as critical assets.
- Preserve existing working code and functionality. Do not rewrite or refactor working modules without documented approval.
- Work incrementally: inspect, plan, implement one approved task, test, review, and hand off.
- Read `HANDOVER/00_READ_FIRST.md` and every document in `HANDOVER/` before proposing changes.
- Verify repository code and live database evidence independently; do not trust assumptions or conversation history alone.
- Never expose environment values or credentials. Never place secrets in source, logs, tests, or handover files.
- Do not run destructive database operations: no dropping, truncating, resetting, recreating, or destructive RLS changes without explicit approval.
- Do not execute production migrations without a verified rollback plan and explicit authorization.
- Maintain test IDs TC-01 through TC-40 and acceptance criteria. Never mark unexecuted functionality PASS.
- Run relevant tests after meaningful changes and record evidence.
- Preserve historical decisions and add contradictions to `HANDOVER/06_CONTRADICTIONS_AND_DECISION_REGISTER.md` instead of silently resolving them.
- Update the handover ledger when implementation or verified status changes.
