'use strict';

const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Lets the store modules run under plain Node.
 *
 * They require `electron` for `app.getPath` and `safeStorage`, neither of which
 * exists outside a running Electron process. This substitutes both, with a
 * keychain that is reversible rather than secure — enough to exercise the code
 * paths that depend on encryption being available.
 *
 * @param {string} [userData] directory to use as the app's data folder
 * @returns {string} the directory in use
 */
function installElectronStub(userData) {
  const dir = userData || fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-test-'));
  fs.mkdirSync(dir, { recursive: true });

  const stubPath = path.join(os.tmpdir(), `luwanterm-electron-stub-${process.pid}.js`);
  const original = Module._resolveFilename;

  Module._resolveFilename = function resolve(request, ...rest) {
    if (request === 'electron') return stubPath;
    return original.call(this, request, ...rest);
  };

  require.cache[stubPath] = {
    id: stubPath,
    filename: stubPath,
    loaded: true,
    exports: {
      app: {
        getPath: () => dir,
        getVersion: () => '0.0.0-test',
        getAppPath: () => path.join(__dirname, '..', '..'),
        isPackaged: false,
      },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (text) => Buffer.concat([Buffer.from('STUB:'), Buffer.from(text, 'utf8')]),
        decryptString: (buf) => buf.subarray(5).toString('utf8'),
      },
    },
  };

  return dir;
}

module.exports = { installElectronStub };
