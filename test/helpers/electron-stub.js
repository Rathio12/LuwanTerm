'use strict';

const Module = require('module');
const os = require('os');
const path = require('path');
const fs = require('fs');

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
