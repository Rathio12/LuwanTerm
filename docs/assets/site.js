'use strict';

const REPO = 'Rathio12/LuwanTerm';
const SAMPLE = 'const ok = 0O1lI; ~$>_ => != <=';

const megabytes = (n) => `${(n / 1048576).toFixed(0)} MB`;

/**
 * Points the buttons at the newest release's actual assets. Without this the
 * version would be baked into the page and go stale on every release.
 */
async function loadRelease() {
  const meta = document.getElementById('meta');
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();

    const setup = release.assets.find((a) => /setup\.exe$/i.test(a.name));
    const portable = release.assets.find((a) => /portable\.exe$/i.test(a.name));

    if (setup) {
      const button = document.getElementById('download');
      button.href = setup.browser_download_url;
      button.textContent = `Download ${release.tag_name} for Windows`;
    }
    if (portable) document.getElementById('portable').href = portable.browser_download_url;

    const version = document.getElementById('version');
    if (version) version.textContent = release.tag_name;

    const size = setup ? ` - ${megabytes(setup.size)}` : '';
    const date = new Date(release.published_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    meta.textContent = `${release.tag_name}${size} - released ${date} - Windows 10 and 11, 64-bit`;
  } catch {
    meta.textContent = 'Could not reach GitHub. The buttons still work; they go to the releases page.';
  }
}

/**
 * A font is installed if text measures differently in it than in each generic
 * fallback. A browser silently substitutes a missing font, so measuring is the
 * only way to tell. This is the same check the app runs.
 */
function isInstalled(name, context) {
  const probe = 'mmmmmmmmmmlliWWW';
  return ['monospace', 'serif', 'sans-serif'].some((generic) => {
    context.font = `72px ${generic}`;
    const base = context.measureText(probe).width;
    context.font = `72px "${name}", ${generic}`;
    return context.measureText(probe).width !== base;
  });
}

async function loadFonts() {
  const list = document.getElementById('fontlist');
  const summary = document.getElementById('installed');

  let families = [];
  try {
    const response = await fetch('assets/fonts.json');
    families = (await response.json()).fonts.map((font) => font.name);
  } catch {
    summary.textContent = 'The font catalogue could not be loaded.';
    return;
  }

  document.getElementById('total').textContent = String(families.length);

  const context = document.createElement('canvas').getContext('2d');
  const rows = families.map((name) => ({ name, installed: isInstalled(name, context) }));
  rows.sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));

  const found = rows.filter((row) => row.installed).length;
  summary.textContent = `You have ${found} of them.`;

  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const element = document.createElement('div');
    element.className = `frow ${row.installed ? 'installed' : 'missing'}`;
    element.style.fontFamily = `"${row.name}", monospace`;

    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = row.name;

    const sample = document.createElement('span');
    sample.className = 'fsample';
    sample.textContent = SAMPLE;

    const tag = document.createElement('span');
    tag.className = 'ftag';
    tag.textContent = row.installed ? 'installed' : 'not installed';

    element.append(name, sample, tag);
    fragment.append(element);
  }
  list.replaceChildren(fragment);

  setUpDemo(rows.filter((row) => row.installed).map((row) => row.name));
}


/* ---------- Interactive demo ---------- */

const LF = String.fromCharCode(10);
const BULLET = String.fromCharCode(9679);

const ACCENTS = ['#7c5cff', '#3ea8ff', '#22c58b', '#f2a33c', '#ff5c8a', '#c084fc'];

