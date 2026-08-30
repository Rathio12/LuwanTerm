/* Bootstrap: loads state, wires the chrome, and routes main-process events. */
(function (App) {
  'use strict';

  const { h, icon, qs, qsa, debounce, formatBytes } = App.dom;
  const state = App.state;

  /* ---------- Window chrome ---------- */

  function wireChrome() {
    qs('#win-min').onclick = () => window.term.app.minimize();
    qs('#win-max').onclick = () => window.term.app.maximize();
    qs('#win-close').onclick = () => window.term.app.close();

    window.term.app.onMaximized((maximized) => {
      const button = qs('#win-max');
      button.replaceChildren(icon(maximized ? 'restore' : 'max'));
      button.title = maximized ? 'Restore' : 'Maximize';
    });
  }

  /* ---------- Sidebar ---------- */

  const NEW_LABELS = { hosts: 'New host', keys: 'New key', snippets: 'New snippet' };
  const SEARCH_HINTS = { hosts: 'Search hosts', keys: 'Search keys', snippets: 'Search snippets' };

  function wireSidebar() {
    for (const tab of qsa('#sidebar-tabs .stab')) {
      tab.onclick = () => {
        for (const other of qsa('#sidebar-tabs .stab')) other.classList.toggle('is-active', other === tab);
        for (const panel of qsa('.spanel')) {
          panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.panel);
        }
        qs('#btn-new-label').textContent = NEW_LABELS[tab.dataset.panel];
        qs('#btn-import-key').hidden = tab.dataset.panel !== 'keys';
        qs('#host-search').placeholder = SEARCH_HINTS[tab.dataset.panel];
      };
    }

    qs('#host-search').addEventListener(
      'input',
      debounce((event) => {
        state.filter = event.target.value;
        App.hosts.render();
        App.keys.render();
        App.snippets.render();
      }, 120)
    );

    qs('#btn-new').onclick = () => {
      const panel = qs('#sidebar-tabs .stab.is-active').dataset.panel;
      if (panel === 'hosts') App.hosts.edit();
      else if (panel === 'keys') App.keys.create();
      else App.snippets.edit();
    };

    qs('#btn-import-key').onclick = () => App.keys.addExisting();

    qs('#btn-settings').onclick = () => App.settings.open();
    qs('#empty-new-host').onclick = () => App.hosts.edit();
  }

  /* ---------- Dock ---------- */

  function wireDock() {
    for (const button of qsa('#tab-tools .seg')) {
      button.onclick = () => App.sessions.setDock(button.dataset.dock);
    }
    qs('#dock-close').onclick = () => App.sessions.setDock(null);

    const splitter = qs('#dock-split');
    let dragging = false;

    splitter.addEventListener('mousedown', (event) => {
      dragging = true;
      event.preventDefault();
      document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const stage = qs('.stage').getBoundingClientRect();
      const width = Math.min(Math.max(stage.right - event.clientX, 320), stage.width - 320);
      document.documentElement.style.setProperty('--dock-w', `${Math.round(width)}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      state.active()?.term?.fit();
    });
  }

  /* ---------- Transfers ---------- */

  const transfers = new Map();

  function onProgress(payload) {
    const root = qs('#transfers');
    let row = transfers.get(payload.transferId);

    if (payload.done) {
      row?.element.remove();
      transfers.delete(payload.transferId);
      if (payload.cancelled) App.toast.info(`Cancelled ${payload.name}`);
      return;
    }

    if (!row) {
      const fill = h('span', { class: 'transfer__fill', style: 'width:0%' });
      const percent = h('span', { class: 'transfer__pct', text: '0%' });
      const label = h('div', { class: 'transfer__name', text: payload.name });
      const element = h('div', { class: 'transfer' }, [
        icon(payload.direction === 'upload' ? 'upload' : 'download'),
        h('div', {}, [label, h('div', { class: 'transfer__track' }, [fill])]),
        percent,
        h(
          'button',
          {
            class: 'iconbtn iconbtn--danger',
            title: 'Cancel transfer',
            onclick: () =>
              window.term.sftp
                .cancel(payload.sessionId, payload.transferId)
                .catch((err) => App.toast.error(err.message)),
          },
          [icon('x')]
        ),
      ]);
      row = { element, fill, percent, label };
      transfers.set(payload.transferId, row);
      root.append(element);
    }

    // Directory downloads report which file of how many is in flight.
    row.label.textContent = payload.filesTotal
      ? `${payload.name} - ${payload.filesDone + 1}/${payload.filesTotal} ${payload.file || ''}`
      : payload.name;

    const ratio = payload.total ? Math.min(1, payload.transferred / payload.total) : 0;
    row.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    row.percent.textContent = payload.total
      ? `${Math.round(ratio * 100)}%`
      : formatBytes(payload.transferred);
  }

  /* ---------- Main-process events ---------- */

  function routeEvent(event) {
    const entry = state.session(event.sessionId);

    switch (event.type) {
      case 'data': {
        if (entry && entry.term) entry.term.write(event.chunk);
        else {
          const queue = App.sessions.pending.get(event.sessionId) || [];
          queue.push(event.chunk);
          App.sessions.pending.set(event.sessionId, queue);
        }
        break;
      }
      case 'status':
        if (entry) App.sessions.markStatus(entry, event.status, event.detail);
        break;
      case 'banner':
        if (event.message) App.toast.info(event.message.trim().slice(0, 240));
        break;
      case 'tunnel:activity':
        entry?.tunnels?.updateActivity(event);
        break;
      case 'tunnel:error':
        App.toast.error(`Tunnel error: ${event.message}`);
        break;
      default:
        break;
    }
  }

  /* ---------- Shortcuts ---------- */

  function wireShortcuts() {
    window.addEventListener('keydown', (event) => {
      const keys = [...state.sessions.keys()];

      // Alt+1..9 jumps to a tab; readline never sees these.
      if (event.altKey && !event.ctrlKey && /^Digit[1-9]$/.test(event.code)) {
        const target = keys[Number(event.code.slice(5)) - 1];
        if (!target) return;
        event.preventDefault();
        App.sessions.activate(target);
        return;
      }

      if (!event.ctrlKey || event.altKey) return;

      if (event.code === 'Tab' && keys.length > 1) {
        event.preventDefault();
        const index = keys.indexOf(state.activeId);
        const step = event.shiftKey ? -1 : 1;
        App.sessions.activate(keys[(index + step + keys.length) % keys.length]);
      } else if (event.shiftKey && event.code === 'KeyW' && state.activeId) {
        event.preventDefault();
        App.sessions.close(state.activeId);
      } else if (event.shiftKey && event.code === 'KeyN') {
        event.preventDefault();
        App.hosts.edit();
      }
    });
  }

  /* ---------- Boot ---------- */

  async function boot() {
    wireChrome();
    wireSidebar();
    wireDock();
    wireShortcuts();
    App.prompts.register();

    window.term.ssh.onEvent(routeEvent);
    window.term.sftp.onProgress(onProgress);

    try {
      const [info, settings] = await Promise.all([window.term.app.info(), window.term.settings.get()]);
      state.info = info;
      state.settings = settings;
      qs('#app-version').textContent = `v${info.version}`;

      await Promise.all([App.hosts.reload(), App.keys.reload(), App.snippets.reload()]);
    } catch (err) {
      App.toast.error(`Startup failed: ${err.message}`);
    } finally {
      // Dismisses the splash window, whether or not startup went cleanly.
      window.term.app.ready();
    }

    // Keep host rows in sync with which hosts have a live session.
    state.on('sessions:changed', () => App.hosts.render());
    App.sessions.renderTabs();
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.App);
