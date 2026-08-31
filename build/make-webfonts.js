'use strict';

// Works out which catalogue families Google Fonts can serve, so the website can
// preview a font the visitor has not installed. The css2 endpoint needs no API
// key and answers 400 for a family it does not host, which makes it a reliable
// existence check. Run this again when fonts/fonts.json grows:
//
//   node build/make-webfonts.js
//
// Nothing here touches the app - fonts/fonts.json stays the single catalogue,
// and the result lands in docs/assets/webfonts.json for the site alone.

const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const catalogue = require(path.join(root, 'fonts', 'fonts.json')).fonts;
const target = path.join(root, 'docs', 'assets', 'webfonts.json');

// Google hosts a display serif called Lemon that has nothing to do with the
// bitmap font of the same name, so previewing it would show the wrong face.
const COLLISIONS = new Set(['Lemon']);

const normalise = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function probe(name) {
  return new Promise((resolve) => {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400&display=swap`;
    const request = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(15000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const families = [];
  for (let i = 0; i < catalogue.length; i += 8) {
    const batch = catalogue.slice(i, i + 8).filter((font) => !COLLISIONS.has(font.name));
    const results = await Promise.all(batch.map((font) => probe(font.name)));
    batch.forEach((font, index) => {
      if (results[index]) families.push(font.name);
    });
  }

  // A Nerd Font is its base family plus icon glyphs, so the base face is an
  // honest preview of the letterforms. Match by stripping the patch suffix.
  const served = families.map((name) => ({ name, key: normalise(name) }));
  const aliases = {};
  for (const font of catalogue) {
    if (families.includes(font.name)) continue;
    const key = normalise(font.name).replace(/(nerdfont|nf)(mono|propo)?$/, '');
    if (key.length < 4) continue;
    const base = served.find((candidate) => candidate.key === key);
    if (base) aliases[font.name] = base.name;
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'https://fonts.googleapis.com/css2',
    families: families.sort((a, b) => a.localeCompare(b)),
    aliases,
  };
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`webfonts: ${families.length} served, ${Object.keys(aliases).length} aliased of ${catalogue.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
