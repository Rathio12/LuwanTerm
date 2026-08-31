'use strict';

const path = require('path');
const { suite, check, throws, done } = require('./helpers/harness');
const { Reader, Writer } = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'wire'));

suite('wire');

{
  const buf = new Writer().string('ssh-rsa').uint32(65537).string(Buffer.alloc(0)).done();
  const reader = new Reader(buf);
  check('a string round-trips', reader.text() === 'ssh-rsa');
  check('a uint32 round-trips', reader.uint32() === 65537);
  check('an empty string round-trips', reader.string().length === 0);
  check('the reader ends exactly at the end', reader.remaining === 0);
}

{

  const signed = new Writer().mpint(Buffer.from([0x81, 0x02])).done();
  check('a high-bit value gains a sign byte', new Reader(signed).mpint().equals(Buffer.from([0x00, 0x81, 0x02])));

  const padded = new Writer().mpint(Buffer.from([0x00, 0x00, 0x7f])).done();
  check('leading zeroes are stripped', new Reader(padded).mpint().equals(Buffer.from([0x7f])));

  const zero = new Writer().mpint(Buffer.from([0x00, 0x00])).done();
  check('zero encodes as an empty string', new Reader(zero).mpint().length === 0);
}

{

  const value = Buffer.from('7bcdef0123456789', 'hex');
  const round = new Reader(new Writer().mpint(value).done()).mpint();
  check('a canonical mpint survives a round trip', round.equals(value), round.toString('hex'));

  const negative = Buffer.from('abcdef', 'hex');
  const signed = new Reader(new Writer().mpint(negative).done()).mpint();
  check(
    'a high-bit mpint keeps its value behind the sign byte',
    signed.equals(Buffer.concat([Buffer.from([0]), negative])),
    signed.toString('hex')
  );
}

throws(
  'reading past the end is an error, not garbage',
  () => new Reader(Buffer.from([0, 0, 0, 8, 1, 2])).string(),
  (err) => /ran off the end/.test(err.message)
);

throws('a truncated length is an error', () => new Reader(Buffer.from([0, 0])).uint32());

done();
