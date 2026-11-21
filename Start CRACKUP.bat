@echo off
setlocal
set "CRACKUP_FAILURE_STAGE=PREREQUISITE"
title CRACKUP
cd /d "%~dp0"
if errorlevel 1 goto failed

where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js is required. Install Node.js 20 or newer, then try again.
    goto failed
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
    echo CRACKUP requires Node.js 20 or newer. Update Node.js, then try again.
    goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm is missing. Reinstall Node.js with npm included, then try again.
    goto failed
)

if not exist "node_modules\.bin\tsx.cmd" goto install
if not exist "node_modules\.bin\tsc.cmd" goto install
goto build

:install
set "CRACKUP_FAILURE_STAGE=INSTALL"
echo Installing game dependencies. This first-time setup needs internet access.
call npm.cmd ci
if errorlevel 1 goto failed

:build
set "CRACKUP_FAILURE_STAGE=BUILD"
echo Preparing CRACKUP. Your browser will open when the game is ready.
call npm.cmd run build
if errorlevel 1 goto failed

echo.
echo Starting offline solo. Keep this window open while playing.
echo To quit, save and close the game tab. The server exits after about a minute.
echo.
set "CRACKUP_FAILURE_STAGE=RUNTIME"
call npm.cmd run solo -- %*
if errorlevel 1 goto failed
exit /b 0

:failed
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\log-launcher-failure.ps1" -Stage "%CRACKUP_FAILURE_STAGE%"
echo.
echo CRACKUP could not start. Check the error above.
pause
exit /b 1
