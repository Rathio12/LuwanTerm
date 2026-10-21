(function (App) {
  'use strict';

  const { qs } = App.dom;

  let options = { on: true, seconds: false, twelve: false };
  let timer = null;

  const two = (value) => String(value).padStart(2, '0');

  function render() {
    const now = new Date();
    let hours = now.getHours();
    let suffix = '';
    if (options.twelve) {
      suffix = hours < 12 ? ' AM' : ' PM';
      hours = hours % 12 || 12;
    }
    const time = [options.twelve ? String(hours) : two(hours), two(now.getMinutes())];
    if (options.seconds) time.push(two(now.getSeconds()));
    qs('#empty-time').textContent = time.join(':') + suffix;
    qs('#empty-date').textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (!options.on) return;
    const now = Date.now();
    const step = options.seconds ? 1000 : 60000;
    timer = setTimeout(() => {
      if (!document.hidden && !qs('#empty-state').hidden) render();
      schedule();
    }, step - (now % step) + 5);
  }

  function apply(settings) {
    options = {
      on: settings.startClock !== false,
      seconds: Boolean(settings.clockSeconds),
      twelve: Boolean(settings.clock12h),
    };
    qs('#empty-clock').hidden = !options.on;
    if (options.on) render();
    schedule();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && options.on) render();
  });

  App.state.on('sessions:changed', () => {
    if (options.on && !qs('#empty-state').hidden) render();
  });

  App.clock = { apply, render };
})(window.App);
