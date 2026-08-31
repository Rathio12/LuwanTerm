'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { SessionLog, clean } = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'session-log'));

suite('session-log');

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

check('colour codes are removed', clean(ESC + '[32mgreen' + ESC + '[0m') === 'green');
check('a full CSI sequence goes', clean(ESC + '[1;34;47mx' + ESC + '[0m') === 'x');
check('cursor movement goes', clean('a' + ESC + '[2Ab') === 'ab');
check('a window title sequence goes', clean(ESC + ']0;my title' + BEL + 'text') === 'text');
check(
  'a title ended with a string terminator goes',
  clean(ESC + ']0;t' + ESC + String.fromCharCode(92) + 'text') === 'text'
);
check('CRLF becomes one newline', clean('a' + CR + LF + 'b') === 'a' + LF + 'b');
check('a lone CR becomes a newline', clean('a' + CR + 'b') === 'a' + LF + 'b');
check('a bell is dropped', clean('ding' + BEL) === 'ding');
check('tabs survive', clean('a' + String.fromCharCode(9) + 'b').includes(String.fromCharCode(9)));
check('ordinary text is untouched', clean('plain text 123 $#@!') === 'plain text 123 $#@!');
check('a truncated escape does not hang', clean('text' + ESC) === 'text');
check('empty input is fine', clean('') === '');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-log-'));
const profile = { name: 'prod web', username: 'root', host: '10.0.0.5', port: 22 };

(async () => {
const log = new SessionLog(dir, profile);
log.write(ESC + '[32m$ whoami' + ESC + '[0m' + CR + LF + 'root' + CR + LF);
await log.close('session ended');

const written = fs.readFileSync(log.file, 'utf8');
check('a log file is created', fs.existsSync(log.file), path.basename(log.file));
check('the name is filesystem-safe', !path.basename(log.file).includes(' '), path.basename(log.file));
check('it records who and where', written.includes('root@10.0.0.5:22'));
check('output is stored without escapes', written.includes('$ whoami') && !written.includes(ESC));
check('closing is recorded', written.includes('closed: session ended'));

const raw = new SessionLog(dir, profile, { keepAnsi: true });
raw.write(ESC + '[31mred' + ESC + '[0m');
await raw.close('done');
check('escapes are kept when asked for', fs.readFileSync(raw.file, 'utf8').includes(ESC));

const broken = new SessionLog(path.join(dir, 'x'), profile);
broken.stream = null;
check('writing with no stream is harmless', (() => {
  try {
    broken.write('anything');
    broken.close('x');
    return true;
  } catch {
    return false;
  }
})());

done();
})();
