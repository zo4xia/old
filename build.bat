@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE_NODE=%~dp0runtime\node\node.exe"
set "PORTABLE_NPM=%~dp0runtime\node\npm.cmd"

if exist "%PORTABLE_NODE%" if exist "%PORTABLE_NPM%" (
  if not exist "%~dp0node_modules" (
    call "%~dp0install.bat" || exit /b 1
  )
  set "PATH=%~dp0runtime\node;%PATH%"
  call "%PORTABLE_NPM%" run build
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if errorlevel 1 (
  echo [cleanroom] Missing node. Copy portable Node into runtime\node or install Node 20+ to PATH.
  exit /b 1
)

echo [cleanroom] Using system Node for build...
if not exist "%~dp0node_modules" (
  call "%~dp0install.bat" || exit /b 1
)
call npm run build
