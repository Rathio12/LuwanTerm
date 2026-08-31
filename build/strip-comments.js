'use strict';

const fs = require('fs');
const path = require('path');

const IDENT = /[A-Za-z0-9_$]/;
const ESCAPE = '\\';

const REGEX_PRECEDERS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw',
]);

function startsRegex(code, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code[i])) i -= 1;
  if (i < 0) return true;

  const ch = code[i];
  if ('(,=:[!&|?{};+-*%~^<>'.includes(ch)) return true;

  if (IDENT.test(ch)) {
    const end = i + 1;
    while (i >= 0 && IDENT.test(code[i])) i -= 1;
    return REGEX_PRECEDERS.has(code.slice(i + 1, end));
  }
  return false;
}

function strip(code, all = false) {
  let out = '';
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      if (!all) out += code.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < code.length) {
        out += code[i];
        if (code[i] === ESCAPE) {
          out += code[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '`') {
      out += ch;
      i += 1;
      while (i < code.length) {
        if (code[i] === ESCAPE) {
          out += code[i] + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (code[i] === '`') {
          out += code[i];
          i += 1;
          break;
        }
        if (code[i] === '$' && code[i + 1] === '{') {
          let brace = 1;
          let j = i + 2;
          while (j < code.length && brace > 0) {
            if (code[j] === '{') brace += 1;
            else if (code[j] === '}') brace -= 1;
            j += 1;
          }
          out += '${' + strip(code.slice(i + 2, j - 1), all) + '}';
          i = j;
          continue;
        }
        out += code[i];
        i += 1;
      }
      continue;
    }

    if (ch === '/' && startsRegex(code, i)) {
      out += ch;
      i += 1;
      let inClass = false;
      while (i < code.length) {
        out += code[i];
        if (code[i] === ESCAPE) {
          out += code[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (code[i] === '[') inClass = true;
        else if (code[i] === ']') inClass = false;
        else if (code[i] === '/' && !inClass) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function stripCss(code) {
  let out = '';
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < code.length) {
        out += code[i];
        if (code[i] === ESCAPE) {
          out += code[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

const KEPT_HTML = new Set(['badges', '/badges']);

function stripHtml(code) {
  return code.replace(/<!--([\s\S]*?)-->/g, (match, body) =>
    (KEPT_HTML.has(body.trim()) ? match : ''));
}

function tidy(code) {
  const lines = code.split('\n').map((line) => (line.trim() ? line.replace(/[ \t]+$/, '') : ''));
  const kept = [];

  for (const line of lines) {
    if (line === '' && kept.length && kept[kept.length - 1] === '') continue;
    kept.push(line);
  }

  while (kept.length && kept[0] === '') kept.shift();
  return kept.join('\n').replace(/\n+$/, '') + '\n';
}

function collect(target, files) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      collect(path.join(target, entry), files);
    }
  } else if (/\.(js|css|html)$/.test(target)) {
    files.push(target);
  }
  return files;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = targets.length ? targets : ['src'];

const files = [];
for (const root of roots) collect(path.resolve(root), files);

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const extension = path.extname(file);

  if (!all && extension !== '.js') continue;

  let stripped;
  if (extension === '.css') stripped = stripCss(before);
  else if (extension === '.html') stripped = stripHtml(before);
  else stripped = strip(before, all);

  const after = tidy(stripped);
  if (before === after) continue;
  changed += 1;
  const removed = before.split('\n').length - after.split('\n').length;
  console.log((dry ? 'would strip  ' : 'stripped  ') + path.relative(process.cwd(), file) + '  (-' + removed + ' lines)');
  if (!dry) fs.writeFileSync(file, after, 'utf8');
}

console.log('\n' + changed + ' of ' + files.length + ' files ' + (dry ? 'would change' : 'changed'));
