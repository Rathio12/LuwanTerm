'use strict';

const zlib = require('zlib');

const ACCENT_A = [124, 92, 255];
const ACCENT_B = [62, 168, 255];
const DOT_COLOR = [62, 168, 255];
const TILE_COLOR = [20, 22, 28];

const CHEVRON = [
  [38, 42],
  [68, 64],
  [38, 86],
];
const FULL = { stroke: 11, bar: [76, 82, 26, 11], dot: [98, 36, 5] };
const SIMPLE = { stroke: 15, bar: [74, 80, 30, 14], dot: null };

const SAMPLES = 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const coverage = (d) => clamp01(0.5 - d);

function sdRoundRect(px, py, cx, cy, w, h, r) {
  const dx = Math.abs(px - cx) - (w / 2 - r);
  const dy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdSegment(px, py, x1, y1, x2, y2, halfWidth) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  const qx = x1 + t * vx - px;
  const qy = y1 + t * vy - py;
  return Math.sqrt(qx * qx + qy * qy) - halfWidth;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r;
}

function renderMark(size, simplified) {
  const style = simplified ? SIMPLE : FULL;
  const scale = size / 128;
  const tileR = 30 * scale;
  const half = (style.stroke / 2) * scale;
  const points = CHEVRON.map(([x, y]) => [x * scale, y * scale]);
  const [bx, by, bw, bh] = style.bar;
  const bar = [
    (bx + bw / 2) * scale,
    (by + bh / 2) * scale,
    bw * scale,
    bh * scale,
    (bh / 2) * scale,
  ];
  const dot = style.dot ? style.dot.map((v) => v * scale) : null;

  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / SAMPLES;
  const samples = SAMPLES * SAMPLES;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;

          const tile = coverage(sdRoundRect(px, py, size / 2, size / 2, size, size, tileR));
          if (tile <= 0) continue;

          let mark = coverage(
            sdSegment(px, py, points[0][0], points[0][1], points[1][0], points[1][1], half)
          );
          mark = Math.max(
            mark,
            coverage(
              sdSegment(px, py, points[1][0], points[1][1], points[2][0], points[2][1], half)
            )
          );
          mark = Math.max(mark, coverage(sdRoundRect(px, py, bar[0], bar[1], bar[2], bar[3], bar[4])));

          const mix = clamp01((px + py) / (size * 2));
          let red = lerp(TILE_COLOR[0], lerp(ACCENT_A[0], ACCENT_B[0], mix), mark);
          let green = lerp(TILE_COLOR[1], lerp(ACCENT_A[1], ACCENT_B[1], mix), mark);
          let blue = lerp(TILE_COLOR[2], lerp(ACCENT_A[2], ACCENT_B[2], mix), mark);

          if (dot) {
            const dcov = coverage(sdCircle(px, py, dot[0], dot[1], dot[2]));
            red = lerp(red, DOT_COLOR[0], dcov);
            green = lerp(green, DOT_COLOR[1], dcov);
            blue = lerp(blue, DOT_COLOR[2], dcov);
          }

          sumR += red * tile;
          sumG += green * tile;
          sumB += blue * tile;
          sumA += tile;
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(sumR / samples);
      pixels[offset + 1] = Math.round(sumG / samples);
      pixels[offset + 2] = Math.round(sumB / samples);
      pixels[offset + 3] = Math.round((sumA / samples) * 255);
    }
  }

  return pixels;
}

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

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { renderMark, encodePng };
