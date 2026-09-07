param([Parameter(Mandatory=$true)][string]$Setup, [Parameter(Mandatory=$true)][string]$App, [Parameter(Mandatory=$true)][string]$Bootstrap, [Parameter(Mandatory=$true)][string]$ExpectedThumbprint)
$ErrorActionPreference = 'Stop'
foreach ($file in @($Setup, $App, $Bootstrap)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) { throw "Untrusted or invalid release signature: $file" }
}
Write-Output 'All requested release signatures are valid and match the explicitly supplied publisher certificate.'
