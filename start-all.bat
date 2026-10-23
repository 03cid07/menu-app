@echo off
cd /d "%~dp0"

REM Start the menu app only if nothing is already listening on port 3000
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Starting the menu app...
  start "Menu App" cmd /k npm.cmd start
  timeout /t 4 >nul
) else (
  echo Menu app is already running, skipping.
)

REM Start the tunnel in its own window (copies the link to your clipboard)
start "Tunnel" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-tunnel.ps1"

REM Open the admin page on this PC
start "" http://localhost:3000/admin.html
