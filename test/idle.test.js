'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('idle');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-idle-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const policyPath = path.join(root, 'src', 'main', 'policy');

const withPolicy = (contents) => {
  fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify(contents));
  delete require.cache[require.resolve(policyPath)];
  delete require.cache[require.resolve(path.join(root, 'src', 'main', 'audit'))];
  delete require.cache[require.resolve(path.join(root, 'src', 'main', 'ssh', 'manager'))];
  return require(path.join(root, 'src', 'main', 'ssh', 'manager'));
};

const fakeSession = (host, idleMs) => ({
  profile: { host },
  lastActivity: Date.now() - idleMs,
  idleFor() {
    return Date.now() - this.lastActivity;
  },
});

let { SessionManager } = withPolicy({ idleTimeoutMinutes: 10 });
let manager = new SessionManager();
const closed = [];
manager.close = (id) => {
  closed.push(id);
  manager.sessions.delete(id);
};

manager.sessions.set('busy', fakeSession('a.example.com', 60 * 1000));
manager.sessions.set('stale', fakeSession('b.example.com', 11 * 60 * 1000));
manager.sessions.set('ancient', fakeSession('c.example.com', 60 * 60 * 1000));

const dropped = manager.dropIdleSessions();
check('idle sessions are dropped', dropped === 2, `${dropped} of 3`);
check('the busy one is left alone', manager.sessions.has('busy'));
check('and the stale ones are gone', !manager.sessions.has('stale') && !manager.sessions.has('ancient'));
check('they were closed rather than discarded', closed.length === 2, closed.join(', '));

const audit = require(path.join(root, 'src', 'main', 'audit'));
const entries = audit.read().filter((line) => line.event === 'session.idle-timeout');
check('each drop is recorded', entries.length === 2, `${entries.length} entries`);
check('with the host and how long it sat', entries[0].host && entries[0].idleSeconds >= 600,
  `${entries[0].host} after ${entries[0].idleSeconds}s`);

({ SessionManager } = withPolicy({ idleTimeoutMinutes: 0 }));
const relaxed = new SessionManager();
relaxed.sessions.set('ancient', fakeSession('c.example.com', 24 * 60 * 60 * 1000));
check('no timeout means nothing is dropped', relaxed.dropIdleSessions() === 0);
check('however long it has been idle', relaxed.sessions.has('ancient'));

relaxed.startIdleSweep(50);
check('and no sweep is scheduled', !relaxed.idleTimer);

({ SessionManager } = withPolicy({ idleTimeoutMinutes: 5 }));
const swept = new SessionManager();
swept.startIdleSweep(50);
check('a sweep is scheduled when a timeout is set', Boolean(swept.idleTimer));
swept.stopIdleSweep();
check('and it can be stopped', !swept.idleTimer);

fs.rmSync(dir, { recursive: true, force: true });
done();
