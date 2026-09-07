# Installer-only, elevated. Never grants users write permission over other users' runtime trees.
$ErrorActionPreference = 'Stop'
$root = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'HaJiMi\runtime-users'
if ($root -match '[^\x20-\x7e]') { throw 'This Windows installation needs an administrator-selected ASCII runtime root.' }
# Check every existing ancestor before any elevated write.
$current = $root
while ($current) {
  if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Reparse point in runtime ancestry: $current" }
  $parent = Split-Path $current -Parent
  if ($parent -eq $current) { break }; $current = $parent
}
if (Test-Path -LiteralPath $root) {
  if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime parent may not be a reparse point.' }
} else { [IO.Directory]::CreateDirectory($root) | Out-Null }
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$none = [Security.AccessControl.PropagationFlags]::None
$allow = [Security.AccessControl.AccessControlType]::Allow
foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
  $identity = New-Object Security.Principal.SecurityIdentifier($sid)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inherit, $none, $allow)))
}
$users = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'ReadAndExecute,CreateDirectories', 'None', 'None', $allow)))
$creator = New-Object Security.Principal.SecurityIdentifier('S-1-3-0')
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($creator, 'FullControl', $inherit, 'InheritOnly', $allow)))
$acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
Set-Acl -LiteralPath $root -AclObject $acl
