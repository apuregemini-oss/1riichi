$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& node.exe (Join-Path $PSScriptRoot 'run.mjs') *> $null
exit $LASTEXITCODE
