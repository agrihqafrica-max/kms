@echo off
setlocal
cd /d "E:\MotorCycle\kms-main"

echo ============================================
 echo TC-03 Row-Level Security Isolation
 echo Evidence run: 2026-11-19
 echo ============================================

echo [1] Existing RLS preflight
.\.venv\Scripts\python.exe inspect_tc03.py

echo [2] Auth foreign-key preflight
.\.venv\Scripts\python.exe inspect_tc03_fk.py

echo [3] Apply TC-03 tenant context migration
.\.venv\Scripts\python.exe apply_tc03_asyncpg.py

echo [4] Automated isolation evidence
.\.venv\Scripts\python.exe -m pytest -q tests/test_tc03.py

echo [5] Pass criteria
 echo - branch_inventory RLS is enabled
 echo - SELECT policy uses is_org_member and can_access_branch
 echo - temporary auth.users identities and memberships are isolated
 echo - Org A can read its own inventory and zero Org B rows
 echo - Org B can read its own inventory and zero Org A rows
 echo - all test records are rolled back

endlocal
