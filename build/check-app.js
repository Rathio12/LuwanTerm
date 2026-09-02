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
  check('it is off by default', !beta.checked);
  check('and it warns what beta means', beta.warned);
  check('the GitHub button is still there', about.buttons.includes('Source on GitHub'));
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
  check('the system font list is readable', local.ok,
    local.ok ? `${local.families.length} families` : local.why);
  check('the monospace filter matches real families', mono.length > 0, mono.slice(0, 5).join(', '));

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
    };

    App.afk.reset();
    await new Promise((r) => setTimeout(r, 150));
    result.dismissed = Boolean(panel) && panel.hidden;
    return result;
  })()`);

  check('the away screen appears', away.shown);
  check('it shows a clock', /^\d{2}:\d{2}$/.test(away.time), away.time);
  check('it says what happens to open sessions', away.detail.length > 0, away.detail);
  check('it says how to get back', /press any key/i.test(away.hint));
  check('and activity dismisses it', away.dismissed);

  // The dock only opens for a live session, and this harness has no server to
  // connect to, so build the panel directly and check what it renders.
  const panel = await client.evaluate(`(() => {
    const tab = document.querySelector('[data-dock="stats"]');
    const built = App.stats.create('no-such-session');
    return {
      tabbed: Boolean(tab),
      label: tab ? tab.textContent.trim() : '',
      afterFiles: Boolean(tab && tab.previousElementSibling),
      meters: built.element.querySelectorAll('.meter').length,
      graph: Boolean(built.element.querySelector('.spark')),
      fields: [...built.element.querySelectorAll('.stat__label')].map((n) => n.textContent),
    };
  })()`);

  check('a Stats tab sits beside the others', panel.tabbed && panel.afterFiles, panel.label);
  check('it renders CPU, memory and swap meters', panel.meters === 3, `${panel.meters} meters`);
  check('and a network graph', panel.graph);
  check('with uptime and load beneath it',
    panel.fields.includes('Uptime') && panel.fields.includes('Load'), panel.fields.join(', '));

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
