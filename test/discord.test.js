'use strict';

const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('discord');

const root = path.join(__dirname, '..');
const OP = { HANDSHAKE: 0, FRAME: 1 };
const S = String.fromCharCode(92);

const base = process.platform === 'win32'
  ? `${S}${S}.${S}pipe${S}luwanterm-test-${process.pid}-`
  : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'luwan-rpc-')), 'ipc-');

process.env.LUWAN_DISCORD_PIPE = base;
process.env.LUWAN_DISCORD_RECONNECT_MS = '400';
process.env.LUWAN_DISCORD_HANDSHAKE_MS = '600';
process.env.LUWAN_DISCORD_REFRESH_MS = '700';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function frames(socket, onFrame) {
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0);
      const length = buffer.readInt32LE(4);
      if (buffer.length < 8 + length) return;
      const body = buffer.subarray(8, 8 + length).toString('utf8');
      buffer = buffer.subarray(8 + length);
      onFrame(op, JSON.parse(body));
    }
  });
}

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const head = Buffer.allocUnsafe(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** A Discord that answers the handshake, unless told to stay silent. */
function fakeDiscord({ silent = false } = {}) {
  const activities = [];
  let live = null;

  const sockets = new Set();
  const server = net.createServer((socket) => {
    live = socket;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    frames(socket, (op, message) => {
      if (op === OP.HANDSHAKE) {
        if (silent) return;
        socket.write(encode(OP.FRAME, { evt: 'READY', data: { user: { username: 'tester' } } }));
        return;
      }
      if (op === OP.FRAME && message.cmd === 'SET_ACTIVITY') activities.push(message.args.activity);
    });
  });

  return {
    activities,
    listen: () => new Promise((resolve) => server.listen(`${base}0`, resolve)),
    drop: () => { if (live) live.destroy(); },
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close(() => resolve());
    }),
  };
}

