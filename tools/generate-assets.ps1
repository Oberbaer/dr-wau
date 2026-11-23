$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& node (Join-Path $PSScriptRoot 'generate-assets.cjs') $taskRoot
if ($LASTEXITCODE -ne 0) { throw 'Asset generation failed' }
