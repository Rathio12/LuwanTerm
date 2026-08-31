'use strict';

const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { diffLines } = require(path.join(__dirname, '..', 'src', 'main', 'diff'));

suite('diff');

const flat = (result) => result.hunks.flatMap((h) => h.lines);
const rendered = (result) =>
  flat(result)
    .map((l) => `${l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '}${l.text}`)
    .join('\n');

{
  const result = diffLines('same\ntext', 'same\ntext');
  check('identical files report no change', result.identical && result.added === 0 && result.removed === 0);
  check('and produce no hunks', result.hunks.length === 0);
}

{
  const result = diffLines('a\nb\nc', 'a\nB\nc');
  check('a changed line is one add and one remove', result.added === 1 && result.removed === 1);
  check('the surrounding lines are kept as context', flat(result).filter((l) => l.type === 'same').length === 2);
  check('the change is visible', rendered(result).includes('-b') && rendered(result).includes('+B'));
}

{
  const result = diffLines('a\nc', 'a\nb\nc');
  check('an inserted line is a single add', result.added === 1 && result.removed === 0);
}

{
  const result = diffLines('a\nb\nc', 'a\nc');
  check('a deleted line is a single remove', result.removed === 1 && result.added === 0);
}

{
  const result = diffLines('', 'one\ntwo');
  check('an empty left side is all additions', result.removed <= 1 && result.added >= 1, `+${result.added} -${result.removed}`);
}

{
  // Line numbers must track each side separately or the gutter lies.
  const result = diffLines('keep\nold\ntail', 'keep\nnew\ntail');
  const lines = flat(result);
  const removed = lines.find((l) => l.type === 'remove');
  const added = lines.find((l) => l.type === 'add');
  check('a removed line carries only a left number', removed.left === 2 && removed.right === undefined);
  check('an added line carries only a right number', added.right === 2 && added.left === undefined);
  check('the final context line is numbered on both sides', lines[lines.length - 1].left === 3 && lines[lines.length - 1].right === 3);
}

{
  // Windows line endings must not make every line look changed.
  const result = diffLines('a\r\nb\r\nc', 'a\nb\nc');
  check('mixed line endings are not a difference', result.identical, `+${result.added} -${result.removed}`);
}

{
  const big = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join('\n');
  const changed = big.replace('line 2000', 'line 2000 changed');
  const started = Date.now();
  const result = diffLines(big, changed);
  const ms = Date.now() - started;
  check('a large file with one change is fast', ms < 1500, `${ms}ms`);
  check('and reports exactly that change', result.added === 1 && result.removed === 1);
  check('and only shows the region around it', flat(result).length <= 9, `${flat(result).length} lines shown`);
}

{
  const a = Array.from({ length: 300 }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: 300 }, (_, i) => `b${i}`).join('\n');
  const result = diffLines(a, b);
  check('two entirely different files still diff', result.added === 300 && result.removed === 300);
}

{
  const huge = Array.from({ length: 25000 }, (_, i) => `l${i}`).join('\n');
  const result = diffLines(huge, `${huge}\nextra`);
  check('an oversized file is truncated rather than hanging', result.truncated === true);
}

{
  const result = diffLines('a\nb\nc\nd\ne\nf\ng', 'a\nb\nc\nD\ne\nf\ng', { context: 1 });
  check('the context setting is honoured', flat(result).length === 4, `${flat(result).length} lines`);
}

done();
