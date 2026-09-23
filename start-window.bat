@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE_NODE=%~dp0runtime\node\node.exe"
set "VITE_JS=%~dp0node_modules\vite\bin\vite.js"

:: Pick portable Node first, fall back to system Node
set "USE_PORTABLE=0"
if exist "%PORTABLE_NODE%" (
  set "NODE_CMD=%PORTABLE_NODE%"
  set "NODE_PATH=%~dp0runtime\node"
  set "USE_PORTABLE=1"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [cleanroom] Missing node. Copy portable Node into runtime\node or install Node 20+ to PATH.
    pause
    exit /b 1
  )
  echo [cleanroom] Portable Node not found, using system Node...
  set "NODE_CMD=node"
  set "NODE_PATH="
)

if not exist "%VITE_JS%" (
  echo [cleanroom] Missing node_modules\vite\bin\vite.js
  echo [cleanroom] Run install.bat first.
  pause
  exit /b 1
)

echo [cleanroom] Opening dev server window...
echo [cleanroom] URL: http://127.0.0.1:5196

if "%USE_PORTABLE%"=="1" (
  start "cleanroom dev server" cmd /k "cd /d ^"%~dp0^" && set ^"PATH=%NODE_PATH%;%%PATH%%^" && ^"%NODE_CMD%^" ^"%VITE_JS%^" --host 127.0.0.1 --port 5196"
) else (
  start "cleanroom dev server" cmd /k "cd /d ^"%~dp0^" && ^"%NODE_CMD%^" ^"%VITE_JS%^" --host 127.0.0.1 --port 5196"
)
