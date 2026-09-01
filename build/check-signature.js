'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', 'dist');
const wanted = process.env.EXPECT_SIGNED === '1';

function signatureOf(file) {
  const script =
    '$s = Get-AuthenticodeSignature -LiteralPath ' + JSON.stringify(file) + '; ' +
    '$subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { "" }; ' +
    'Write-Output "$($s.Status)|$subject"';
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
  } catch (err) {
    return `Unknown|${err.message.slice(0, 60)}`;
  }
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
for (const name of artifacts) {
  const [status, subject] = signatureOf(path.join(dir, name)).split('|');
  const signed = status === 'Valid' || status === 'UnknownError';
  if (!signed) unsigned += 1;
  console.log(`  ${signed ? 'signed  ' : 'UNSIGNED'}  ${name}  ${status}${subject ? `  ${subject}` : ''}`);
}

console.log('');
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
