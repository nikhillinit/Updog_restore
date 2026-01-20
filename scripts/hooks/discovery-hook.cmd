@echo off
setlocal
set "BASH=C:\Program Files\Git\bin\bash.exe"
set "SCRIPT=C:/dev/Updog_restore/scripts/hooks/discovery-hook.sh"
"%BASH%" --noprofile --norc -c "source '%SCRIPT%'"
exit /b 0
