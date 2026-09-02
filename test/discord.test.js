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
  check('a client id is baked in', Boolean(discord.CLIENT_ID),
    discord.CLIENT_ID || 'run npm run bake first - without one the client refuses to start');

  const server = fakeDiscord();
  await server.listen();

  discord.start({ largeImage: 'https://example.invalid/icon.png', largeText: 'LuwanTerm' });
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
