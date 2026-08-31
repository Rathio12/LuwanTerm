window.App = window.App || {};

(function (App) {
  'use strict';

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    }

    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function iconButton(name, { title, className = 'iconbtn', onClick, disabled } = {}) {
    return h('button', { class: className, title, disabled, onclick: onClick }, [icon(name)]);
  }

  const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
  }

  function formatDate(ms) {
    if (!ms) return '-';
    const date = new Date(ms);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function debounce(fn, wait = 150) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function joinPath(base, segment) {
    if (segment.startsWith('/')) return segment;
    const parts = `${base}/${segment}`.split('/');
    const out = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return `/${out.join('/')}`;
  }

  function withAlpha(color, alpha) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  const parentPath = (target) => (target === '/' ? '/' : joinPath(target, '..'));
  const baseName = (target) => target.split('/').filter(Boolean).pop() || '/';

  App.dom = {
    qs, qsa, h, icon, iconButton, formatBytes, formatDate, debounce,
    joinPath, parentPath, baseName, withAlpha,
  };
})(window.App);
