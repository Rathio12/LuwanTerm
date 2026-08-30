<#
  Creates a self-signed code signing certificate for LuwanTerm.

  Windows will not trust it until build/trust-cert.ps1 is run on the machine in
  question, so this alone does not silence SmartScreen for people who download
  the app from the internet. It does give the build a stable publisher identity.

  Everything lands in build/certs/, which is git-ignored.
#>
[CmdletBinding()]
param(
  [string] $Publisher = 'LuwanIO',
  [int]    $Years     = 5
)

$ErrorActionPreference = 'Stop'

$certDir = Join-Path $PSScriptRoot 'certs'
$pfxPath = Join-Path $certDir 'luwanterm.pfx'
$cerPath = Join-Path $certDir 'luwanterm.cer'
$pwPath  = Join-Path $certDir 'password.txt'

New-Item -ItemType Directory -Path $certDir -Force | Out-Null

if (Test-Path $pfxPath) {
  Write-Host "A certificate already exists at $pfxPath"
  Write-Host "Delete build/certs/ first if you want to replace it."
  exit 0
}

# A random password, kept beside the key. Both are git-ignored; this protects
# the file at rest, it is not a secret shared with anyone.
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes)

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=$Publisher, O=$Publisher" `
  -FriendlyName "$Publisher Code Signing (LuwanTerm)" `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -KeyUsage DigitalSignature `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears($Years)

$secure = ConvertTo-SecureString -String $password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure | Out-Null
Export-Certificate   -Cert $cert -FilePath $cerPath | Out-Null
Set-Content -Path $pwPath -Value $password -Encoding utf8 -NoNewline

# The copy in the personal store has served its purpose; the .pfx is the source
# of truth for signing from now on.
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force

Write-Host ""
Write-Host "Certificate created."
Write-Host "  subject     : CN=$Publisher"
Write-Host "  thumbprint  : $($cert.Thumbprint)"
Write-Host "  expires     : $($cert.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host "  key         : build/certs/luwanterm.pfx"
Write-Host "  public cert : build/certs/luwanterm.cer"
Write-Host ""
Write-Host "Next: npm run dist:signed   (build signed installers)"
Write-Host "Then: npm run trust-cert    (once per machine, as administrator)"
