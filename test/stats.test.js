'use strict';

const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('stats');

const root = path.join(__dirname, '..');
const stats = require(path.join(root, 'src', 'main', 'ssh', 'stats'));

const NL = String.fromCharCode(10);
const block = (parts) => parts.join(NL);

const linux = (cpu, memAvailable) => block([
  '@@luwancpu',
  cpu,
  '@@luwanmem',
  'MemTotal:       16384000 kB',
  'MemFree:         2048000 kB',
  `MemAvailable:    ${memAvailable} kB`,
  'Buffers:          512000 kB',
  'Cached:          4096000 kB',
  '@@luwanswap',
  'SwapTotal:       4096000 kB',
  'SwapFree:        3072000 kB',
  '@@luwanload',
  '0.52 0.41 0.38 2/431 12345',
  '@@luwanup',
  '84600.12 300000.00',
  '@@luwancores',
  '8',
  '@@luwanend',
]);

check('the probe runs one command, not many round trips', stats.PROBE.split(';').length > 5);
check('and it never writes to the terminal the user is typing in',
  !stats.PROBE.includes('\u0004') && stats.PROBE.startsWith('echo '));

stats.clear();
const first = stats.parse(linux('cpu  1000 50 300 8000 100 0 20 0 0 0', 8192000), 'a');
check('the first sample has no CPU figure yet', first.cpu === undefined, 'it needs two to make a delta');
check('but memory is there immediately', first.memory.total === 16384000 * 1024);
check('used memory ignores cache, via MemAvailable',
  first.memory.used === (16384000 - 8192000) * 1024, `${first.memory.percent}%`);
check('and the percentage is right', first.memory.percent === 50);
check('swap is read too', first.swap.percent === 25, `${first.swap.percent}%`);
check('load average comes through', first.load[0] === 0.52 && first.load[2] === 0.38);
check('so does uptime', first.uptime === 84600);
check('and the core count', first.cores === 8);
check('the server is reported as supported', first.supported);

const second = stats.parse(linux('cpu  1100 50 350 8400 100 0 20 0 0 0', 8192000), 'a');
check('the second sample yields a CPU figure', typeof second.cpu === 'number', `${second.cpu}%`);
check('and it is the busy share of the delta, not a total', second.cpu === 27,
  '150 busy of 550 ticks');

const other = stats.parse(linux('cpu  9000 0 0 1000 0 0 0 0 0 0', 8192000), 'b');
check('a different session keeps its own history', other.cpu === undefined);

stats.forget('a');
const afterForget = stats.parse(linux('cpu  1200 50 400 8800 100 0 20 0 0 0', 8192000), 'a');
check('forgetting a session drops its history', afterForget.cpu === undefined);

const busy = stats.parse(linux('cpu  2000 50 400 8800 100 0 20 0 0 0', 8192000), 'a');
check('a fully busy delta reads as high, not over 100', busy.cpu <= 100 && busy.cpu > 90, `${busy.cpu}%`);

const noAvailable = stats.parse(block([
  '@@luwanmem',
  'MemTotal:        1000000 kB',
  'MemFree:          250000 kB',
  '@@luwanend',
]), 'c');
check('an older kernel without MemAvailable falls back to MemFree',
  noAvailable.memory.percent === 75, `${noAvailable.memory.percent}%`);

const empty = stats.parse(block(['@@luwancpu', '@@luwanmem', '@@luwanend']), 'd');
check('a server with no /proc is reported unsupported', !empty.supported);

const noise = stats.parse('bash: /proc/stat: No such file or directory', 'e');
check('and so is output that is not the probe at all', !noise.supported);

const partial = stats.parse(block(['@@luwanload', '0.10 0.20 0.30', '@@luwanend']), 'f');
check('a server that reports only some of it still reports that', partial.supported);
check('with the parts it has', partial.load[1] === 0.2);
check('and nothing invented for the parts it does not', partial.memory === undefined);

const netBlock = (rxBytes, txBytes) => block([
  '@@luwannet',
  `  eth0: ${rxBytes} 120 0 0 0 0 0 0 ${txBytes} 90 0 0 0 0 0 0`,
  '@@luwanend',
]);

stats.clear();
const t0 = stats.parse(netBlock(1000, 2000), 'n', 10000);
check('the first network sample has no rate yet', t0.network.rx === undefined);
check('but it names the interfaces', t0.network.interfaces[0] === 'eth0');

const t1 = stats.parse(netBlock(6000, 4000), 'n', 15000);
check('the second gives bytes per second', t1.network.rx === 1000, `${t1.network.rx} B/s in`);
check('for both directions', t1.network.tx === 400, `${t1.network.tx} B/s out`);

const wrapped = stats.parse(netBlock(10, 10), 'n', 20000);
check('a counter that resets does not read as negative traffic',
  wrapped.network.rx === 0 && wrapped.network.tx === 0);

const loopback = stats.parse(block(['@@luwannet', '@@luwanend']), 'n2');
check('a server reporting no interfaces reports no network', loopback.network === undefined);

done();
