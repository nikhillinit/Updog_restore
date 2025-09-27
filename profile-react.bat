@echo off
echo === Performance Profiling Setup for React Build ===
echo.
echo 1. Starting preview server...
start "Preview Server" cmd /k "npm run preview:web"

echo 2. Waiting for server to start...
timeout /t 3 /nobreak > nul

echo 3. Opening browser for profiling...
echo.
echo === PROFILING INSTRUCTIONS ===
echo 1. Open DevTools (F12)
echo 2. Go to Performance tab
echo 3. Click gear and set CPU: 4x slowdown
echo 4. Click Start recording
echo 5. Navigate: Step 2 -> Step 3 and wait for freeze
echo 6. Click Stop
echo.
echo === ISOLATION TOGGLES ===
echo - Safe mode: Add ?safe to URL
echo - No charts: Add ?nocharts to URL
echo.
echo Press any key to open browser...
pause > nul

start "Profile Browser" "http://localhost:4173/fund-setup"
echo Browser opened. Follow profiling instructions above.
pause