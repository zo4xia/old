@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0logs" mkdir "%~dp0logs"

set "PORTABLE_NODE=%~dp0runtime\node\node.exe"
set "PORTABLE_NPM=%~dp0runtime\node\npm.cmd"
set "VITE_JS=%~dp0node_modules\vite\bin\vite.js"
set "OUT_LOG=%~dp0logs\dev-server.out.log"
set "ERR_LOG=%~dp0logs\dev-server.err.log"
set "PID_FILE=%~dp0logs\dev-server.pid"

:: Pick portable Node first, fall back to system Node
set "NODE_CMD="
set "NODE_PATH_ADD="
if exist "%PORTABLE_NODE%" if exist "%PORTABLE_NPM%" (
  set "NODE_CMD=%PORTABLE_NODE%"
  set "NODE_PATH_ADD=%~dp0runtime\node;"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [cleanroom] Missing node. Copy portable Node into runtime\node or install Node 20+ to PATH.
    exit /b 1
  )
  set "NODE_CMD=node"
  set "NODE_PATH_ADD="
)

if not exist "%~dp0node_modules" (
  call "%~dp0install.bat" || exit /b 1
)

if not exist "%VITE_JS%" (
  echo [cleanroom] Missing Vite entry: node_modules\vite\bin\vite.js
  call "%~dp0install.bat" || exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5196' -TimeoutSec 1; if ($r.StatusCode -eq 200) { Write-Host '[cleanroom] already running: http://127.0.0.1:5196'; exit 0 } } catch {}; $env:PATH='%NODE_PATH_ADD%' + $env:PATH; $p = Start-Process -FilePath '%NODE_CMD%' -ArgumentList @('%VITE_JS%','--host','127.0.0.1','--port','5196') -WorkingDirectory '%~dp0' -RedirectStandardOutput '%OUT_LOG%' -RedirectStandardError '%ERR_LOG%' -WindowStyle Minimized -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id; Start-Sleep -Seconds 4; try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5196' -TimeoutSec 3; if ($r.StatusCode -eq 200) { Write-Host '[cleanroom] dev server ready: http://127.0.0.1:5196'; exit 0 } } catch {}; Write-Host '[cleanroom] dev server did not start. Check logs/dev-server.err.log and logs/dev-server.out.log'; exit 1"

exit /b %ERRORLEVEL%
