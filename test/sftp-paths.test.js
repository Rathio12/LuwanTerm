'use strict';

const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('sftp-paths');

const root = path.join(__dirname, '..');
const { safeJoin } = require(path.join(root, 'src', 'main', 'ssh', 'sftp'));

const B = String.fromCharCode(92);
const base = path.join(os.tmpdir(), 'luwan-downloads');

const refuses = (label, relative) => {
  try {
    const out = safeJoin(base, relative);
    check(label, false, `allowed, and produced ${out}`);
  } catch (err) {
    check(label, /not usable|separator|looks like a path|outside/.test(err.message), err.message);
  }
};

// Every one of these names came from a remote directory listing, which means it
// came from whoever runs that server.
refuses('a parent directory is refused', '..');
refuses('a nested parent is refused', `..${B}..${B}evil.exe`);
refuses('a forward-slash parent is refused', '../../evil.exe');
refuses('a parent buried mid-path is refused', 'docs/../../evil.exe');
refuses('a backslash inside a name is refused', `docs${B}..${B}evil.exe`);
refuses('an absolute Windows path is refused', `C:${B}Windows${B}System32${B}drivers${B}etc${B}hosts`);
refuses('a bare drive letter is refused', 'C:');
refuses('an absolute posix path is refused', '/etc/passwd');
refuses('an empty segment is refused', 'docs//evil.exe');
refuses('a current-directory segment is refused', 'docs/./evil.exe');
refuses('a null byte is refused', `docs${String.fromCharCode(0)}.exe`);

const ok = (label, relative, expected) => {
  try {
    const out = safeJoin(base, relative);
    check(label, out === path.join(base, ...expected), out);
  } catch (err) {
    check(label, false, `refused: ${err.message}`);
  }
};

ok('an ordinary file is allowed', 'nginx.conf', ['nginx.conf']);
ok('a nested file is allowed', 'etc/nginx/nginx.conf', ['etc', 'nginx', 'nginx.conf']);
ok('a name with dots is allowed', 'archive.tar.gz', ['archive.tar.gz']);
ok('a name that merely starts with a dot is allowed', '.bashrc', ['.bashrc']);
ok('a name containing two dots is allowed', 'my..file.txt', ['my..file.txt']);
ok('spaces and unicode are allowed', 'my folder/файл.txt', ['my folder', 'файл.txt']);

const escaped = safeJoin(base, 'a/b/c.txt');
check('the result stays under the download folder',
  escaped.startsWith(path.resolve(base) + path.sep), escaped);

done();
