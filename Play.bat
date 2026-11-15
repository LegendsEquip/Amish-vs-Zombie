@echo off
rem ONE HORSEPOWER - starts a tiny local web server and opens the game in your browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" "http://localhost:8777/"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\serve.ps1" -Port 8777
