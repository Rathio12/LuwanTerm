'use strict';

/**
 * Turns fonts/fonts.json into two previews:
 *
 *   fonts/preview.html  a real preview - every family rendered in itself,
 *                       with the ones you do not have marked as missing
 *   fonts/README.md     the catalogue as a table, for reading on the repo
 *
 * GitHub strips style attributes from Markdown, so a genuine font preview is
 * only possible in the HTML page. The table is the honest alternative.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'fonts', 'fonts.json'), 'utf8'));

const groups = new Map();
for (const font of catalogue.fonts) {
  if (!groups.has(font.group)) groups.set(font.group, []);
  groups.get(font.group).push(font.name);
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- preview.html ---------- */

const rows = [...groups.entries()]
  .map(([group, names]) => {
    const items = names
      .map(
        (name) => `      <li data-font="${escapeHtml(name)}">
        <span class="name">${escapeHtml(name)}</span>
        <span class="sample" style="font-family: '${escapeHtml(name)}', monospace">${escapeHtml(catalogue.sample)}</span>
        <span class="tag"></span>
      </li>`
      )
      .join('\n');
    return `    <h2>${escapeHtml(group)} <small>${names.length}</small></h2>\n    <ul>\n${items}\n    </ul>`;
  })
  .join('\n');

const html = `<!doctype html>
<meta charset="utf-8">
<title>LuwanTerm font catalogue</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 40px 32px; background: #0a0b12; color: #eef0f8;
    font: 14px/1.5 "Inter", "Segoe UI", system-ui, sans-serif;
  }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: #a5abc4; margin: 0 0 8px; max-width: 70ch; }
  .count { color: #7c5cff; font-weight: 600; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .9px; color: #6d7392; margin: 34px 0 10px; }
  h2 small { color: #3a3f57; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
  li {
    display: grid; grid-template-columns: 230px 1fr 90px; gap: 14px; align-items: center;
    padding: 9px 12px; border-radius: 10px; background: rgba(255,255,255,.035);
    border: 1px solid rgba(255,255,255,.06);
  }
  li.missing { opacity: .38; }
  .name { font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sample { font-size: 14px; color: #c8cde0; white-space: nowrap; overflow: hidden; }
  .tag { font-size: 10px; text-align: right; color: #22c58b; }
  li.missing .tag { color: #6d7392; }
</style>
<h1>LuwanTerm font catalogue</h1>
<p class="lede">Every family LuwanTerm detects and offers in Settings. Fonts you have
installed render below in their own face; the rest are dimmed. Nothing here is
bundled with the app.</p>
<p class="lede"><span class="count" id="installed">checking…</span></p>
${rows}
<script>
  const ctx = document.createElement('canvas').getContext('2d');
  const probe = 'mmmmmmmmmmlliWWW';
  const installed = (name) => ['monospace', 'serif', 'sans-serif'].some((generic) => {
    ctx.font = '72px ' + generic;
    const base = ctx.measureText(probe).width;
    ctx.font = '72px "' + name + '", ' + generic;
    return ctx.measureText(probe).width !== base;
  });

  let found = 0;
  for (const li of document.querySelectorAll('li[data-font]')) {
    const yes = installed(li.dataset.font);
    if (yes) found += 1;
    li.classList.toggle('missing', !yes);
    li.querySelector('.tag').textContent = yes ? 'installed' : 'not installed';
  }
  document.getElementById('installed').textContent =
    found + ' of ' + document.querySelectorAll('li[data-font]').length + ' installed on this machine';
</script>
`;

fs.writeFileSync(path.join(root, 'fonts', 'preview.html'), html, 'utf8');

/* ---------- README.md ---------- */

let servedLine = 'Some families are served directly, and Nerd Font builds are previewed in their unpatched base family.';
try {
  const web = require(path.join(root, 'docs', 'assets', 'webfonts.json'));
  servedLine =
    `Right now ${web.families.length} of the ${catalogue.fonts.length} are served directly, and ` +
    `${Object.keys(web.aliases).length} more are Nerd Font builds previewed in their unpatched base family.`;
} catch {

}

const tables = [...groups.entries()]
  .map(([group, names]) => {
    const body = names.map((name) => `| ${name} |`).join('\n');
    return `### ${group}\n\n_${names.length} families_\n\n| Family |\n| --- |\n${body}`;
  })
  .join('\n\n');

const readme = `# Fonts

The families LuwanTerm knows about: **${catalogue.fonts.length}** across
${groups.size} groups. Settings shows the ones you actually have installed, each
rendered in its own face so you can judge it before picking.

## No font files are bundled

This folder holds a **catalogue, not binaries**. Shipping the fonts themselves
would mean redistributing work under licences that mostly do not allow it, and
would add hundreds of megabytes to a terminal app. Install the ones you want and
LuwanTerm will find them.

Most of the open source ones are on [Google Fonts](https://fonts.google.com/?classification=Monospace),
[Nerd Fonts](https://www.nerdfonts.com/font-downloads) or the project's own site.

## Seeing them

- **In the app** — Settings lists every installed family with a live preview.
- **On the website** — the [font list](https://rathio12.github.io/LuwanTerm/#fonts)
  renders what you have installed and fetches the rest from Google Fonts where it
  can. Click any font there and the demo terminal above switches to it.
- **In a browser, offline** — open [preview.html](preview.html). Installed
  families render in themselves; the rest are dimmed and marked.

GitHub strips style attributes from Markdown, so the table below cannot show the
actual typefaces. That is what \`preview.html\` is for.

## Adding one

Any font works, whether or not it is listed here — the box in Settings accepts a
full CSS font stack, so \`"My Font", monospace\` is fine.

To have it appear in the picker, add it to \`fonts.json\` and run:

\`\`\`bash
node build/make-font-preview.js
\`\`\`

That regenerates this file and \`preview.html\`. A monospaced font is strongly
recommended; a proportional one will make columns misalign.

Then refresh the website's copy, so people who do not have the font can still
preview it:

\`\`\`bash
node build/make-webfonts.js
\`\`\`

That asks Google Fonts which families it can serve and writes
\`docs/assets/webfonts.json\`. ${servedLine} The rest — commercial faces and
bitmap fonts — cannot be served, and appear greyed out.

## The catalogue

${tables}
`;

fs.writeFileSync(path.join(root, 'fonts', 'README.md'), readme, 'utf8');

console.log(`font preview written: ${catalogue.fonts.length} families, ${groups.size} groups`);
console.log('  fonts/preview.html');
console.log('  fonts/README.md');
