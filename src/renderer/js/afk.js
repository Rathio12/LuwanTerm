(() => {
  'use strict';

  const { h, qs } = App.dom;

  // Input, not presence. 'mousemove' is deliberately absent: a nudged desk or a
  // passing cursor is not someone working, and counting it means the screen
  // never appears on a machine that gets knocked. 'focus' is absent for a
  // sharper reason - it fires whenever anything inside the app takes focus, so
  // it dismissed the screen the instant it appeared.
  const ACTIVITY = ['keydown', 'mousedown', 'wheel', 'touchstart'];

  let overlay = null;
  let timer = null;
  let clock = null;
  let awaySince = 0;
  let limitMs = 0;

  const two = (value) => String(value).padStart(2, '0');

  function build() {
    const time = h('div', { class: 'afk__time', text: '' });
    const since = h('div', { class: 'afk__since', text: '' });
    const detail = h('div', { class: 'afk__detail', text: '' });

    const card = h('div', { class: 'afk__card' }, [
      h('div', { class: 'afk__mark' }, [App.dom.icon ? App.dom.icon('terminal') : h('span')]),
      time,
      h('div', { class: 'afk__title', text: 'Away' }),
      since,
      detail,
      h('div', { class: 'afk__hint', text: 'Press any key to come back' }),
    ]);

    const element = h('div', { class: 'afk', hidden: true }, [card]);
    document.body.append(element);
    return { element, time, since, detail };
  }

  function paintBackground(element, settings) {
    const image = settings.backgroundImage;
    if (image) {
      element.style.backgroundImage = `url("${image.replace(/"/g, '%22')}")`;
      element.classList.add('afk--image');
    } else {
      element.style.backgroundImage = '';
      element.classList.remove('afk--image');
    }
  }

  function describe(settings, sessions) {
    if (!sessions) return 'No sessions are open.';

    const word = sessions === 1 ? 'session is' : 'sessions are';
    const minutes = Number(settings.idleDisconnectMinutes) || 0;
    if (!minutes) return `${sessions} ${word} still connected.`;
    return `${sessions} ${word} still connected, and will be closed after ${minutes} idle minutes.`;
  }

  async function show() {
    if (!overlay) overlay = build();
    if (!overlay.element.hidden) return;

    let settings = {};
    try {
      settings = await window.term.settings.get();
    } catch {
      settings = {};
    }

    const sessions = App.state && App.state.sessions ? App.state.sessions.size : 0;
    paintBackground(overlay.element, settings);
    overlay.detail.textContent = describe(settings, sessions);

    awaySince = Date.now();
    overlay.element.hidden = false;

    const tick = () => {
      const now = new Date();
      overlay.time.textContent = `${two(now.getHours())}:${two(now.getMinutes())}`;
      const minutes = Math.floor((Date.now() - awaySince) / 60000);
      overlay.since.textContent = minutes ? `Away for ${minutes} minute${minutes === 1 ? '' : 's'}` : '';
    };
    tick();
    clearInterval(clock);
    clock = setInterval(tick, 10000);
  }

  function hide() {
    clearInterval(clock);
    clock = null;
    if (overlay && !overlay.element.hidden) {
      overlay.element.hidden = true;
      App.state?.active?.()?.term?.focus();
    }
  }

  function reset() {
    hide();
    clearTimeout(timer);
    timer = null;
    if (limitMs > 0) timer = setTimeout(show, limitMs);
  }

  async function apply(settings) {
    const minutes = Math.max(0, Number(settings && settings.idleLockMinutes) || 0);
    limitMs = minutes * 60 * 1000;
    reset();
  }

  for (const event of ACTIVITY) {
    window.addEventListener(event, reset, { passive: true, capture: true });
  }

  App.afk = { apply, show, hide, reset };
})();
