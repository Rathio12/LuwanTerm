'use strict';

/**
 * Assembles the published site.
 *
 * The point of this script is that the site cannot drift from the app: the
 * design tokens and the font catalogue are copied from the real sources rather
 * than duplicated by hand, so changing an accent colour in the app changes the
 * website too.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'site', 'assets');
const images = path.join(assets, 'images');

fs.mkdirSync(images, { recursive: true });

const copy = (from, to, label) => {
  fs.copyFileSync(from, to);
  console.log(`  ${label}: ${path.relative(root, to)}`);
};

// The app's tokens are the single source of truth for the palette.
copy(
  path.join(root, 'src', 'renderer', 'styles', 'tokens.css'),
  path.join(assets, 'tokens.css'),
  'tokens'
);

copy(path.join(root, 'fonts', 'fonts.json'), path.join(assets, 'fonts.json'), 'fonts');

for (const name of fs.readdirSync(path.join(root, 'guides', 'images'))) {
  if (!/\.(png|jpg|svg|webp)$/i.test(name)) continue;
  copy(path.join(root, 'guides', 'images', name), path.join(images, name), 'image');
}

console.log('site assets assembled');
