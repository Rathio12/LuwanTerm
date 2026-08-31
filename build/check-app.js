'use strict';

// Boots the real app against a throwaway profile and inspects the running UI
// over the DevTools protocol, so renderer changes are checked rather than
// assumed. Node's built-in WebSocket does the talking - no extra dependency.
//
//   node build/check-app.js

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = 9333;

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

/** Minimal CDP client: connect, evaluate, close. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const waiting = new Map();
    let id = 0;

    socket.addEventListener('open', () => resolve({
      evaluate(expression) {
        return new Promise((ok, fail) => {
          const messageId = ++id;
          waiting.set(messageId, { ok, fail });
          socket.send(JSON.stringify({
            id: messageId,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true, userGesture: true },
          }));
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
      else if (message.result.exceptionDetails) pending.fail(new Error(message.result.exceptionDetails.text));
      else pending.ok(message.result.result.value);
    });

    socket.addEventListener('error', () => reject(new Error('devtools socket failed')));
  });
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'luwan-check-'));
  const electron = require(path.join(root, 'node_modules', 'electron'));

  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], {
    cwd: root,
    // The app refuses to start if it thinks it is a plain Node process.
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
      // Not listening yet.
    }
  }
  if (!page) {
    console.log('  FAIL  the app never opened a window');
    child.kill();
    process.exit(1);
  }

  const client = await connect(page.webSocketDebuggerUrl);

  // The main window stays hidden behind the splash until the boot sequence has
  // finished, which includes a network call to check for updates. Sleeping a
  // fixed amount races that, and a hidden page cannot be driven at all -
  // queryLocalFonts refuses outright and Chromium throttles its timers.
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
    child.kill();
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

  // Open Settings the way a user does and read the buttons it renders.
  const about = await client.evaluate(`(async () => {
    document.querySelector('#btn-settings').click();
    await new Promise((r) => setTimeout(r, 1200));
    const modal = document.querySelector('.modal');
    const buttons = modal ? [...modal.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) : [];
    return { open: Boolean(modal), buttons, links: await window.term.app.info().then((i) => i.links) };
  })()`);

  check('settings opens', about.open, `${about.buttons.length} buttons`);
  check('a View page button is offered', about.buttons.includes('View page'));
  check('the GitHub button is still there', about.buttons.includes('Source on GitHub'));
  check('the website link is the Pages site',
    about.links.website === 'https://rathio12.github.io/LuwanTerm/', about.links.website);
  // Rich Presence: whether this build can do it at all, and whether it managed
  // to reach a running Discord client.
  const presence = await client.evaluate(`(async () => {
    await new Promise((r) => setTimeout(r, 2500));
    return (await window.term.app.info()).discord;
  })()`);
  check('this build carries a Discord application id', presence.configured);
  check('Rich Presence is enabled', presence.enabled);
  check('Rich Presence reached Discord', presence.connected,
    presence.connected ? 'connected' : 'no running Discord client on this machine');

  check('the GitHub link is the repo',
    about.links.github === 'https://github.com/Rathio12/LuwanTerm', about.links.github);

  // The settings font picker: it lists the catalogue entries it can measure,
  // plus anything the Local Font Access API reports. A broken filter here shows
  // up as an empty list, which is what a mangled regex once caused.
  const fonts = await client.evaluate(`(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    const picker = document.querySelector('.fontpick');
    const chips = picker ? [...picker.children] : [];
    return {
      api: typeof window.queryLocalFonts === 'function',
      count: chips.length,
      empty: chips.some((c) => c.classList.contains('hint')),
      sample: chips.slice(0, 4).map((c) => c.textContent.trim()),
    };
  })()`);

  check('the font picker is populated', fonts.count > 0 && !fonts.empty,
    `${fonts.count} fonts: ${fonts.sample.join(', ')}`);
  check('the local font API is reachable', fonts.api);

  // Ask the system directly, so a permission problem shows up here rather than
  // being swallowed by the catch that keeps the picker working without it. The
  // filtering happens in Node so the regex is not escaped through two layers.
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

  client.close();
  child.kill();
  // The app may still hold files in the profile for a moment; losing a temp
  // directory is not worth failing a check over.
  await wait(500);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch { /* the OS will clear it */ }

  const failed = results.filter((passed) => !passed).length;
  console.log(`\n${results.length} checks, ${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
