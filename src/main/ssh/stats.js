'use strict';

const MARK = '@@luwan';

const PROBE = [
  `echo ${MARK}cpu`,
  'head -n 1 /proc/stat 2>/dev/null',
  `echo ${MARK}mem`,
  'head -n 5 /proc/meminfo 2>/dev/null',
  `echo ${MARK}swap`,
  'grep -E "^Swap(Total|Free):" /proc/meminfo 2>/dev/null',
  `echo ${MARK}load`,
  'cat /proc/loadavg 2>/dev/null',
  `echo ${MARK}up`,
  'cat /proc/uptime 2>/dev/null',
  `echo ${MARK}cores`,
  'grep -c "^processor" /proc/cpuinfo 2>/dev/null',
  `echo ${MARK}net`,
  'grep -v "lo:" /proc/net/dev 2>/dev/null | tail -n +3',
  `echo ${MARK}end`,
].join('; ');

const previous = new Map();
const previousNet = new Map();

function sections(text) {
  const out = {};
  let current = null;

  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith(MARK)) {
      current = line.slice(MARK.length).trim();
      out[current] = [];
      continue;
    }
    if (current && line.trim()) out[current].push(line);
  }
  return out;
}

function cpuTotals(line) {
  const parts = String(line || '').trim().split(/\s+/);
  if (parts[0] !== 'cpu' || parts.length < 5) return null;

  const numbers = parts.slice(1).map(Number).filter((value) => Number.isFinite(value));
  if (numbers.length < 4) return null;

  const total = numbers.reduce((sum, value) => sum + value, 0);
  const idle = numbers[3] + (numbers[4] || 0);
  return { total, idle };
}

function kilobytes(lines, name) {
  for (const line of lines || []) {
    const match = new RegExp('^' + name + ':\\s+(\\d+)').exec(line);
    if (match) return Number(match[1]) * 1024;
  }
  return null;
}

function counters(lines) {
  if (!lines || !lines.length) return null;

  let rx = 0;
  let tx = 0;
  const interfaces = [];

  for (const line of lines) {
    const match = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const numbers = match[2].trim().split(/\s+/).map(Number);
    if (numbers.length < 9 || !Number.isFinite(numbers[0]) || !Number.isFinite(numbers[8])) continue;

    interfaces.push(match[1].trim());
    rx += numbers[0];
    tx += numbers[8];
  }
  return interfaces.length ? { rx, tx, interfaces } : null;
}

function parse(text, sessionId, now = Date.now()) {
  const found = sections(text);
  const stats = { supported: false };

  const totals = cpuTotals((found.cpu || [])[0]);
  if (totals) {
    stats.supported = true;
    const before = previous.get(sessionId);
    previous.set(sessionId, totals);

    if (before && totals.total > before.total) {
      const busy = (totals.total - before.total) - (totals.idle - before.idle);
      stats.cpu = Math.max(0, Math.min(100, Math.round((busy / (totals.total - before.total)) * 100)));
    }
  }

  const memTotal = kilobytes(found.mem, 'MemTotal');
  const memAvailable = kilobytes(found.mem, 'MemAvailable');
  const memFree = kilobytes(found.mem, 'MemFree');
  const usable = memAvailable === null ? memFree : memAvailable;

  if (memTotal && usable !== null) {
    stats.supported = true;
    stats.memory = {
      total: memTotal,
      used: memTotal - usable,
      percent: Math.round(((memTotal - usable) / memTotal) * 100),
    };
  }

  const swapTotal = kilobytes(found.swap, 'SwapTotal');
  const swapFree = kilobytes(found.swap, 'SwapFree');
  if (swapTotal && swapFree !== null) {
    stats.swap = {
      total: swapTotal,
      used: swapTotal - swapFree,
      percent: swapTotal ? Math.round(((swapTotal - swapFree) / swapTotal) * 100) : 0,
    };
  }

  const load = String((found.load || [])[0] || '').trim().split(/\s+/).slice(0, 3).map(Number);
  if (load.length === 3 && load.every(Number.isFinite)) {
    stats.supported = true;
    stats.load = load;
  }

  const uptime = Number(String((found.up || [])[0] || '').trim().split(/\s+/)[0]);
  if (Number.isFinite(uptime)) stats.uptime = Math.round(uptime);

  const cores = Number(String((found.cores || [])[0] || '').trim());
  if (Number.isFinite(cores) && cores > 0) stats.cores = cores;

  const traffic = counters(found.net);
  if (traffic) {
    stats.supported = true;
    const before = previousNet.get(sessionId);
    previousNet.set(sessionId, { ...traffic, at: now });

    if (before && now > before.at) {
      const seconds = (now - before.at) / 1000;
      stats.network = {
        rx: Math.max(0, Math.round((traffic.rx - before.rx) / seconds)),
        tx: Math.max(0, Math.round((traffic.tx - before.tx) / seconds)),
        interfaces: traffic.interfaces,
      };
    } else {
      stats.network = { interfaces: traffic.interfaces };
    }
  }

  return stats;
}

module.exports = {
  PROBE,
  parse,

  async read(session) {
    const result = await session.exec(PROBE);
    const stats = parse(result.stdout, session.id);

    if (!stats.supported) {
      return {
        supported: false,
        reason: 'This server does not report /proc, so there is nothing to read.',
      };
    }
    return { ...stats, at: Date.now() };
  },

  forget(sessionId) {
    previous.delete(sessionId);
    previousNet.delete(sessionId);
  },

  clear() {
    previous.clear();
    previousNet.clear();
  },
};
