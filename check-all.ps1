$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) {
  throw 'Cannot resolve repository root.'
}

Set-Location $root

$nodeExe = Join-Path $root 'runtime\node\node.exe'
$npmCmd = Join-Path $root 'runtime\node\npm.cmd'

if ((Test-Path $nodeExe) -and (Test-Path $npmCmd)) {
  $runtimeNode = Split-Path $nodeExe -Parent
  $env:PATH = "$runtimeNode;$env:PATH"
  & $npmCmd run check:all
} else {
  Write-Host '[cleanroom] Portable Node not found, using system Node...'
  try { $nodeVersion = & node --version } catch {
    throw '[cleanroom] Missing node. Copy portable Node into runtime\node or install Node 20+ to PATH.'
  }
  & npm run check:all
}

exit $LASTEXITCODE
