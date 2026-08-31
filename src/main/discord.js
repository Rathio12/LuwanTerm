'use strict';

const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CLIENT_ID = require('./config').discordClientId;

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const MAX_PIPE = 10;
const RECONNECT_MS = 20000;

let socket = null;
let ready = false;
let config = {};
let pending = null;
let reconnectTimer = null;
let stopped = true;
const startedAt = Date.now();

function socketPath(index) {

  if (process.platform === 'win32') return String.raw`\\?\pipe\discord-ipc-${index}`;

  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    os.tmpdir();
  return path.join(base, `discord-ipc-${index}`);
}

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const head = Buffer.allocUnsafe(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

function send(op, payload) {
  if (!socket || socket.destroyed) return false;
  try {
    socket.write(encode(op, payload));
    return true;
  } catch {
    return false;
  }
}

function connect(index = 0) {
  if (stopped || index >= MAX_PIPE) {
    if (!stopped) scheduleReconnect();
    return;
  }

  const attempt = net.createConnection({ path: socketPath(index) });
  attempt.setNoDelay(true);

  const retryNext = () => {
    attempt.removeAllListeners();
    attempt.destroy();
    connect(index + 1);
  };

  attempt.once('error', retryNext);
  attempt.once('connect', () => {
    attempt.removeListener('error', retryNext);
    bind(attempt);
    send(OP.HANDSHAKE, { v: 1, client_id: String(config.clientId) });
  });
}

function bind(connection) {
  socket = connection;
  let buffer = Buffer.alloc(0);

  connection.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0);
      const length = buffer.readInt32LE(4);
      if (buffer.length < 8 + length) break;

      const body = buffer.subarray(8, 8 + length).toString('utf8');
      buffer = buffer.subarray(8 + length);
      handleFrame(op, body);
    }
  });

  connection.on('error', () => connection.destroy());
  connection.on('close', () => {
    ready = false;
    socket = null;
    if (!stopped) scheduleReconnect();
  });
}

function handleFrame(op, body) {
  if (op === OP.PING) {
    send(OP.PONG, safeParse(body));
    return;
  }
  if (op === OP.CLOSE) {
    if (socket) socket.destroy();
    return;
  }
  if (op !== OP.FRAME) return;

  const message = safeParse(body);
  if (message && message.evt === 'READY') {
    ready = true;
    if (pending) push(pending);
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || stopped) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!stopped) connect(0);
  }, RECONNECT_MS);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

function push(presence) {
  const activity = {
    details: presence.details || undefined,
    state: presence.state || undefined,
    timestamps: { start: startedAt },
    instance: false,
  };

  if (config.largeImage) {
    activity.assets = { large_image: config.largeImage };
    if (config.largeText) activity.assets.large_text = config.largeText;
  }

  const buttons = (config.buttons || [])
    .filter((button) => button && button.label && /^https?:\/\//i.test(button.url || ''))
    .slice(0, 2)
    .map((button) => ({ label: String(button.label).slice(0, 31), url: button.url }));

  if (buttons.length) activity.buttons = buttons;

  send(OP.FRAME, {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: crypto.randomUUID(),
  });
}

module.exports = {
  CLIENT_ID,

  start(options = {}) {
    this.stop();
    if (!CLIENT_ID) return;
    config = { ...options, clientId: CLIENT_ID };
    stopped = false;
    connect(0);
  },

  setPresence(presence) {
    pending = presence || null;
    if (ready && pending) push(pending);
  },

  isConnected() {
    return ready;
  },

  stop() {
    stopped = true;
    ready = false;
    pending = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket) {
      try {
        socket.destroy();
      } catch {  }
    }
    socket = null;
  },
};
