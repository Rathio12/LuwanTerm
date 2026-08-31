'use strict';

const MAX_LINES = 20000;
const MAX_AREA = 4_000_000;

function lcsMatrix(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + (j + 1)] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + (j + 1)]);
    }
  }
  return { table, cols };
}

function walk(a, b) {
  const { table, cols } = lcsMatrix(a, b);
  const out = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      out.push({ type: 'remove', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ type: 'remove', text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

const splitLines = (text) => String(text).replace(/\r\n/g, '\n').split('\n');

function diffLines(left, right, options = {}) {
  const context = Number.isInteger(options.context) ? options.context : 3;

  let a = splitLines(left);
  let b = splitLines(right);

  const truncated = a.length > MAX_LINES || b.length > MAX_LINES;
  if (truncated) {
    a = a.slice(0, MAX_LINES);
    b = b.slice(0, MAX_LINES);
  }

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const middleA = a.slice(head, a.length - tail);
  const middleB = b.slice(head, b.length - tail);

  let middle;
  if (middleA.length * middleB.length > MAX_AREA) {

    middle = [
      ...middleA.map((text) => ({ type: 'remove', text })),
      ...middleB.map((text) => ({ type: 'add', text })),
    ];
  } else {
    middle = walk(middleA, middleB);
  }

  const all = [
    ...a.slice(0, head).map((text) => ({ type: 'same', text })),
    ...middle,
    ...a.slice(a.length - tail).map((text) => ({ type: 'same', text })),
  ];

  let added = 0;
  let removed = 0;
  let leftNo = 0;
  let rightNo = 0;

  const numbered = all.map((line) => {
    if (line.type === 'add') {
      added += 1;
      rightNo += 1;
      return { ...line, right: rightNo };
    }
    if (line.type === 'remove') {
      removed += 1;
      leftNo += 1;
      return { ...line, left: leftNo };
    }
    leftNo += 1;
    rightNo += 1;
    return { ...line, left: leftNo, right: rightNo };
  });

  return {
    identical: added === 0 && removed === 0,
    added,
    removed,
    truncated,
    hunks: groupIntoHunks(numbered, context),
  };
}

function groupIntoHunks(lines, context) {
  const keep = new Array(lines.length).fill(false);

  lines.forEach((line, index) => {
    if (line.type === 'same') return;
    for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i += 1) {
      keep[i] = true;
    }
  });

  const hunks = [];
  let current = null;

  lines.forEach((line, index) => {
    if (!keep[index]) {
      current = null;
      return;
    }
    if (!current) {
      current = { leftStart: line.left || 0, rightStart: line.right || 0, lines: [] };
      hunks.push(current);
    }
    current.lines.push(line);
  });

  return hunks;
}

module.exports = { diffLines };
