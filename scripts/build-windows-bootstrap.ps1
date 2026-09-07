param([switch]$RefreshManifestOnly)
# Run ONLY in an isolated Windows build copy, from a VS x64 Native Tools shell.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'runtime\windows\bootstrap'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$source = Join-Path $root 'runtime\windows\native\job-host.cpp'
Push-Location $output
try {
  if (-not $RefreshManifestOnly) {
  & cl.exe /nologo /std:c++17 /O2 /MT /EHsc /W4 /DUNICODE /D_UNICODE $source /Fe:job-host.exe /link Advapi32.lib
  if ($LASTEXITCODE -ne 0) { throw "Native supervisor compilation failed: $LASTEXITCODE" }
  }
  $sha = (Get-FileHash -LiteralPath '.\job-host.exe' -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = @{ format = 'hajimi.bootstrap.v1'; sha256 = $sha; platform = 'win32'; arch = 'x64' } | ConvertTo-Json
  [IO.File]::WriteAllText((Join-Path $output 'bootstrap.json'), $manifest + "`n", (New-Object Text.UTF8Encoding($false)))
  Remove-Item -LiteralPath '.\job-host.obj' -ErrorAction SilentlyContinue
} finally { Pop-Location }
