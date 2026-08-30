/* Session lifecycle: tabs, terminals, and the files/tunnels dock. */
(function (App) {
  'use strict';

  const { h, icon, qs } = App.dom;
  const state = App.state;

  const strip = () => qs('#tab-strip');
  const terminalsRoot = () => qs('#terminals');
  const dock = () => qs('#dock');

  /** Shell output can arrive before the terminal exists; hold it until it does. */
  const pending = new Map();

  const STATUS_CLASS = {
    connecting: 'is-connecting',
    ready: 'is-ready',
    closed: 'is-closed',
    error: 'is-error',
  };

  function renderTabs() {
    const node = strip();
    node.replaceChildren();

    for (const entry of state.sessions.values()) {
      const tab = h(
        'div',
        {
          class: `tab ${STATUS_CLASS[entry.info.status] || ''}${entry.key === state.activeId ? ' is-active' : ''}`,
          style: `--dot:${entry.host.color}`,
          title: `${entry.host.username}@${entry.host.host}:${entry.host.port}`,
          onclick: () => activate(entry.key),
        },
        [
          h('span', { class: 'tab__dot' }),
          h('span', { class: 'tab__name', text: entry.info.name }),
          h(
            'button',
            {
              class: 'tab__close',
              title: 'Close session',
              onclick: (event) => {
                event.stopPropagation();
                close(entry.key);
              },
            },
            [icon('x')]
          ),
        ]
      );
      node.append(tab);
    }

    qs('#empty-state').hidden = state.sessions.size > 0;
    qs('#tab-tools').hidden = state.sessions.size === 0;
    state.emit('sessions:changed');
  }

  function activate(key) {
    const entry = state.sessions.get(key);
    if (!entry) return;

    state.activeId = key;
    for (const other of state.sessions.values()) {
      other.term?.element.classList.toggle('is-active', other.key === key);
    }
    renderTabs();
    syncDock(entry);
    requestAnimationFrame(() => {
      entry.term?.fit();
      entry.term?.focus();
    });
  }

  /** Opens a new session for a stored host profile. */
  async function open(hostId) {
    const host = state.hostById(hostId);
    if (!host) return;

    const key = `local_${Math.random().toString(36).slice(2, 9)}`;
    const entry = {
      key,
      host,
      info: { id: key, name: host.name, hostId, status: 'connecting' },
      term: null,
      files: null,
      tunnels: null,
      dock: null,
      cwd: host.defaultPath || '.',
    };

    state.sessions.set(key, entry);
    state.activeId = key;
    renderTabs();

    try {
      const info = await window.term.ssh.connect(hostId, { cols: 80, rows: 24 });

      // The user may have closed the pending tab while we were dialling.
      if (!state.sessions.has(key)) {
        window.term.ssh.disconnect(info.id).catch(() => {});
        return;
      }

      state.sessions.delete(key);
      entry.key = info.id;
      entry.info = info;
      state.sessions.set(info.id, entry);
      if (state.activeId === key) state.activeId = info.id;

      mountTerminal(entry);
      renderTabs();
      activate(info.id);
      App.toast.ok(`Connected to ${host.name}`);
    } catch (err) {
      state.sessions.delete(key);
      if (state.activeId === key) state.activeId = null;
      renderTabs();
      App.toast.error(err.message);
    }
  }

  function mountTerminal(entry) {
    entry.term = App.terminal.create(entry.key, state.settings);
    terminalsRoot().append(entry.term.element);
    entry.term.element.classList.add('is-active');
    entry.term.fit();

    const queued = pending.get(entry.key);
    if (queued) {
      for (const chunk of queued) entry.term.write(chunk);
      pending.delete(entry.key);
    }

    const { cols, rows } = entry.term.dimensions();
    window.term.ssh.resize(entry.key, cols, rows).catch(() => {});
    entry.term.focus();
  }

  async function close(key) {
    const entry = state.sessions.get(key);
    if (!entry) return;

    if (state.settings.confirmOnClose && entry.info.status === 'ready') {
      const confirmed = await App.modal.confirm({
        title: 'Close session',
        message: `Disconnect from ${entry.host.name}? Any tunnels on this session are closed too.`,
        confirmLabel: 'Disconnect',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    await window.term.ssh.disconnect(key).catch(() => {});
    entry.term?.dispose();
    state.sessions.delete(key);
    pending.delete(key);

    if (state.activeId === key) {
      const next = [...state.sessions.keys()].pop() || null;
      state.activeId = next;
      if (next) activate(next);
      else setDock(null);
    }
    renderTabs();
  }

  function markStatus(entry, status, detail) {
    entry.info = { ...entry.info, status };
    if (status === 'ready') {
      entry.term?.setOverlay(null);
    } else if (status === 'closed' || status === 'error') {
      entry.term?.setOverlay({
        title: status === 'error' ? 'Connection failed' : 'Disconnected',
        message: detail || 'The session is no longer connected.',
        action: {
          label: 'Reconnect',
          onClick: async () => {
            await close(entry.key);
            open(entry.host.id);
          },
        },
      });
    }
    renderTabs();
  }

  /* ---------- Dock ---------- */

  function syncDock(entry) {
    const mode = entry ? entry.dock : null;
    dock().hidden = !mode;
    qs('#dock-split').hidden = !mode;

    for (const button of App.dom.qsa('#tab-tools .seg')) {
      button.classList.toggle('is-active', button.dataset.dock === mode);
    }
    if (!mode) return;

    qs('#dock-title').textContent = mode === 'files' ? 'Files' : 'Tunnels';
    qs('#dock-files').hidden = mode !== 'files';
    qs('#dock-tunnels').hidden = mode !== 'tunnels';

    if (mode === 'files') {
      if (!entry.files) entry.files = App.files.create(entry.key, entry.cwd);
      qs('#dock-files').replaceChildren(entry.files.element);
    } else {
      if (!entry.tunnels) entry.tunnels = App.tunnels.create(entry.key);
      qs('#dock-tunnels').replaceChildren(entry.tunnels.element);
      entry.tunnels.refresh();
    }
  }

  function setDock(mode) {
    const entry = state.active();
    if (!entry) return;
    entry.dock = entry.dock === mode ? null : mode;
    syncDock(entry);
    requestAnimationFrame(() => entry.term?.fit());
  }

  /** Sends text into the active terminal, used by the snippet list. */
  function sendToActive(text, execute) {
    const entry = state.active();
    if (!entry || entry.info.status !== 'ready') {
      App.toast.error('Open a session first.');
      return;
    }
    window.term.ssh.write(entry.key, execute ? `${text}\n` : text).catch((err) => App.toast.error(err.message));
    entry.term?.focus();
  }

  App.sessions = { open, close, activate, setDock, renderTabs, sendToActive, markStatus, pending };
})(window.App);
