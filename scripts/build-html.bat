@echo off
REM Render the latest Claudia_v*.md to a self-contained .htm.

setlocal
set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-html.ps1" %*

set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo build-html failed with exit code %RC%.
    pause
)
exit /b %RC%
