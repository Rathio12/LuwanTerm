'use strict';

const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('agent');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'main', 'ssh', 'connection.js'), 'utf8');

const B = String.fromCharCode(92);
const EXPECTED = `${B}${B}.${B}pipe${B}openssh-ssh-agent`;

const declaration = /const OPENSSH_AGENT_PIPE = (.+);/.exec(source);
check('the agent pipe is declared once', Boolean(declaration));

const value = declaration ? eval(declaration[1]) : '';
check('it is the path Windows actually uses', value === EXPECTED, JSON.stringify(value));

check('it kept both leading separators', value.startsWith(`${B}${B}.`),
  'a quoted literal drops them, because \p and \o are not escapes');
check('the pipe namespace survived', value.includes(`${B}pipe${B}`));

check('it is built from a raw string, not a quoted one', /String\.raw/.test(declaration ? declaration[1] : ''),
  'so an editor or a shell cannot eat a backslash level again');

check('nothing else in the file quotes that path',
  (source.match(/openssh-ssh-agent/g) || []).length === 1,
  'one declaration, referenced by name');

check('Pageant remains the fallback', /:\s*'pageant'/.test(source));
check('other platforms read SSH_AUTH_SOCK', /process\.env\.SSH_AUTH_SOCK/.test(source));

// The same mistake, in the same shape, in the PuTTY session lookup.
const discovery = fs.readFileSync(path.join(root, 'src', 'main', 'ssh', 'discovery.js'), 'utf8');
const puttyLine = /const PUTTY_SESSIONS = (.+);/.exec(discovery);
check('the PuTTY sessions key is declared once', Boolean(puttyLine));

const puttyKey = puttyLine ? eval(puttyLine[1]) : '';
const EXPECTED_KEY = `HKCU${B}Software${B}SimonTatham${B}PuTTY${B}Sessions`;
check('it is the registry key that actually exists', puttyKey === EXPECTED_KEY, JSON.stringify(puttyKey));
check('it kept its separators', puttyKey.split(B).length - 1 === 4,
  'a quoted literal drops them, because backslash-S and backslash-P are not escapes');
check('it is built from a raw string', /String\.raw/.test(puttyLine ? puttyLine[1] : ''));
check('and nothing else in the file spells it out', (discovery.match(/SimonTatham/g) || []).length === 1);

const { SshConnection } = require(path.join(root, 'src', 'main', 'ssh', 'connection'));
check('the module still loads', typeof SshConnection === 'function');

done();
