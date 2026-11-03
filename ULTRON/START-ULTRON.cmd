@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer from https://nodejs.org/
  pause
  exit /b 1
)
node scripts/build.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo ULTRON - Open http://127.0.0.1:4173 in Chrome.
echo Keep this window open. Press Ctrl+C to stop.
node --env-file-if-exists=.env.local scripts/dev.mjs
pause
