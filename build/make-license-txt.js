'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'LICENSE');
const target = path.join(__dirname, 'license.txt');

const WIDTH = 78;

const ASCII = [
  [/[\u2018\u2019\u201a\u201b]/g, "'"],
  [/[\u201c\u201d\u201e\u201f]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00a0/g, ' '],
  [/[\u2022\u00b7]/g, '-'],
];

function wrap(text, indent = '', hanging = indent) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let prefix = indent;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : `${prefix}${word}`;
    if (line && candidate.length > WIDTH) {
      lines.push(line);
      prefix = hanging;
      line = `${prefix}${word}`;
    } else {
      line = candidate;
    }
  }
  if (line.trim()) lines.push(line);
  return lines;
}

function render(markdown) {
  const out = [];

  let block = null;

  const flush = () => {
    if (!block) return;
    out.push(...wrap(block.text.join(' '), block.indent, block.hanging));
    block = null;
  };

  const blank = () => {
    flush();
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  for (const raw of markdown.split(/\r?\n/)) {
    let line = raw;
    for (const [pattern, replacement] of ASCII) line = line.replace(pattern, replacement);
    line = line.replace(/\*\*/g, '');

    if (/^\s*\|/.test(line)) continue;

    if (!line.trim()) {
      blank();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blank();
      const text = heading[2];
      out.push(heading[1].length === 1 ? text.toUpperCase() : text);
      out.push((heading[1].length === 1 ? '=' : '-').repeat(text.length));
      out.push('');
      continue;
    }

    const bullet = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const marker = /^\d/.test(bullet[2]) ? bullet[2] : '-';
      block = {
        text: [`${marker} ${bullet[3]}`],
        indent: bullet[1],
        hanging: `${bullet[1]}${' '.repeat(marker.length + 1)}`,
      };
      continue;
    }

    if (block) block.text.push(line.trim());
    else block = { text: [line.trim()], indent: '', hanging: '' };
  }
  flush();

  return `${out.join('\r\n').replace(/(\r\n){3,}/g, '\r\n\r\n')}\r\n`;
}

const text = render(fs.readFileSync(source, 'utf8'));

const outside = [...text].filter((character) => character.charCodeAt(0) > 126);
if (outside.length) {
  console.error(`license.txt still contains non-ASCII: ${[...new Set(outside)].join(' ')}`);
  process.exit(1);
}

fs.writeFileSync(target, text, 'ascii');
console.log(`license.txt written: ${text.split('\r\n').length} lines, ASCII only`);
