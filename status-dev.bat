@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5196' -TimeoutSec 3; if ($r.StatusCode -eq 200) { Write-Host '[cleanroom] running: http://127.0.0.1:5196'; exit 0 } } catch {}; Write-Host '[cleanroom] not running'; if (Test-Path 'logs\dev-server.out.log') { Write-Host '--- out log'; Get-Content 'logs\dev-server.out.log' -Tail 40 }; if (Test-Path 'logs\dev-server.err.log') { Write-Host '--- err log'; Get-Content 'logs\dev-server.err.log' -Tail 40 }; exit 1"

exit /b %ERRORLEVEL%
