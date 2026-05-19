@echo off
REM Render Claudia.md to a self-contained Claudia.htm.

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
