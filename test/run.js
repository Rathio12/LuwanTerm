'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

const results = [];
let passed = 0;
let failed = 0;

for (const file of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(dir, file)], { encoding: 'utf8' });
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const summary = /SUMMARY (\S+) (\d+) (\d+)/.exec(output);

  const name = summary ? summary[1] : file.replace('.test.js', '');
  const ok = summary ? Number(summary[2]) : 0;
  const bad = summary ? Number(summary[3]) : 1;

  passed += ok;
  failed += bad;
  results.push({ name, passed: ok, failed: bad, ms: Date.now() - started });

  const mark = bad === 0 && summary ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name.padEnd(12)} ${String(ok).padStart(3)} checks  ${Date.now() - started}ms`);

  if (bad > 0 || !summary) {
    for (const line of output.split('\n')) {
      if (/FAIL|Error|at /.test(line) && !line.startsWith('SUMMARY')) console.log(`      ${line.trim()}`);
    }
  }
}

const total = passed + failed;
console.log('');
console.log(`${results.length} suites, ${total} checks, ${passed} passed, ${failed} failed`);

fs.writeFileSync(
  path.join(dir, 'results.json'),
  `${JSON.stringify({ suites: results, passed, failed, total, at: new Date().toISOString() }, null, 2)}\n`
);

process.exit(failed ? 1 : 0);
