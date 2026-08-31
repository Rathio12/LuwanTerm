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

const loadedWebFonts = new Set();

/**
 * Pulls one family from Google Fonts. Families are requested as a row scrolls
 * into view rather than all at once, so opening the page does not drag in every
 * font binary in the catalogue.
 */
function ensureWebFont(family) {
  if (!family || loadedWebFonts.has(family)) return;
  loadedWebFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  document.head.append(link);
}

async function loadFonts() {
  const list = document.getElementById('fontlist');
  const summary = document.getElementById('installed');

  let catalogue = [];
  try {
    const response = await fetch('assets/fonts.json');
    catalogue = (await response.json()).fonts;
  } catch {
    summary.textContent = 'The font catalogue could not be loaded.';
    return;
  }

  let web = { families: [], aliases: {} };
  try {
    const response = await fetch('assets/webfonts.json');
    if (response.ok) web = await response.json();
  } catch {

  }
  const served = new Set(web.families);

  document.getElementById('total').textContent = String(catalogue.length);

  const context = document.createElement('canvas').getContext('2d');
  const rows = catalogue.map((font) => {
    const installed = isInstalled(font.name, context);
    const alias = web.aliases[font.name];
    let source = 'none';
    if (installed) source = 'installed';
    else if (served.has(font.name)) source = 'web';
    else if (alias) source = 'base';

    return {
      name: font.name,
      group: font.group || '',
      installed,
      source,

      render: installed || served.has(font.name) ? font.name : alias || '',
      download: installed ? '' : served.has(font.name) ? font.name : alias || '',
    };
  });

  const rank = { installed: 0, web: 1, base: 2, none: 3 };
  rows.sort((a, b) => rank[a.source] - rank[b.source] || a.name.localeCompare(b.name));

  const found = rows.filter((row) => row.installed).length;
  const usable = rows.filter((row) => row.render).length;
  summary.textContent = `You have ${found} of them, and ${usable} render right here.`;

  const watcher = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        ensureWebFont(entry.target.dataset.download);
        observer.unobserve(entry.target);
      }
    }, { root: list, rootMargin: '200px' })
    : null;

  const fragment = document.createDocumentFragment();
  const watched = [];
  for (const row of rows) {
    const usableRow = Boolean(row.render);
    const element = document.createElement(usableRow ? 'button' : 'div');
    element.className = `frow ${row.source}`;
    element.style.fontFamily = `"${row.render || row.name}", monospace`;
    element.dataset.font = row.name;
    if (row.download) element.dataset.download = row.download;

    if (usableRow) {
      element.type = 'button';
      element.title = row.source === 'base'
        ? `Preview ${row.name} in the demo, drawn in its unpatched base family ${row.render}`
        : `Use ${row.name} in the demo`;

      element.addEventListener('click', () => applyDemoFont && applyDemoFont(row.name, { reveal: true }));
    } else {
      element.title = `${row.name} is not installed here and cannot be served over the web`;
    }

    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = row.name;

    const sample = document.createElement('span');
    sample.className = 'fsample';
    sample.textContent = SAMPLE;

    const group = document.createElement('span');
    group.className = 'fgroup';
    group.textContent = row.group.replace(/ fonts?$/i, '');

    const tag = document.createElement('span');
    tag.className = 'ftag';
    tag.textContent = { installed: 'installed', web: 'web', base: 'base face', none: 'unavailable' }[row.source];

    element.append(name, sample, group, tag);
    fragment.append(element);
    if (row.download) watched.push(element);
  }
  list.replaceChildren(fragment);
  for (const element of watched) {
    if (watcher) watcher.observe(element);
    else ensureWebFont(element.dataset.download);
  }

  setUpDemo(rows.filter((row) => row.render));
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

/** Set by setUpDemo, and used by the font list to drive the demo. */
let applyDemoFont = null;

/**
 * Wires the demo controls. Everything writes a CSS variable on the demo root,
 * which is how the app applies these settings too.
 */
function setUpDemo(usableFonts) {
  const demo = document.querySelector('.demo');
  const term = document.getElementById('demoTerm');
  if (!demo || !term) return;

  paintTranscript(term);

  const fontSelect = document.getElementById('demoFont');
  const rows = usableFonts.length
    ? usableFonts
    : [{ name: 'monospace', render: 'monospace', source: 'installed', download: '' }];
  const byName = new Map(rows.map((row) => [row.name, row]));

  const labels = {
    installed: 'Installed on this machine',
    web: 'Loaded from Google Fonts',
    base: 'Previewed in their base family',
  };
  for (const [source, label] of Object.entries(labels)) {
    const matching = rows.filter((row) => row.source === source);
    if (!matching.length) continue;
    const optgroup = document.createElement('optgroup');
    optgroup.label = `${label} (${matching.length})`;
    for (const row of matching) {
      const option = document.createElement('option');
      option.value = row.name;
      option.textContent = row.name;
      option.style.fontFamily = `"${row.render}", monospace`;
      optgroup.append(option);
    }
    fontSelect.append(optgroup);
  }

  applyDemoFont = (name, { reveal = false } = {}) => {
    const row = byName.get(name);
    if (!row) return;

    ensureWebFont(row.download);
    demo.style.setProperty('--demo-font', `"${row.render}", monospace`);
    fontSelect.value = name;

    for (const element of document.querySelectorAll('.frow')) {
      element.classList.toggle('is-using', element.dataset.font === name);
    }
    if (reveal) document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const preferred = rows.find((row) => /jetbrains|cascadia|consol/i.test(row.name)) || rows[0];
  fontSelect.addEventListener('change', () => applyDemoFont(fontSelect.value));
  applyDemoFont(preferred.name);

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
