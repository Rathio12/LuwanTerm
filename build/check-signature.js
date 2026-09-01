'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', 'dist');
const wanted = process.env.EXPECT_SIGNED === '1';

const SHELLS = ['pwsh', 'powershell'];

function signatureOf(file) {
  const script =
    'Import-Module Microsoft.PowerShell.Security -ErrorAction Stop; ' +
    '$s = Get-AuthenticodeSignature -LiteralPath ' + JSON.stringify(file) + '; ' +
    '$subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { "" }; ' +
    'Write-Output "$($s.Status)|$subject"';

  const failures = [];
  for (const shell of SHELLS) {
    try {
      const out = execFileSync(shell, ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
      const status = out.split('|')[0].trim();
      if (status) return out;
      failures.push(`${shell}: empty status`);
    } catch (err) {
      failures.push(`${shell}: ${String(err.message).split(String.fromCharCode(10))[0].slice(0, 70)}`);
    }
  }
  return `Unreadable|${failures.join('; ')}`;
}

if (!fs.existsSync(dir)) {
  console.error('no dist directory to check');
  process.exit(1);
}

const artifacts = fs.readdirSync(dir).filter((name) => name.endsWith('.exe'));
if (!artifacts.length) {
  console.error('no executables in dist');
  process.exit(1);
}

let unsigned = 0;
let unreadable = 0;

for (const name of artifacts) {
  const [status, subject] = signatureOf(path.join(dir, name)).split('|');

  // UnknownError is what Windows reports for a signature whose chain it cannot
  // build - a self-signed certificate, which is signed but not trusted here.
  const signed = status === 'Valid' || status === 'UnknownError';
  if (status === 'Unreadable') unreadable += 1;
  else if (!signed) unsigned += 1;

  const label = status === 'Unreadable' ? 'UNREADABLE' : signed ? 'signed  ' : 'UNSIGNED';
  console.log(`  ${label}  ${name}  ${status}${subject ? `  ${subject}` : ''}`);
}

console.log('');
if (unreadable) {
  console.error(`could not read the signature of ${unreadable} of ${artifacts.length} executables.`);
  console.error('That is a broken check rather than a verdict, so it is being treated as a failure.');
  process.exit(1);
}

if (!unsigned) {
  console.log(`all ${artifacts.length} executables carry a signature`);
  process.exit(0);
}

if (wanted) {
  console.error(`${unsigned} of ${artifacts.length} executables are unsigned, but a certificate was supplied.`);
  console.error('The signing step failed quietly. Check WINDOWS_CERT_BASE64 and WINDOWS_CERT_PASSWORD.');
  process.exit(1);
}

console.log(`${unsigned} of ${artifacts.length} executables are unsigned.`);
console.log('No certificate was supplied, so this is expected - but every download will warn,');
console.log('and unsigned Electron binaries score worse with the heuristic scanners.');
console.log('See guides/signing.md.');
