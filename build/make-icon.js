'use strict';

/**
 * Generates build/icon.ico from scratch - a rounded violet tile with the same
 * terminal mark the app uses in its titlebar. Written by hand so the build has
 * no image-tooling dependency.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const RADIUS = 56;

const ACCENT_A = [124, 92, 255];
const ACCENT_B = [75, 124, 255];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth 1px-wide coverage ramp, used to antialias every edge. */
const coverage = (distance) => clamp01(0.5 - distance);

/** Signed distance to a rounded rectangle centred in the canvas. */
function roundedRectDistance(x, y, half, radius) {
  const dx = Math.abs(x - SIZE / 2) - (half - radius);
  const dy = Math.abs(y - SIZE / 2) - (half - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to a thick line segment with round caps. */
function segmentDistance(x, y, x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = x - x1;
  const wy = y - y1;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  const px = x1 + t * vx - x;
  const py = y1 + t * vy - y;
  return Math.sqrt(px * px + py * py) - width / 2;
}

function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const tileAlpha = coverage(roundedRectDistance(px, py, SIZE / 2 - 6, RADIUS));
      const gradient = clamp01((px + py) / (SIZE * 1.6));
      const base = [
        lerp(ACCENT_A[0], ACCENT_B[0], gradient),
        lerp(ACCENT_A[1], ACCENT_B[1], gradient),
        lerp(ACCENT_A[2], ACCENT_B[2], gradient),
      ];

      // The ">_" mark, drawn as three round-capped strokes.
      const mark = Math.max(
        coverage(segmentDistance(px, py, 84, 82, 138, 128, 22)),
        coverage(segmentDistance(px, py, 138, 128, 84, 174, 22)),
        coverage(segmentDistance(px, py, 150, 174, 196, 174, 22))
      );

      const offset = (y * SIZE + x) * 4;
      pixels[offset] = Math.round(lerp(base[0], 255, mark));
      pixels[offset + 1] = Math.round(lerp(base[1], 255, mark));
      pixels[offset + 2] = Math.round(lerp(base[2], 255, mark));
      pixels[offset + 3] = Math.round(255 * tileAlpha);
    }
  }
  return pixels;
}

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, body])), 0);
  return Buffer.concat([head, name, body, crc]);
}

function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- ICO ---------- */

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry[0] = 0; // 0 means 256
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset

  return Buffer.concat([header, entry, png]);
}

const png = encodePng(render());
const target = path.join(__dirname, 'icon.ico');
fs.writeFileSync(target, encodeIco(png));
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log(`icon written: ${target} (${png.length} byte png)`);
