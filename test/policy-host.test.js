'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('policy-host');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-host-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const policyPath = path.join(root, 'src', 'main', 'policy');

// A DNS the test controls, so the checks are about the policy and not the network.
const forward = {
  'db.internal': ['10.4.0.9'],
  'web.prod.example.com': ['203.0.113.7'],
  'shadow.example.net': ['10.4.0.9'],
};
const reverse = { '10.4.0.9': ['db.internal'], '203.0.113.7': ['web.prod.example.com'] };

const realResolve = Module._resolveFilename;
const stub = path.join(os.tmpdir(), `luwan-dns-stub-${process.pid}.js`);
require.cache[stub] = {
  id: stub,
  filename: stub,
  loaded: true,
  exports: {
    promises: {
      lookup: async (name) => {
        const found = forward[name];
        if (!found) throw new Error('ENOTFOUND');
        return found.map((address) => ({ address, family: 4 }));
      },
      reverse: async (ip) => {
        const found = reverse[ip];
        if (!found) throw new Error('ENOTFOUND');
        return found;
      },
    },
  },
};
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === 'dns') return stub;
  return realResolve.call(this, request, ...rest);
};

const load = (contents) => {
  fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify(contents));
  delete require.cache[require.resolve(policyPath)];
  return require(policyPath);
};

(async () => {
  let policy = load({ blockedHosts: ['*.internal'] });

  check('the blocked name is refused', !(await policy.checkHost('db.internal')).allowed);

  const byIp = await policy.checkHost('10.4.0.9');
  check('and so is its address, which used to slip through', !byIp.allowed, byIp.reason);
  check('the audit gets told why', byIp.reason.includes('blocklist'));

  const byAlias = await policy.checkHost('shadow.example.net');
  check('and another name pointing at it is caught too', !byAlias.allowed, byAlias.reason);

  check('an unrelated host still connects', (await policy.checkHost('web.prod.example.com')).allowed);

  policy = load({ blockedHosts: ['10.4.0.0/16'] });
  check('a CIDR blocks the address', !(await policy.checkHost('10.4.0.9')).allowed);
  check('and the name that resolves into it', !(await policy.checkHost('db.internal')).allowed);
  check('while an address outside it is fine', (await policy.checkHost('203.0.113.7')).allowed);

  policy = load({ allowedHosts: ['*.prod.example.com'] });
  check('an allowed name connects', (await policy.checkHost('web.prod.example.com')).allowed);
  check('its address connects too', (await policy.checkHost('203.0.113.7')).allowed);
  check('something else does not', !(await policy.checkHost('db.internal')).allowed);

  const unknown = await policy.checkHost('nowhere.example.org');
  check('a name that will not resolve is refused, not waved through', !unknown.allowed, unknown.reason);
  check('and says the resolution failed', unknown.reason.includes('could not be resolved'));

  policy = load({ blockedHosts: ['*.internal'] });
  check('a trailing dot does not evade the match', !(await policy.checkHost('db.internal.')).allowed);
  check('nor does capitalisation', !(await policy.checkHost('DB.INTERNAL')).allowed);
  check('nor whitespace', !(await policy.checkHost('  db.internal  ')).allowed);

  policy = load({});
  check('with no rules at all nothing is resolved or refused',
    (await policy.checkHost('anything.example.com')).allowed);
  check('and it says so', (await policy.checkHost('anything.example.com')).reason === 'no host rules');
  check('an empty host is still refused', !(await policy.checkHost('')).allowed);

  Module._resolveFilename = realResolve;
  fs.rmSync(dir, { recursive: true, force: true });
  done();
})();
