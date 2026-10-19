'use strict';

const fs = require('fs');
const path = require('path');
const { renderMark, encodePng } = require('./icon-render');

const FRAMES = [16, 24, 32, 48, 64, 128, 256];
const SIMPLE_BELOW = 32;

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    directory[at] = entry.size === 256 ? 0 : entry.size;
    directory[at + 1] = entry.size === 256 ? 0 : entry.size;
    directory[at + 2] = 0;
    directory[at + 3] = 0;
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

const entries = FRAMES.map((size) => ({
  size,
  png: encodePng(renderMark(size, size < SIMPLE_BELOW), size),
}));

fs.writeFileSync(path.join(__dirname, 'icon.ico'), encodeIco(entries));
fs.writeFileSync(path.join(__dirname, 'icon.png'), entries[entries.length - 1].png);
console.log(`icon written: ${FRAMES.join(', ')}px (${entries.length} frames)`);
