'use strict';

/**
 * Readers and writers for the SSH binary wire encoding (RFC 4251 section 5),
 * which PPK blobs and OpenSSH private keys are both built from.
 */

class Reader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  need(count) {
    if (this.offset + count > this.buffer.length) {
      throw new Error('Malformed key data: ran off the end of a field.');
    }
  }

  uint32() {
    this.need(4);
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /** Length-prefixed byte string. */
  string() {
    const length = this.uint32();
    this.need(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  text() {
    return this.string().toString('utf8');
  }

  /**
   * Multiple-precision integer. Returned exactly as stored so callers can copy
   * it between formats without changing its value.
   */
  mpint() {
    return this.string();
  }

  rest() {
    return this.buffer.subarray(this.offset);
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }
}

class Writer {
  constructor() {
    this.parts = [];
  }

  raw(buffer) {
    this.parts.push(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    return this;
  }

  uint32(value) {
    const head = Buffer.allocUnsafe(4);
    head.writeUInt32BE(value >>> 0, 0);
    return this.raw(head);
  }

  string(value) {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    return this.uint32(body.length).raw(body);
  }

  /** Writes an mpint, normalising leading zeroes and the sign byte. */
  mpint(value) {
    let body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    let start = 0;
    while (start < body.length - 1 && body[start] === 0) start += 1;
    body = body.subarray(start);

    if (body.length && body[0] & 0x80) {
      body = Buffer.concat([Buffer.from([0]), body]);
    }
    if (body.length === 1 && body[0] === 0) body = Buffer.alloc(0);
    return this.string(body);
  }

  done() {
    return Buffer.concat(this.parts);
  }
}

module.exports = { Reader, Writer };
