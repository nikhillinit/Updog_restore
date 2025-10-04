@echo off
REM Quick Start Script for Development Server
REM Usage: Double-click this file or run "start-dev.bat" in terminal

echo ========================================
echo   VC Fund Platform - Dev Server
echo ========================================
echo.

echo [1/3] Checking Node version...
node --version
echo.

echo [2/3] Starting Vite development server...
echo Server will be available at: http://localhost:5173
echo.
echo Press Ctrl+C to stop the server
echo.

cd /d %~dp0
npx vite --host

pause
