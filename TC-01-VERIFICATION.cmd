@echo off
setlocal
cd /d "E:\MotorCycle\kms-main"

where node >nul 2>&1 || echo Node runtime unavailable

echo ============================================
 echo TC-01 Multi-Tenant Organization Registration
 echo Evidence run: 2026-11-18
 echo ============================================

echo [1] Inspected existing database state
.\.venv\Scripts\python.exe inspect_tc01.py

echo [2] Applied TC-01 migration
.\.venv\Scripts\python.exe apply_tc01_asyncpg.py

echo [3] Automated test evidence
.\.venv\Scripts\python.exe -m pytest -q tests/test_tc01.py tests/test_tc01_api.py

echo [4] Pass criteria
 echo - organizations.org_type exists with allowed enum values
 echo - kra_compliance_enabled exists
 echo - payroll_compliance_enabled exists
 echo - organizations RLS remains enabled
 echo - register_organization RPC exists
 echo - /organizations/register FastAPI route exists
 echo - Live Auth/organizations/memberships remain isolated until an owner is bootstrapped

endlocal
