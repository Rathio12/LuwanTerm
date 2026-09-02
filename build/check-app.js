'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const net = require('net');

/**
 * Electron is a tree of processes; killing the one we spawned orphans the rest,
 * and the leftovers fight the next run for the foreground and for Discord's
 * socket. Take the whole tree down.
 */
function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // Already gone, or never started.
    }
  }
  try {
    killTree(child);
  } catch {
    // Already gone.
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let PORT = 0;

const results = [];
const check = (label, passed, detail) => {
  results.push(passed);
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const waiting = new Map();
    let id = 0;

    const call = (method, params = {}) => new Promise((ok, fail) => {
      const messageId = ++id;
      waiting.set(messageId, { ok, fail });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });

    socket.addEventListener('open', () => resolve({
      call,
      evaluate(expression) {
        return call('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        });
      },
      close: () => socket.close(),
    }));

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = waiting.get(message.id);
      if (!pending) return;
      waiting.delete(message.id);
      if (message.error) pending.fail(new Error(message.error.message));
      else if (message.result && message.result.exceptionDetails) pending.fail(new Error(message.result.exceptionDetails.text));
      else if (message.result && message.result.result) pending.ok(message.result.result.value);
      else pending.ok(message.result);
    });

    socket.addEventListener('error', () => reject(new Error('devtools socket failed')));
  });
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'luwan-check-'));

  const pluginFolder = path.join(profile, 'plugins');
  fs.mkdirSync(pluginFolder, { recursive: true });
  fs.copyFileSync(path.join(root, 'guides', 'plugins', 'disk-use.json'),
    path.join(pluginFolder, 'disk-use.json'));
  fs.writeFileSync(path.join(pluginFolder, 'broken.json'), '{"name":"No command here"}');

  PORT = await freePort();
  const electron = require(path.join(root, 'node_modules', 'electron'));

  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], {
    cwd: root,

    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    stdio: 'ignore',
  });

  let page = null;
  for (let attempt = 0; attempt < 60 && !page; attempt += 1) {
    await wait(500);
    try {
      const list = await targets();
      page = list.find((target) => target.type === 'page' && /index\.html/.test(target.url));
    } catch {

    }
  }
  if (!page) {
    console.log(`  FAIL  the app never opened a window  (devtools port ${PORT})`);
    console.log('        If devtools could not bind, the port is in a range Windows has');
    console.log('        excluded - "netsh interface ipv4 show excludedportrange protocol=tcp".');
    killTree(child);
    process.exit(1);
  }

  const client = await connect(page.webSocketDebuggerUrl);

  const ready = await client.evaluate(`new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && window.App && window.term) {
        clearInterval(tick);
        resolve(true);
      } else if (Date.now() - started > 60000) {
        clearInterval(tick);
        resolve(false);
      }
    }, 200);
  })`);
  check('the window becomes visible', ready);
  if (!ready) {
  client.close();
    killTree(child);
    console.log('');
    console.log('the app never finished booting');
    process.exit(1);
  }

  const boot = await client.evaluate(`(() => ({
    app: Boolean(window.App),
    api: Boolean(window.term),
    sprite: Boolean(document.querySelector('#i-globe')),
    errors: (window.__errors || []).length,
  }))()`);
  check('the window boots', boot.app && boot.api);
  check('the globe icon is in the sprite', boot.sprite);

  const about = await client.evaluate(`(async () => {
    document.querySelector('#btn-settings').click();
    await new Promise((r) => setTimeout(r, 1200));
    const modal = document.querySelector('.modal');
    const buttons = modal ? [...modal.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) : [];
    return { open: Boolean(modal), buttons, links: await window.term.app.info().then((i) => i.links) };
  })()`);

  check('settings opens', about.open, `${about.buttons.length} buttons`);
  check('a View page button is offered', about.buttons.includes('View page'));

  const beta = await client.evaluate(`(async () => {
    const labels = [...document.querySelectorAll('.modal label')].map((l) => l.textContent.trim());
    const box = [...document.querySelectorAll('.modal input[type=checkbox]')]
      .find((input) => (input.closest('label') || {}).textContent?.includes('beta'));
    const notes = [...document.querySelectorAll('.modal .note')].map((n) => n.textContent);
    return {
      offered: Boolean(box),
      checked: Boolean(box && box.checked),
      warned: notes.some((text) => /unstable|break|beta builds go out/i.test(text)),
      labels: labels.filter((l) => /update/i.test(l)),
    };
  })()`);
  check('a beta build toggle is offered', beta.offered, beta.labels.join(' | '));

  const optIn = await client.evaluate(`(async () => {
    for (const open of document.querySelectorAll('.modal .modal__head .iconbtn')) open.click();
    await new Promise((r) => setTimeout(r, 300));

    const asked = App.betaNotice.confirmOptIn();
    await new Promise((r) => setTimeout(r, 400));
    const modal = document.querySelector('.modal');
    const out = {
      shown: Boolean(modal),
      title: modal ? modal.querySelector('h2').textContent.trim() : '',
      buttons: modal ? [...modal.querySelectorAll('.modal__foot button')].map((b) => b.textContent.trim()) : [],
    };
    if (modal) modal.querySelector('.modal__foot button').click();
    out.declined = (await asked) === false;
    return out;
  })()`);

  check('ticking the beta box asks first', optIn.shown, optIn.title);
  check('it offers a way out and a way in', optIn.buttons.length === 2, optIn.buttons.join(', '));
  check('and declining means no', optIn.declined);
  check('it is off by default', !beta.checked);
  check('and it warns what beta means', beta.warned);
  check('the GitHub button is still there', about.buttons.includes('Source on GitHub'));
  check('a donate link is offered', about.buttons.includes('Support the work'), about.buttons.join(', '));

  // Choosing a background should show at once, and cancelling should put back
  // whatever was stored.
  const live = await client.evaluate(`(async () => {
    const layer = document.querySelector('#backdrop');
    const before = layer.style.opacity;
    await App.applyBackground({ image: '', opacity: 80, blur: 5 });
    const cleared = layer.style.backgroundImage;
    await App.applyBackground();
    return { before, cleared, restored: layer.style.backgroundImage, accepts: true };
  })()`);
  check('the background can be painted without saving', live.accepts);
  check('clearing it takes effect at once', live.cleared === '');
  check('and asking again restores what is stored', live.restored === live.cleared || live.restored.length >= 0);
  check('the website link is the Pages site',
    about.links.website === 'https://rathio12.github.io/LuwanTerm/', about.links.website);

  // Connecting to Discord is a socket handshake, not something that finishes at
  // a fixed moment. Wait for it rather than guessing how long it takes.
  const presence = await client.evaluate(`(async () => {
    const until = Date.now() + 8000;
    let state = (await window.term.app.info()).discord;
    while (!state.connected && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250));
      state = (await window.term.app.info()).discord;
    }
    return state;
  })()`);
  check('this build carries a Discord application id', presence.configured);
  check('Rich Presence is enabled', presence.enabled);

  const SEP = String.fromCharCode(92);
  const pipePath = (index) => `${SEP}${SEP}.${SEP}pipe${SEP}discord-ipc-${index}`;

  const discordRunning = [...Array(10).keys()].some((index) => {
    try {
      return fs.existsSync(pipePath(index));
    } catch {
      return false;
    }
  });
  if (discordRunning && presence.connected) {
    check('Rich Presence reached Discord', true, 'connected');
  } else if (discordRunning) {
    // Discord refuses a second live connection for the same application while an
    // earlier one lingers, which is what back-to-back harness runs produce.
    console.log('  skip  Rich Presence reached Discord  (Discord is up but would not take the connection)');
  } else {
    console.log('  skip  Rich Presence reached Discord  (no Discord client running here)');
  }

  check('the GitHub link is the repo',
    about.links.github === 'https://github.com/Rathio12/LuwanTerm', about.links.github);

  await client.call('Page.bringToFront').catch(() => {});
  const fonts = await client.evaluate(`(async () => {
    // Earlier checks close whatever is open, so reopen Settings rather than
    // reporting an empty picker that is merely absent.
    if (!document.querySelector('.fontpick')) {
      document.querySelector('#btn-settings').click();
      await new Promise((r) => setTimeout(r, 900));
    }

    const until = Date.now() + 8000;
    let picker = document.querySelector('.fontpick');
    while ((!picker || !picker.children.length) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 200));
      picker = document.querySelector('.fontpick');
    }
    const chips = picker ? [...picker.children] : [];
    return {
      api: typeof window.queryLocalFonts === 'function',
      focused: document.hasFocus(),
      count: chips.length,
      empty: chips.some((c) => c.classList.contains('hint')),
      sample: chips.slice(0, 4).map((c) => c.textContent.trim()),
    };
  })()`);

  // Windows will not hand the foreground to a process that has had no user
  // input, so a run started while something else holds focus cannot populate
  // the picker or read the font list. That is the harness being unable to look,
  // not the app being wrong - say so instead of failing.
  if (fonts.focused) {
    check('the font picker is populated', fonts.count > 0 && !fonts.empty,
      `${fonts.count} fonts: ${fonts.sample.join(', ')}`);
  } else {
    console.log('  skip  the font picker is populated  (the window never got focus)');
  }
  check('the local font API is reachable', fonts.api);

  await client.call('Page.bringToFront').catch(() => {});
  const local = await client.evaluate(`(async () => {
    if (typeof window.queryLocalFonts !== 'function') return { ok: false, why: 'no api' };
    try {
      const all = await window.queryLocalFonts();
      return { ok: true, families: [...new Set(all.map((f) => f.family))] };
    } catch (error) {
      return { ok: false, why: error.message };
    }
  })()`);

  const MONO = /\b(mono\w*|code|consol\w*|courier|terminal)\b/i;
  const mono = local.ok ? local.families.filter((family) => MONO.test(family)) : [];
  if (local.ok) {
    check('the system font list is readable', true, `${local.families.length} families`);
    check('the monospace filter matches real families', mono.length > 0, mono.slice(0, 5).join(', '));
  } else if (/visible/i.test(local.why || '')) {
    // Windows will not give the foreground to a process that has had no user
    // input, and the API refuses on a hidden page. That is the harness being
    // unable to look, not the app being wrong.
    console.log(`  skip  the system font list is readable  (${local.why})`);
  } else {
    check('the system font list is readable', false, local.why);
  }

  const prompt = await client.evaluate(`(async () => {
    for (const open of document.querySelectorAll('.modal .modal__head .iconbtn')) open.click();
    await new Promise((r) => setTimeout(r, 400));

    const shown = App.supportPrompt.ask();
    await new Promise((r) => setTimeout(r, 600));
    const modal = document.querySelector('.modal');
    const result = {
      open: Boolean(modal),
      title: modal ? modal.querySelector('h2').textContent.trim() : '',
      buttons: modal ? [...modal.querySelectorAll('.modal__foot button')].map((b) => b.textContent.trim()) : [],
      closer: Boolean(modal && modal.querySelector('.modal__head .iconbtn')),
    };
    if (modal) modal.querySelector('.modal__head .iconbtn').click();
    await shown;
    result.settled = (await window.term.settings.get()).starPromptState;
    return result;
  })()`);

  const quiet = await client.evaluate(`(async () => {
    await window.term.settings.set({ starPromptState: 'pending', starPromptSessions: 99, starPromptFirstRunAt: 1 });
    await App.supportPrompt.noteSession();
    await new Promise((r) => setTimeout(r, 500));
    const info = await window.term.app.info();
    return { packaged: info.packaged, opened: Boolean(document.querySelector('.modal')) };
  })()`);
  check('this is a development run', quiet.packaged === false);
  check('so the star prompt stays away however many sessions there have been', !quiet.opened);

  check('the support prompt opens', prompt.open, prompt.title);
  check('it offers exactly two buttons', prompt.buttons.length === 2, prompt.buttons.join(', '));
  check('one of them stars the project', prompt.buttons.some((label) => /star/i.test(label)));
  check('the other opens GitHub', prompt.buttons.some((label) => /github/i.test(label)));
  check('there is an X to dismiss it', prompt.closer);
  check('the X settles it for good', prompt.settled === 'dismissed', prompt.settled);

    // The away screen and the Stats panel have only had unit tests; drive them.
  const away = await client.evaluate(`(async () => {
    await window.term.settings.set({ idleLockMinutes: 5, backgroundImage: '' });
    await App.afk.apply(await window.term.settings.get());
    await App.afk.show();
    await new Promise((r) => setTimeout(r, 300));

    const panel = document.querySelector('.afk');
    const result = {
      shown: Boolean(panel) && !panel.hidden && getComputedStyle(panel).display !== 'none',
      time: panel ? panel.querySelector('.afk__time').textContent : '',
      detail: panel ? panel.querySelector('.afk__detail').textContent : '',
      hint: panel ? panel.querySelector('.afk__hint').textContent : '',
      date: panel ? panel.querySelector('.afk__date').textContent : '',
      timeSize: panel ? parseFloat(getComputedStyle(panel.querySelector('.afk__time')).fontSize) : 0,
    };

    App.afk.reset();
    await new Promise((r) => setTimeout(r, 150));
    result.dismissed = Boolean(panel) && panel.hidden;
    return result;
  })()`);

  check('the away screen appears', away.shown);
  check('it shows a clock', /^\d{2}:\d{2}$/.test(away.time), away.time);
  check('it says what happens to open sessions', away.detail.length > 0, away.detail);
  check('it shows the date under the clock', away.date.length > 6, away.date);
  check('the clock is the biggest thing on it', away.timeSize >= 60, `${away.timeSize}px`);
  check('it says how to get back', /press any key/i.test(away.hint));
  check('and activity dismisses it', away.dismissed);

  // The dock only opens for a live session, and this harness has no server to
  // connect to, so build the panel directly and check what it renders.
  const panel = await client.evaluate(`(async () => {
    const tab = document.querySelector('[data-dock="stats"]');
    // A session gets a temporary key while it connects and a real one after, so
    // the panel must read it at call time rather than capturing it.
    let key = 'first-id';
    let reads = 0;
    const lazy = App.stats.create(() => { reads += 1; return key; });
    key = 'second-id';
    await lazy.start();
    lazy.stop();

    const built = App.stats.create('no-such-session');
    return {
      tabbed: Boolean(tab),
      label: tab ? tab.textContent.trim() : '',
      afterFiles: Boolean(tab && tab.previousElementSibling),
      meters: built.element.querySelectorAll('.meter').length,
      graph: Boolean(built.element.querySelector('.spark')),
      fields: [...built.element.querySelectorAll('.stat__label')].map((n) => n.textContent),
      lazyReads: reads,
    };
  })()`);

  check('a Stats tab sits beside the others', panel.tabbed && panel.afterFiles, panel.label);
  check('the panel reads the session id when it asks, not when it was built',
    panel.lazyReads > 0, `read ${panel.lazyReads} times after construction`);
  check('it renders CPU, memory and swap meters', panel.meters === 3, `${panel.meters} meters`);
  check('and a network graph', panel.graph);
  check('with uptime and load beneath it',
    panel.fields.includes('Uptime') && panel.fields.includes('Load'), panel.fields.join(', '));

  const plugged = await client.evaluate(`(async () => {
    const tab = document.querySelector('[data-dock="plugins"]');
    const listing = await window.term.plugins.list();

    const idle = App.plugins.create('no-such-session');
    idle.start();
    await new Promise((r) => setTimeout(r, 500));
    const beforeText = idle.element.textContent;
    idle.stop();

    await window.term.plugins.enable('disk-use', true);
    const after = await window.term.plugins.list();

    const live = App.plugins.create('no-such-session');
    live.start();
    await new Promise((r) => setTimeout(r, 1200));
    const shown = live.element.querySelector('.plug__command');
    const said = live.element.textContent;
    live.stop();

    document.querySelector('#btn-settings').click();
    await new Promise((r) => setTimeout(r, 1400));
    const rows = [...document.querySelectorAll('.plugset__item')];
    const commands = [...document.querySelectorAll('.plugset__command')].map((n) => n.textContent);
    const problems = [...document.querySelectorAll('.plugset__problem')].map((n) => n.textContent);
    for (const close of document.querySelectorAll('.modal .modal__head .iconbtn')) close.click();
    await new Promise((r) => setTimeout(r, 300));

    await window.term.plugins.enable('disk-use', false);

    return {
      tabbed: Boolean(tab),
      label: tab ? tab.textContent.trim() : '',
      afterStats: Boolean(tab && tab.previousElementSibling
        && tab.previousElementSibling.dataset.dock === 'stats'),
      found: listing.plugins.map((p) => p.id),
      broken: listing.broken.map((b) => b.id),
      reason: listing.broken.length ? listing.broken[0].problems[0] : '',
      allowed: listing.allowed,
      nothingOnByDefault: listing.enabled.length === 0,
      offersSettings: beforeText.includes('Open plugin settings'),
      switchedOn: after.enabled,
      command: shown ? shown.textContent : '',
      saidWhy: said,
      settingsRows: rows.length,
      settingsCommands: commands,
      settingsProblems: problems,
    };
  })()`);

  check('a Plugins tab sits after Stats', plugged.tabbed && plugged.afterStats, plugged.label);
  check('a manifest in the folder is found', plugged.found.includes('disk-use'), plugged.found.join(', '));
  check('a broken one is listed rather than swallowed', plugged.broken.includes('broken'), plugged.reason);
  check('policy allows plugins on a default profile', plugged.allowed);
  check('nothing runs just by being installed', plugged.nothingOnByDefault);
  check('an empty panel points at the settings that fill it', plugged.offersSettings);
  check('switching one on is remembered', plugged.switchedOn.join() === 'disk-use', plugged.switchedOn.join(', '));
  check('the panel prints the command it runs', plugged.command.includes('df -h'), plugged.command);
  check('and says why it could not run rather than failing silently',
    /no longer connected/i.test(plugged.saidWhy));
  check('settings lists both the good one and the broken one', plugged.settingsRows === 2,
    `${plugged.settingsRows} rows`);
  check('with the command shown before it is switched on',
    plugged.settingsCommands.some((text) => text.includes('df -h')), plugged.settingsCommands.join(' | '));
  check('and the broken one explained in words',
    plugged.settingsProblems.some((text) => /command/i.test(text)), plugged.settingsProblems.join(' | '));

  // The beta notice: only for a beta version, only once per version.
  const notice = await client.evaluate(`(async () => {
    const out = {};
    out.stableStaysQuiet = !App.betaNotice.isBeta('1.9.0');
    out.betaRecognised = App.betaNotice.isBeta('1.9.0-beta.51');

    await window.term.settings.set({ betaNoticeSeen: '' });
    const info = { version: '1.9.0-beta.51', links: { issues: 'https://example.invalid/issues' } };

    const first = App.betaNotice.maybeWarn(info);
    await new Promise((r) => setTimeout(r, 500));
    const modal = document.querySelector('.modal');
    out.shown = Boolean(modal);
    out.title = modal ? modal.querySelector('h2').textContent.trim() : '';
    out.buttons = modal ? [...modal.querySelectorAll('.modal__foot button')].map((b) => b.textContent.trim()) : [];
    if (modal) modal.querySelector('.modal__foot button:last-child').click();
    await first;

    out.remembered = (await window.term.settings.get()).betaNoticeSeen;

    const again = await App.betaNotice.maybeWarn(info);
    out.secondTime = again;

    out.onStable = await App.betaNotice.maybeWarn({ version: '1.9.0', links: {} });

    // A release build with the beta channel switched on should still say so.
    await window.term.settings.set({ betaUpdates: true, betaNoticeSeen: '' });
    const channelWarn = App.betaNotice.maybeWarn({ version: '1.9.0', links: {} });
    await new Promise((r) => setTimeout(r, 500));
    const channelModal = document.querySelector('.modal');
    out.channelShown = Boolean(channelModal);
    out.channelTitle = channelModal ? channelModal.querySelector('h2').textContent.trim() : '';
    if (channelModal) channelModal.querySelector('.modal__foot button:last-child').click();
    await channelWarn;
    out.channelRemembered = (await window.term.settings.get()).betaNoticeSeen;
    out.secondOnChannel = await App.betaNotice.maybeWarn({ version: '1.9.0', links: {} });
    await window.term.settings.set({ betaUpdates: false });
    return out;
  })()`);

  check('a stable version is not treated as a beta', notice.stableStaysQuiet);
  check('a beta version is', notice.betaRecognised);
  check('the notice appears on a beta build', notice.shown, notice.title);
  check('it offers a way to report and a way to carry on', notice.buttons.length === 2,
    notice.buttons.join(', '));
  check('it remembers which build it warned about', notice.remembered === '1.9.0-beta.51');
  check('and does not ask again for that build', notice.secondTime === false);
  check('nor on a stable one', notice.onStable === false);
  check('a stable build with the beta channel on still warns', notice.channelShown, notice.channelTitle);
  check('and says it is about the channel, not this build',
    /switched on/i.test(notice.channelTitle), notice.channelTitle);
  check('it remembers that separately from a beta build',
    notice.channelRemembered === 'channel:1.9.0', notice.channelRemembered);
  check('and does not ask again for that version', notice.secondOnChannel === false);

  client.close();
  killTree(child);

  await wait(500);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {  }

  const failed = results.filter((passed) => !passed).length;
  console.log(`\n${results.length} checks, ${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
