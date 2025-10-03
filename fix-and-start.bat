@echo off
REM Fix Development Environment and Start Server
REM This script fixes common issues and starts the dev server

echo ========================================
echo   Fixing Development Environment
echo ========================================
echo.

echo [1/5] Cleaning cache...
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"
if exist "node_modules\.vite-temp" rmdir /s /q "node_modules\.vite-temp"
echo Cache cleared.
echo.

echo [2/5] Installing Vite explicitly...
call npm install vite@5.4.19 --save-dev
echo.

echo [3/5] Installing all dependencies...
call npm install
echo.

echo [4/5] Verifying Vite installation...
if exist "node_modules\vite\package.json" (
    echo Vite installed successfully!
) else (
    echo ERROR: Vite installation failed!
    pause
    exit /b 1
)
echo.

echo [5/5] Starting development server...
echo Server will be available at: http://localhost:5173
echo.
echo Press Ctrl+C to stop the server
echo.

cd /d %~dp0
npx vite --host

pause
