@echo off
setlocal
cd /d "E:\MotorCycle\kms-main"

echo ============================================
 echo TC-02 Cashier vs Owner RBAC Verification
 echo Evidence run: 2026-11-19
 echo ============================================

echo [1] Live preflight evidence
.\.venv\Scripts\python.exe inspect_tc02_short.py

echo [2] Role helper and policy evidence
.\.venv\Scripts\python.exe inspect_tc02_roles.py

echo [3] Apply TC-02 migration idempotently
.\.venv\Scripts\python.exe apply_tc02_asyncpg.py

echo [4] Automated TC-02 test evidence
.\.venv\Scripts\python.exe -m pytest -q tests/test_tc02.py

echo [5] Pass criteria
 echo - has_org_permission exists
 echo - cashier does not receive view_finance permission
 echo - owner/manager/accountant receive view_finance permission
 echo - dashboard RPC requires view_finance
 echo - inventory buying-cost route exists
 echo - unauthorized navigation is auditable by record_navigation_violation
 echo - audit logs remain SELECT-only for authenticated API users

endlocal
