'use strict';

const crypto = require('crypto');

function fingerprintOf(keyBlob) {
  const digest = crypto.createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

function keyTypeOf(keyBlob) {
  try {
    const length = keyBlob.readUInt32BE(0);
    if (length > 0 && length < 64 && keyBlob.length >= 4 + length) {
      return keyBlob.subarray(4, 4 + length).toString('ascii');
    }
  } catch {  }
  return 'unknown';
}

module.exports = { fingerprintOf, keyTypeOf };
