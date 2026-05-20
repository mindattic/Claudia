@echo off
REM Launcher for bump-version.ps1 — copies Claudia_vN.md to Claudia_v(N+1).md and rebuilds the PDF.

setlocal
set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%bump-version.ps1" %*

set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo bump-version failed with exit code %RC%.
    pause
)
exit /b %RC%
