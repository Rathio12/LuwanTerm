'use strict';

const crypto = require('crypto');

/**
 * Formats an SSH public key blob the way OpenSSH does, e.g.
 * `SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU`.
 */
function fingerprintOf(keyBlob) {
  const digest = crypto.createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

/** Reads the algorithm name from the front of an SSH public key blob. */
function keyTypeOf(keyBlob) {
  try {
    const length = keyBlob.readUInt32BE(0);
    if (length > 0 && length < 64 && keyBlob.length >= 4 + length) {
      return keyBlob.subarray(4, 4 + length).toString('ascii');
    }
  } catch { /* fall through */ }
  return 'unknown';
}

module.exports = { fingerprintOf, keyTypeOf };
