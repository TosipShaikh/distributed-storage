@echo off
echo Running Storage Node Automated Test Suite...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-storage-node.ps1"
pause