/** A short, plausible session, written once and reused as the demo content. */
const TRANSCRIPT = [
  ['t-prompt', 'root@prod-web'], ['t-dim', ':'], ['t-path', '~'], [null, '$ systemctl status nginx'],
  ['br'],
  ['t-ok', '  ' + BULLET + ' nginx.service'], [null, ' - A high performance web server'],
  ['br'],
  ['t-dim', '     Loaded: '], [null, 'loaded (/lib/systemd/system/nginx.service; enabled)'],
  ['br'],
  ['t-dim', '     Active: '], ['t-ok', 'active (running)'], ['t-dim', ' since Mon 09:14:22 UTC'],
  ['br'], ['br'],
  ['t-prompt', 'root@prod-web'], ['t-dim', ':'], ['t-path', '~'], [null, '$ df -h /var'],
  ['br'],
  ['t-dim', 'Filesystem      Size  Used Avail Use% Mounted on'],
  ['br'],
  [null, '/dev/sda1        98G   71G   22G  '], ['t-warn', '77%'], [null, '  /var'],
  ['br'], ['br'],
  ['t-prompt', 'root@prod-web'], ['t-dim', ':'], ['t-path', '~'], [null, '$ tail -n2 /var/log/app.log'],
  ['br'],
  ['t-dim', '09:41:02 '], ['t-ok', 'INFO '], [null, 'worker 3 accepted 1,204 requests'],
  ['br'],
  ['t-dim', '09:41:07 '], ['t-warn', 'WARN '], [null, 'pool at 82% capacity'],
  ['br'], ['br'],
  ['t-prompt', 'root@prod-web'], ['t-dim', ':'], ['t-path', '~'], [null, '$ '], ['cursor'],
];

function paintTranscript(target) {
  const fragment = document.createDocumentFragment();
  for (const [kind, text] of TRANSCRIPT) {
    if (kind === 'br') {
      fragment.append(document.createTextNode(LF));
      continue;
    }
    if (kind === 'cursor') {
      const cursor = document.createElement('span');
      cursor.className = 't-cursor';
      fragment.append(cursor);
      continue;
    }
    if (!kind) {
      fragment.append(document.createTextNode(text));
      continue;
    }
    const span = document.createElement('span');
    span.className = kind;
    span.textContent = text;
    fragment.append(span);
  }
  target.replaceChildren(fragment);
}

/**
 * Wires the demo controls. Everything writes a CSS variable on the demo root,
 * which is how the app applies these settings too.
 */
function setUpDemo(installedFonts) {
  const demo = document.querySelector('.demo');
  const term = document.getElementById('demoTerm');
  if (!demo || !term) return;

  paintTranscript(term);

  const fontSelect = document.getElementById('demoFont');
  const families = installedFonts.length ? installedFonts : ['monospace'];
  for (const name of families) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    option.style.fontFamily = `"${name}", monospace`;
    fontSelect.append(option);
  }

  // Prefer something the app itself would default to, when it is available.
  const preferred = families.find((n) => /jetbrains|cascadia|consol/i.test(n)) || families[0];
  fontSelect.value = preferred;
  demo.style.setProperty('--demo-font', `"${preferred}", monospace`);

  fontSelect.addEventListener('change', () => {
    demo.style.setProperty('--demo-font', `"${fontSelect.value}", monospace`);
  });

  const size = document.getElementById('demoSize');
  const sizeValue = document.getElementById('demoSizeValue');
  size.addEventListener('input', () => {
    demo.style.setProperty('--demo-size', `${size.value}px`);
    sizeValue.textContent = `${size.value}px`;
  });

  const opacity = document.getElementById('demoOpacity');
  const opacityValue = document.getElementById('demoOpacityValue');
  opacity.addEventListener('input', () => {
    demo.style.setProperty('--demo-term', `rgba(6, 7, 12, ${opacity.value / 100})`);
    opacityValue.textContent = `${opacity.value}%`;
  });

  const accents = document.getElementById('demoAccents');
  ACCENTS.forEach((colour, index) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `swatch${index === 0 ? ' is-on' : ''}`;
    swatch.style.background = colour;
    swatch.title = colour;
    swatch.addEventListener('click', () => {
      demo.style.setProperty('--demo-accent', colour);
      for (const other of accents.children) other.classList.toggle('is-on', other === swatch);
    });
    accents.append(swatch);
  });
}

loadRelease();
loadFonts();
