@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conns = Get-NetTCPConnection -LocalPort 5196 -State Listen -ErrorAction SilentlyContinue; if (-not $conns) { Write-Host '[cleanroom] dev server is not running'; exit 0 }; foreach ($ownerPid in ($conns.OwningProcess | Select-Object -Unique)) { Write-Host ('[cleanroom] stopping pid=' + $ownerPid); Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue }; exit 0"

exit /b %ERRORLEVEL%
