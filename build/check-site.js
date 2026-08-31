'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..', 'docs');
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(request.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

const results = [];
const check = (label, passed, detail) => {
  results.push({ label, passed, detail });
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

app.on('ready', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const window = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const errors = [];
  window.webContents.on('console-message', (event) => {

    if (event.level !== 'error' && event.level !== 'warning') return;
    if (event.message.includes('Electron Security Warning')) return;
    errors.push(event.message);
  });

  await window.loadURL(`http://127.0.0.1:${port}/index.html`);

  await window.webContents.executeJavaScript(
    'new Promise((r) => { const t = setInterval(() => { if (document.querySelectorAll(".frow").length) { clearInterval(t); r(); } }, 50); setTimeout(() => { clearInterval(t); r(); }, 15000); })'
  );

  const summary = await window.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.frow')];
    return {
      total: rows.length,
      clickable: rows.filter((r) => r.tagName === 'BUTTON').length,
      installed: rows.filter((r) => r.classList.contains('installed')).length,
      web: rows.filter((r) => r.classList.contains('web')).length,
      base: rows.filter((r) => r.classList.contains('base')).length,
      none: rows.filter((r) => r.classList.contains('none')).length,
      options: document.querySelectorAll('#demoFont option').length,
      optgroups: document.querySelectorAll('#demoFont optgroup').length,
      using: rows.filter((r) => r.classList.contains('is-using')).length,
      catalogue: Number(document.getElementById('total').textContent),
    };
  })()`);

  check('every catalogue family is listed', summary.total === summary.catalogue, `${summary.total} rows`);
  check('renderable rows are clickable', summary.clickable === summary.installed + summary.web + summary.base,
    `${summary.clickable} of ${summary.total}`);
  check('picker offers every renderable font', summary.options === summary.clickable,
    `${summary.options} options in ${summary.optgroups} groups`);
  check('one font starts selected', summary.using === 1);

  const clicked = await window.webContents.executeJavaScript(`(async () => {
    const row = document.querySelector('.frow.web:not(.is-using)');
    const before = document.querySelector('.demo').style.getPropertyValue('--demo-font');
    row.click();
    await new Promise((r) => setTimeout(r, 400));
    return {
      name: row.dataset.font,
      before,
      after: document.querySelector('.demo').style.getPropertyValue('--demo-font'),
      marked: row.classList.contains('is-using'),
      onlyOne: document.querySelectorAll('.frow.is-using').length,
      select: document.getElementById('demoFont').value,
      links: [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].length,
    };
  })()`);

  check('clicking a font changes the demo', clicked.after.includes(clicked.name) && clicked.after !== clicked.before,
    clicked.after);
  check('clicked row is marked, and only it', clicked.marked && clicked.onlyOne === 1);
  check('the picker follows the click', clicked.select === clicked.name);
  check('web fonts are fetched', clicked.links > 0, `${clicked.links} stylesheets`);

  const chosen = await window.webContents.executeJavaScript(`(async () => {
    const select = document.getElementById('demoFont');
    const option = [...select.options].find((o) => o.value !== select.value);
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    const marked = document.querySelector('.frow.is-using');
    return { want: option.value, got: marked && marked.dataset.font,
      font: document.querySelector('.demo').style.getPropertyValue('--demo-font') };
  })()`);
  check('the list follows the picker', chosen.got === chosen.want, chosen.want);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length} checks, ${results.length - failed} passed, ${failed} failed`);
  server.close();
  app.exit(failed ? 1 : 0);
});
