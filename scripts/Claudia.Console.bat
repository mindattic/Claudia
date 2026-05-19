@echo off
REM Claudia Console launcher.
REM
REM No args  -> opens interactive menu.
REM With args -> dispatches directly, e.g.:
REM     Claudia.Console.bat detect
REM     Claudia.Console.bat set-model claude-sonnet-4-6
REM     Claudia.Console.bat update --clean

setlocal
set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Claudia.Console.ps1" %*

set "RC=%ERRORLEVEL%"
if "%~1"=="" (
    REM Interactive session — don't auto-close.
    exit /b %RC%
)
if not "%RC%"=="0" (
    echo.
    echo Claudia.Console failed with exit code %RC%.
    pause
)
exit /b %RC%
