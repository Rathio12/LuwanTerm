/* Transient notifications in the bottom-right corner. */
(function (App) {
  'use strict';

  const { h, qs } = App.dom;
  const MAX_VISIBLE = 4;

  function push(message, variant = 'info', timeout = 4200) {
    const root = qs('#toasts');
    const toast = h('div', { class: `toast toast--${variant}` }, [
      h('span', { class: 'toast__bar' }),
      h('span', { text: message }),
    ]);

    root.append(toast);
    while (root.children.length > MAX_VISIBLE) root.firstElementChild.remove();

    setTimeout(() => {
      toast.style.transition = 'opacity 180ms, transform 180ms';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(16px)';
      setTimeout(() => toast.remove(), 200);
    }, timeout);
  }

  App.toast = {
    info: (message) => push(message, 'info'),
    ok: (message) => push(message, 'ok'),
    error: (message) => push(message, 'error', 6000),
  };
})(window.App);