(async () => {
  const discord = require(path.join(root, 'src', 'main', 'discord'));
  const presence = require(path.join(root, 'src', 'main', 'presence'));

  check('a client id is baked in', Boolean(discord.CLIENT_ID),
    discord.CLIENT_ID || 'run npm run bake first - without one the client refuses to start');

  /* ---------- What may be said out loud ---------- */

  check('an IPv4 address is refused as a label', presence.looksLikeAddress('198.51.100.7'));
  check('a hostname is refused', presence.looksLikeAddress('example.com'));
  check('an internal hostname is refused', presence.looksLikeAddress('prod-1.internal'));
  check('a host and port are refused', presence.looksLikeAddress('example.com:22'));
  check('a path is refused', presence.looksLikeAddress('/home/deploy'));
  check('a provider name is allowed', !presence.looksLikeAddress('Hetzner'));
  check('a home server is allowed', !presence.looksLikeAddress('Home server'));

  const optedIn = { provider: 'Hetzner', name: 'prod-web', discordShow: true };
  const optedOut = { provider: 'Hetzner', name: 'prod-web' };

  check('a host switched off says nothing',
    presence.labelFor(optedOut, { discordLabel: 'provider' }) === '');
  check('the provider is the default label',
    presence.labelFor(optedIn, { discordLabel: 'provider' }) === 'Hetzner');
  check('the profile name is only used when asked for',
    presence.labelFor(optedIn, { discordLabel: 'name' }) === 'prod-web');
  check('and the label can be switched off entirely',
    presence.labelFor(optedIn, { discordLabel: 'none' }) === '');
  check('an address-shaped provider is dropped',
    presence.labelFor({ provider: 'example.com', discordShow: true }, { discordLabel: 'provider' }) === '');

  const hosts = {
    h1: { provider: 'Hetzner', name: 'prod-web', discordShow: false },
    h2: { provider: 'Hetzner', name: 'cloud-box', discordShow: true },
  };
  const hostOf = (id) => hosts[id] || null;
  const two = [
    { id: 's1', hostId: 'h1' },
    { id: 's2', hostId: 'h2' },
  ];

  const idle = presence.buildPresence({ sessions: [], hostOf, settings: {} });
  check('with no sessions it shows the app as idle', idle && idle.details === 'Idle' && idle.state === undefined);
  check('and idle can be switched off',
    presence.buildPresence({ sessions: [], hostOf, settings: { discordShowIdle: false } }) === null);

  const quiet = presence.buildPresence({ sessions: two, hostOf, settings: {} });
  const wire = JSON.stringify(quiet);
  check('a profile name never appears on the wire', !wire.includes('cloud-box'));
  check('nor does a provider the host has not opted into', !wire.includes('prod-web'));
  check('nor does an address', !wire.includes('198.51.100') && !wire.includes('example.com'));
  check('no session count is sent by default', quiet.state === undefined);
  check('the activity type stands alone without a label', quiet.details === 'SSH');

  const labelled = presence.buildPresence({ sessions: two, hostOf, settings: { discordLabel: 'provider' } });
  check('an opted-in host shows its provider', labelled.details === 'SSH · Hetzner');

  const counted = presence.buildPresence({ sessions: two, hostOf, settings: { discordShowCount: true } });
  check('the session count appears when asked for', counted.state === '2 sessions');

  const singular = presence.buildPresence({
    sessions: [two[0]], hostOf, settings: { discordShowCount: true },
  });
  check('one session is not two sessions', singular.state === '1 session');

  const sftp = presence.buildPresence({
    sessions: two, hostOf, settings: {}, focus: { sessionId: 's1', view: 'files' },
  });
  check('the file panel reports itself as SFTP', sftp.details === 'SFTP');

  const tunnel = presence.buildPresence({
    sessions: two, hostOf, settings: { discordLabel: 'provider' },
    focus: { sessionId: 's2', view: 'tunnels' },
  });
  check('the tunnel panel reports itself as a tunnel', tunnel.details === 'Tunnel · Hetzner');

  const gone = presence.buildPresence({
    sessions: two, hostOf, settings: {}, focus: { sessionId: 'closed', view: 'files' },
  });
  check('a focus left behind by a closed session is ignored', gone.details === 'SSH');

  /* ---------- The card itself ---------- */

  const buttons = [
    { label: 'View on GitHub', url: 'https://github.com/Rathio12/LuwanTerm' },
    { label: 'Website', url: 'https://rathio12.github.io/LuwanTerm/' },
    { label: 'Discord', url: 'https://discord.gg/extra' },
  ];
  const card = discord.buildActivity(
    { details: 'SSH · Hetzner', state: '2 sessions' },
    { largeImage: 'luwan_logo', largeText: 'Luwan Shell', buttons }
  );

  check('the brand is what hovering the image says', card.assets.large_text === 'Luwan Shell');
  check('the image key is an uploaded asset, not a URL', card.assets.large_image === 'luwan_logo');
  check('an image URL carries the version, so Discord fetches a new mark after a release',
    presence.imageFor('https://example.com/icon.png', '2.2.0') === 'https://example.com/icon.png?v=2.2.0');
  check('a URL that already has a version gets the current one',
    presence.imageFor('https://example.com/icon.png?v=1.0.0', '2.2.0') === 'https://example.com/icon.png?v=2.2.0');
  check('an uploaded asset key is left alone', presence.imageFor('luwan_logo', '2.2.0') === 'luwan_logo');
  check('exactly two buttons are sent', card.buttons.length === 2, `${card.buttons.length}`);
  check('and they are the project and the site',
    card.buttons[0].label === 'View on GitHub' && card.buttons[1].label === 'Website');
  check('the timer runs from one fixed start', Number.isFinite(card.timestamps.start));
  check('the details it was given survive', card.details === 'SSH · Hetzner' && card.state === '2 sessions');

  const bare = discord.buildActivity({ details: 'SSH' }, { showTimer: false, buttons: [] });
  check('the timer can be turned off', bare.timestamps === undefined);
  check('an absent label leaves no state field', bare.state === undefined);

  /* ---------- At most one update a quarter of a minute ---------- */

  const sent = [];
  const timers = [];
  let clock = 0;
  const scheduler = presence.createScheduler({
    now: () => clock,
    delay: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    cancel: () => { timers.length = 0; },
    send: (payload) => sent.push(payload),
  });

  check('the first payload goes out at once', scheduler.push({ details: 'a' }) === true);
  check('and nothing was held back', sent.length === 1);
  check('the same payload again is not sent', scheduler.push({ details: 'a' }) === false && sent.length === 1);
  check('a change inside the window waits', scheduler.push({ details: 'b' }) === false && sent.length === 1);
  check('and only one timer is pending', timers.length === 1);

  clock = 20000;
  timers[0].fn();
  check('the queued payload fires when the window closes',
    sent.length === 2 && sent[1].details === 'b', `${sent.length} sent`);

  check('a payload with nothing new is still not sent',
    scheduler.push({ details: 'b' }) === false && sent.length === 2);

  scheduler.push({ details: 'c' });
  scheduler.stop();
  check('stopping drops what was queued', sent.length === 2);

  /* ---------- The pipe ---------- */

  const server = fakeDiscord();
  await server.listen();

  discord.start({ largeImage: 'luwan_logo', largeText: 'Luwan Shell' });
  discord.setPresence({ details: '2 sessions', state: 'Connected' });
  await wait(400);

  check('it connects and handshakes', discord.isConnected());
  check('and sends the presence', server.activities.length === 1, `${server.activities.length} sent`);
  check('with the details it was given', (server.activities[0] || {}).details === '2 sessions');

  server.drop();
  await wait(300);
  check('a dropped connection is noticed', !discord.isConnected());

  await wait(1500);
  check('it reconnects on its own', discord.isConnected());
  check('and re-sends the presence without being asked', server.activities.length >= 2,
    `${server.activities.length} sent`);
  check('which is still the last thing it was told', (server.activities[1] || {}).details === '2 sessions');

  const before = server.activities.length;
  await wait(1600);
  check('and it re-asserts the presence on a timer', server.activities.length > before,
    `${before} then ${server.activities.length}`);

  discord.stop();
  await server.close();

  const silent = fakeDiscord({ silent: true });
  await silent.listen();
  discord.start({});
  discord.setPresence({ details: 'waiting' });
  await wait(500);
  check('a server that never answers leaves it unconnected', !discord.isConnected());

  await wait(1200);
  check('the handshake times out rather than hanging for good', !discord.isConnected());
  check('and it keeps trying', true, 'the socket was torn down and a reconnect scheduled');

  discord.stop();
  await silent.close();
  check('stopping clears everything', !discord.isConnected());

  done();
})();
