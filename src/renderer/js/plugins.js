(() => {
  'use strict';

  const { h, icon, iconButton } = App.dom;

  /**
   * The panel a plugin describes.
   *
   * Nothing here executes anything a plugin supplied: a manifest is a name, an
   * icon, a command and a shape, and this turns that into a table. The command
   * is printed under the table on every panel, because a thing that runs on
   * your server should say what it runs.
   *
   * Takes a getter for the session id rather than the id itself - a session is
   * given a temporary key while it connects and a real one afterwards.
   */
  function create(currentId) {
    const idOf = () => (typeof currentId === 'function' ? currentId() : currentId);

    const chips = h('div', { class: 'plug__chips' });
    const title = h('div', { class: 'plug__name', text: 'Plugins' });
    const note = h('div', { class: 'plug__note', text: '' });
    const body = h('div', { class: 'plug__body' });
    const command = h('code', { class: 'plug__command', text: '' });
    const stamp = h('span', { class: 'plug__stamp', text: '' });

    const refreshButton = iconButton('refresh', {
      title: 'Run it again',
      onClick: () => run({ manual: true }),
    });

    const head = h('div', { class: 'plug__head' }, [
      h('div', {}, [title, note]),
      refreshButton,
    ]);

    const element = h('div', { class: 'plug' }, [
      chips,
      head,
      body,
      h('div', { class: 'plug__foot' }, [command, stamp]),
    ]);

    let installed = [];
    let enabled = [];
    let allowed = true;
    let chosen = null;
    let timer = null;
    let started = false;
    let unsubscribe = null;
    let inFlight = false;

    const selected = () => installed.find((plugin) => plugin.id === chosen) || null;

    const hint = (text) => {
      body.replaceChildren(h('div', { class: 'hint', text }));
    };

    function renderChips() {
      chips.replaceChildren();
      if (enabled.length < 2) {
        chips.hidden = true;
        return;
      }
      chips.hidden = false;

      for (const plugin of enabled) {
        chips.append(h('button', {
          class: `plug__chip${plugin.id === chosen ? ' is-on' : ''}`,
          title: plugin.description || plugin.command,
          onclick: () => choose(plugin.id),
        }, [icon(plugin.icon), h('span', { text: plugin.name })]));
      }
    }

    function renderTable(result) {
      body.replaceChildren();

      if (result.error) {
        body.append(h('div', { class: 'hint', text: result.error }));
        return;
      }
      if (!result.rows.length) {
        body.append(h('div', { class: 'hint', text: 'The command printed nothing.' }));
        return;
      }

      const width = Math.max(result.columns.length, ...result.rows.map((row) => row.length));
      const table = h('table', { class: 'plug__table' });

      if (result.columns.length) {
        table.append(h('thead', {}, [
          h('tr', {}, result.columns.map((name) => h('th', { text: name }))),
        ]));
      }

      const rows = result.rows.map((row) => {
        const cells = [];
        for (let index = 0; index < width; index += 1) {
          cells.push(h('td', { title: row[index] || '', text: row[index] || '' }));
        }
        return h('tr', {}, cells);
      });

      table.append(h('tbody', {}, rows));
      body.append(table);

      if (result.truncated) {
        body.append(h('div', { class: 'hint', text: 'The output was longer than this panel shows.' }));
      }
    }

    async function run({ manual = false } = {}) {
      const plugin = selected();
      if (!plugin || inFlight) return;

      inFlight = true;
      refreshButton.disabled = true;
      if (manual) stamp.textContent = 'Running...';

      try {
        const result = await window.term.plugins.run(idOf(), plugin.id);
        if (chosen !== plugin.id) return;
        renderTable(result);
        stamp.textContent = `Updated ${new Date(result.at).toLocaleTimeString()}`;
      } catch (err) {
        if (chosen !== plugin.id) return;
        hint(err.message);
        stamp.textContent = '';
      } finally {
        inFlight = false;
        refreshButton.disabled = false;
      }
    }

    function schedule() {
      clearInterval(timer);
      timer = null;

      const plugin = selected();
      if (!plugin || !plugin.refreshSeconds) return;
      timer = setInterval(() => run(), plugin.refreshSeconds * 1000);
    }

    function choose(id) {
      chosen = id;
      const plugin = selected();

      title.textContent = plugin ? plugin.name : 'Plugins';
      note.textContent = plugin ? (plugin.description || '') : '';
      command.textContent = plugin ? plugin.command : '';
      stamp.textContent = '';
      command.hidden = !plugin;
      refreshButton.hidden = !plugin;

      renderChips();
      if (!plugin) return;

      hint('Reading the server...');
      schedule();
      run();
    }

    async function load() {
      let listing;
      try {
        listing = await window.term.plugins.list();
      } catch (err) {
        hint(err.message);
        return;
      }

      installed = listing.plugins;
      allowed = listing.allowed;
      enabled = installed.filter((plugin) => listing.enabled.includes(plugin.id));

      if (!allowed) {
        chosen = null;
        renderChips();
        command.hidden = true;
        refreshButton.hidden = true;
        hint('Plugins are disabled by policy on this machine.');
        return;
      }

      if (!enabled.length) {
        chosen = null;
        renderChips();
        command.hidden = true;
        refreshButton.hidden = true;
        title.textContent = 'Plugins';
        note.textContent = '';
        body.replaceChildren(
          h('div', { class: 'hint' }, [
            installed.length
              ? 'No plugins are switched on yet.'
              : 'No plugins installed yet. A plugin is one small JSON file: a name, a command and the shape of its output.',
          ]),
          h('button', {
            class: 'btn btn--ghost',
            onclick: () => App.settings.open('plugins'),
          }, [icon('cog'), 'Open plugin settings'])
        );
        return;
      }

      choose(enabled.some((plugin) => plugin.id === chosen) ? chosen : enabled[0].id);
    }

    return {
      element,

      start() {
        if (started) return;
        started = true;
        unsubscribe = App.state.on('plugins:changed', () => load());
        load();
      },

      stop() {
        if (!started) return;
        started = false;

        clearInterval(timer);
        timer = null;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
      },
    };
  }

  App.plugins = { create };
})();
