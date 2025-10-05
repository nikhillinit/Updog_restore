@echo off
setlocal

REM dev-bootstrap.bat - Simple launcher for the PowerShell bootstrap script
REM This wrapper handles execution policy and admin privileges

set PS_SCRIPT=%~dp0dev-bootstrap.ps1

if not exist "%PS_SCRIPT%" (
  echo ❌ PowerShell script not found: %PS_SCRIPT%
  exit /b 1
)

echo.
echo ========================================
echo   Updog Restore Dev Bootstrap
echo ========================================
echo.
echo Starting PowerShell bootstrap script...
echo.

REM Forward any flags to the PS script:
REM   dev-bootstrap.bat                 (normal mode)
REM   dev-bootstrap.bat -MemoryCache    (skip Redis, use in-memory)
REM   dev-bootstrap.bat -LocalPostgres "postgres://postgres:postgres@localhost:5432/postgres"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*

endlocal
