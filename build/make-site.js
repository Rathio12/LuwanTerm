'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'docs', 'assets');
const images = path.join(assets, 'images');

fs.mkdirSync(images, { recursive: true });

const copy = (from, to, label) => {
  fs.copyFileSync(from, to);
  console.log(`  ${label}: ${path.relative(root, to)}`);
};

copy(
  path.join(root, 'src', 'renderer', 'styles', 'tokens.css'),
  path.join(assets, 'tokens.css'),
  'tokens'
);

copy(path.join(root, 'fonts', 'fonts.json'), path.join(assets, 'fonts.json'), 'fonts');

if (!fs.existsSync(path.join(assets, 'webfonts.json'))) {
  console.warn('warning: docs/assets/webfonts.json missing - run node build/make-webfonts.js');
}

for (const name of fs.readdirSync(path.join(root, 'guides', 'images'))) {
  if (!/\.(png|jpg|svg|webp)$/i.test(name)) continue;
  copy(path.join(root, 'guides', 'images', name), path.join(images, name), 'image');
}

console.log('site assets assembled');
