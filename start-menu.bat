@echo off
cd /d "%~dp0"
echo Starting the menu app...
start "" http://localhost:3000/admin.html
npm.cmd start
pause
