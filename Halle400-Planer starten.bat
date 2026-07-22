@echo off
rem Startet den Halle-400-Planer und oeffnet ihn im Browser.
cd /d "%~dp0"
node tools\serve-local.mjs --open
pause
