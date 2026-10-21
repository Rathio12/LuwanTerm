'use strict';

const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('recent');

const dir = installElectronStub();
const src = path.join(__dirname, '..', 'src', 'main', 'store');
const hosts = require(path.join(src, 'hosts'));
const settings = require(path.join(src, 'settings'));
const recent = require(path.join(src, 'recent'));

const vps = hosts.save({ name: 'vps', host: '192.168.30.10', port: 22, username: 'root', auth: 'key' });
const web = hosts.save({ name: 'web', host: 'web.example.com', port: 2222, username: 'deploy', auth: 'key' });

check('nothing is listed before anything is opened', recent.list().length === 0);

recent.opened('sess_a', vps.id);
recent.closed('sess_a');
recent.opened('sess_b', web.id);
recent.opened('sess_c', vps.id);

const listed = recent.list();
check('each host appears once', listed.length === 2);
check('the newest comes first', listed[0].hostId === vps.id && listed[1].hostId === web.id);
check('it counts every session to that host', listed[0].count === 2 && listed[1].count === 1);
check('a session still open has no close time', listed[0].closedAt === 0);
check('it shows the saved name', listed[0].name === 'vps');
check('a standard port is left out of the target', listed[0].target === 'root@192.168.30.10');
check('any other port is shown', listed[1].target === 'deploy@web.example.com:2222');

recent.closed('sess_c');
check('closing a session records when', recent.list()[0].closedAt > 0);
check('closing an unknown session changes nothing', (() => { recent.closed('sess_zzz'); return recent.list().length === 2; })());

const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'recent.json'), 'utf8'));
check('it is written to its own file', Array.isArray(onDisk.entries) && onDisk.entries.length === 3);
check('the file holds ids and times, not addresses or names',
  !JSON.stringify(onDisk).includes('192.168') && !JSON.stringify(onDisk).includes('vps'));

hosts.remove(web.id);
check('a deleted host drops out of the list', recent.list().every((entry) => entry.hostId !== web.id));

for (let index = 0; index < recent.KEEP + 10; index += 1) recent.opened(`sess_${index}`, vps.id);
check('history is capped', JSON.parse(fs.readFileSync(path.join(dir, 'recent.json'), 'utf8')).entries.length === recent.KEEP);
check('but the count is not', recent.list()[0].count === recent.KEEP + 12);
check('the list is capped too', recent.list(3).length <= 3);

settings.set({ recentSessions: false });
check('switched off, nothing is listed', recent.list().length === 0);
const before = JSON.parse(fs.readFileSync(path.join(dir, 'recent.json'), 'utf8')).entries[0].sessionId;
recent.opened('sess_private', vps.id);
check('switched off, nothing is recorded',
  JSON.parse(fs.readFileSync(path.join(dir, 'recent.json'), 'utf8')).entries[0].sessionId === before);
settings.set({ recentSessions: true });

recent.clear();
check('clearing forgets everything', recent.list().length === 0);

const audit = [
  JSON.stringify({ at: '2026-10-20T10:00:00Z', event: 'host-key.trusted', host: '192.168.30.10', port: 22 }),
  JSON.stringify({ at: '2026-10-20T10:00:01Z', event: 'session.open', sessionId: 'old_1', host: '192.168.30.10', port: 22, username: 'root' }),
  JSON.stringify({ at: '2026-10-20T10:30:01Z', event: 'session.close', sessionId: 'old_1', host: '192.168.30.10' }),
  JSON.stringify({ at: '2026-10-21T08:00:00Z', event: 'session.open', sessionId: 'old_2', host: '192.168.30.10', port: 22, username: 'root' }),
  JSON.stringify({ at: '2026-10-21T08:00:00Z', event: 'session.open', sessionId: 'old_3', host: 'gone.example.com', port: 22, username: 'x' }),
  'not json at all',
];
const { entries: imported, totals } = recent.fromAudit(audit, hosts.list());
check('past sessions are read back from the audit log', imported.length === 2);
check('they are matched to the saved host', imported.every((entry) => entry.hostId === vps.id));
check('newest first, with when each one closed',
  imported[0].sessionId === 'old_2' && imported[1].closedAt === Date.parse('2026-10-20T10:30:01Z'));
check('it totals every past session per host', totals[vps.id] === 2);
check('a session to a host no longer saved is skipped', !imported.some((entry) => entry.sessionId === 'old_3'));

done();
