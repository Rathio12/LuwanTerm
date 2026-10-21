(function (App) {
  'use strict';

  const { h, qs, icon } = App.dom;
  const state = App.state;

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  function ago(time) {
    const elapsed = Date.now() - Number(time || 0);
    if (elapsed < MINUTE) return 'just now';
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
    if (elapsed < 2 * DAY) return 'yesterday';
    if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;
    return new Date(time).toLocaleDateString();
  }

  function duration(entry) {
    if (!entry.closedAt) return '';
    const length = entry.closedAt - entry.openedAt;
    if (length < MINUTE) return `${Math.max(1, Math.round(length / 1000))} s`;
    if (length < HOUR) return `${Math.round(length / MINUTE)} min`;
    return `${(length / HOUR).toFixed(1)} h`;
  }

  function item(entry) {
    const length = duration(entry);
    return h('button', {
      class: 'recent__item',
      title: `Connect to ${entry.name}`,
      onclick: () => App.sessions.open(entry.hostId),
    }, [
      h('span', { class: 'recent__dot', style: entry.color ? `background:${entry.color}` : '' }),
      h('span', { class: 'recent__text' }, [
        h('span', { class: 'recent__name', text: entry.name }),
        h('span', { class: 'recent__target', text: entry.target }),
      ]),
      h('span', { class: 'recent__when' }, [
        h('span', { text: ago(entry.closedAt || entry.openedAt) }),
        h('span', {
          class: 'recent__meta',
          text: [length, `${entry.count} session${entry.count === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
        }),
      ]),
    ]);
  }

  function last(entry) {
    const length = duration(entry);
    return h('div', { class: 'recent__last' }, [
      h('div', { class: 'recent__lasthead' }, [
        h('span', { class: 'recent__dot', style: entry.color ? `background:${entry.color}` : '' }),
        h('span', { class: 'recent__lastname', text: entry.name }),
      ]),
      h('span', { class: 'recent__target', text: entry.target }),
      h('span', {
        class: 'recent__meta',
        text: [
          ago(entry.closedAt || entry.openedAt),
          length ? `lasted ${length}` : '',
          `${entry.count} session${entry.count === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · '),
      }),
      h('button', {
        class: 'btn btn--primary recent__reconnect',
        onclick: () => App.sessions.open(entry.hostId),
      }, [icon('refresh'), 'Reconnect']),
    ]);
  }

  let pending = null;

  async function refresh() {
    const panel = qs('#recent');
    if (!panel) return;
    if (state.settings && state.settings.recentSessions === false) {
      panel.hidden = true;
      return;
    }
    const ticket = {};
    pending = ticket;
    let entries = [];
    try {
      entries = await window.term.recent.list();
    } catch {
      entries = [];
    }
    if (pending !== ticket) return;
    const [first, ...earlier] = entries;
    const body = first
      ? [
          last(first),
          earlier.length ? h('div', { class: 'recent__label', text: 'Earlier' }) : null,
          ...earlier.map(item),
        ]
      : [h('div', { class: 'recent__empty', text: 'Your last session shows up here once you have connected to a host.' })];
    qs('#recent-list').replaceChildren(...body.filter(Boolean));
    qs('#recent-clear').hidden = !first;
    panel.hidden = false;
  }

  function wire() {
    qs('#recent-clear').onclick = async () => {
      const confirmed = await App.modal.confirm({
        title: 'Clear recent sessions',
        message: 'Forget which hosts you connected to and when? Your hosts themselves stay.',
        confirmLabel: 'Clear',
      });
      if (!confirmed) return;
      try {
        await window.term.recent.clear();
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    };
    state.on('sessions:changed', () => {
      if (!qs('#empty-state').hidden) refresh();
    });
  }

  App.recent = { refresh, wire };
})(window.App);
