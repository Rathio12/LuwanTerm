<#
  Installs the LuwanTerm signing certificate as trusted on THIS machine.

  Run as administrator. This adds a root certificate to the local machine store,
  which is a real change to what the machine trusts - only run it for a
  certificate you created yourself with build/make-cert.ps1.

  Use -Remove to undo it.
#>
[CmdletBinding()]
param(
  [switch] $Remove
)

$ErrorActionPreference = 'Stop'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "This needs an elevated PowerShell (Run as administrator)."
  exit 1
}

$cerPath = Join-Path $PSScriptRoot 'certs\luwanterm.cer'
if (-not (Test-Path $cerPath)) {
  Write-Error "No certificate at $cerPath. Run: npm run make-cert"
  exit 1
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $cerPath
$stores = @('Root', 'TrustedPublisher')

foreach ($name in $stores) {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($name, 'LocalMachine')
  $store.Open('ReadWrite')

  $existing = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }

  if ($Remove) {
    if ($existing) { $store.Remove($cert); Write-Host "Removed from LocalMachine\$name" }
    else { Write-Host "Not present in LocalMachine\$name" }
  } elseif ($existing) {
    Write-Host "Already trusted in LocalMachine\$name"
  } else {
    $store.Add($cert)
    Write-Host "Added to LocalMachine\$name"
  }

  $store.Close()
}

Write-Host ""
Write-Host $(if ($Remove) { "LuwanTerm signatures are no longer trusted here." }
             else { "LuwanTerm builds signed with this certificate are now trusted on this machine." })
