$ErrorActionPreference = 'Stop'
$productRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$distribution = if ($env:HAJIMI_WSL_DISTRIBUTION) { $env:HAJIMI_WSL_DISTRIBUTION } else { 'Ubuntu' }
if ($productRoot -notmatch '^([A-Za-z]):\\(.*)$') {
  throw "HaJiMi WSL bootstrap requires a local Windows drive path: $productRoot"
}
$drive = $Matches[1].ToLowerInvariant()
$tail = $Matches[2].Replace('\', '/')
$wslProductRoot = "/mnt/$drive/$tail"
wsl.exe -d $distribution --exec bash "$wslProductRoot/runtime/wsl/bootstrap.sh"
if ($LASTEXITCODE -ne 0) {
  throw "HaJiMi WSL bootstrap failed with exit code $LASTEXITCODE"
}
