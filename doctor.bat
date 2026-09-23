@echo off
setlocal
cd /d "%~dp0"

set "LOCAL_NODE=%~dp0runtime\node\node.exe"

if exist "%LOCAL_NODE%" (
  set "PATH=%~dp0runtime\node;%PATH%"
  "%LOCAL_NODE%" scripts\doctor.mjs
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if errorlevel 1 (
  echo [cleanroom doctor] Missing node. Copy portable Node into runtime\node or install Node 20+.
  exit /b 1
)

node scripts\doctor.mjs
