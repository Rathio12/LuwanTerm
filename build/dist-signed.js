'use strict';

/**
 * Runs the normal Windows build, signed with the local self-signed certificate
 * created by build/make-cert.ps1.
 *
 * electron-builder reads the key from CSC_LINK / CSC_KEY_PASSWORD, so the
 * password never has to live in package.json.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const certDir = path.join(__dirname, 'certs');
const pfx = path.join(certDir, 'luwanterm.pfx');
const passwordFile = path.join(certDir, 'password.txt');

if (!fs.existsSync(pfx)) {
  console.error('No signing certificate found at build/certs/luwanterm.pfx');
  console.error('Create one first:  npm run make-cert');
  process.exit(1);
}

const password = process.env.CSC_KEY_PASSWORD
  || (fs.existsSync(passwordFile) ? fs.readFileSync(passwordFile, 'utf8').trim() : '');

if (!password) {
  console.error('No certificate password. Expected build/certs/password.txt or CSC_KEY_PASSWORD.');
  process.exit(1);
}

// shell:true is required on Windows: Node refuses to spawn npx.cmd directly.
const result = spawnSync('npx', ['electron-builder', '--win', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CSC_LINK: pfx, CSC_KEY_PASSWORD: password },
});

if (result.error) {
  console.error(`Could not run electron-builder: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
