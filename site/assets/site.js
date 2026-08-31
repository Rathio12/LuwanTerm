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
}

loadRelease();
loadFonts();
