(function (App) {
  'use strict';

  const { h, icon, iconButton, qs } = App.dom;
  const { form } = App.modal;
  const state = App.state;

  const ACCENTS = ['#7c5cff', '#3ea8ff', '#22c58b', '#f2a33c', '#ff5c8a', '#8b5cf6'];

  const AUTH_LABELS = {
    password: 'Password',
    key: 'Private key',
    agent: 'SSH agent',
  };

  async function reload() {
    state.hosts = await window.term.hosts.list();
    render();
  }

  function matches(host, filter) {
    if (!filter) return true;
    const haystack = `${host.name} ${host.host} ${host.username} ${host.group}`.toLowerCase();
    return haystack.includes(filter);
  }

  function render() {
    const list = qs('#host-list');
    list.replaceChildren();

    const filter = state.filter.trim().toLowerCase();
    const visible = state.hosts.filter((host) => matches(host, filter));

    if (!visible.length) {
      list.append(
        h('div', {
          class: 'hint',
          text: state.hosts.length ? 'No hosts match that search.' : 'No hosts yet. Add one to get started.',
        })
      );
      return;
    }

    const groups = new Map();
    for (const host of visible) {
      const key = host.group || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(host);
    }

    const ordered = [...groups.entries()].sort(([a], [b]) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b);
    });

    for (const [group, hosts] of ordered) {
      if (group) list.append(h('div', { class: 'group-label', text: group }));
      for (const host of hosts) list.append(row(host));
    }
  }

  function row(host) {
    const live = state.sessionsForHost(host.id).length > 0;

    return h(
      'div',
      {
        class: `host${live ? ' is-live' : ''}`,
        style: `--dot:${host.color}`,
        onclick: () => App.sessions.open(host.id),
      },
      [
        h('span', { class: 'host__dot' }),
        h('div', { class: 'host__text' }, [
          h('div', { class: 'host__name', text: host.name }),
          h('div', {
            class: 'host__addr',
            text: `${host.username}@${host.host}:${host.port} - ${AUTH_LABELS[host.auth]}`,
          }),
        ]),
        h('div', { class: 'host__acts' }, [
          iconButton('edit', {
            title: 'Edit',
            onClick: (event) => {
              event.stopPropagation();
              edit(host);
            },
          }),
          iconButton('copy', {
            title: 'Duplicate',
            onClick: async (event) => {
              event.stopPropagation();
              try {
                await window.term.hosts.duplicate(host.id);
                reload();
              } catch (err) {
                App.toast.error(err.message);
              }
            },
          }),
          iconButton('trash', {
            title: 'Delete',
            className: 'iconbtn iconbtn--danger',
            onClick: (event) => {
              event.stopPropagation();
              remove(host);
            },
          }),
        ]),
      ]
    );
  }

  async function remove(host) {
    const confirmed = await App.modal.confirm({
      title: 'Delete host',
      message: 'The profile and any secret stored for it are removed. Open sessions stay connected.',
      detail: `${host.name} - ${host.username}@${host.host}`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      await window.term.hosts.remove(host.id);
      App.toast.ok(`Removed ${host.name}`);
      reload();
    } catch (err) {
      App.toast.error(err.message);
    }
  }

  function edit(host = null) {
    const model = host || {
      name: '', host: '', port: 22, username: '', auth: 'password', keyId: '', privateKeyPath: '',
      group: '', color: ACCENTS[0], keepaliveSeconds: 30, initialCommand: '', defaultPath: '',
    };

    const fields = {
      name: form.input({ value: model.name, placeholder: 'prod-web' }),
      group: form.input({ value: model.group, placeholder: 'Production (optional)' }),
      host: form.input({ value: model.host, placeholder: 'example.com', class: 'input input--mono' }),
      port: form.input({ type: 'number', min: '1', max: '65535', value: model.port, class: 'input input--mono' }),
      username: form.input({ value: model.username, placeholder: 'root', class: 'input input--mono' }),
      auth: form.select(
        Object.entries(AUTH_LABELS).map(([value, label]) => ({ value, label })),
        { value: model.auth }
      ),
      keyPath: form.input({
        value: model.privateKeyPath,
        placeholder: 'No key selected',
        class: 'input input--mono',
        readonly: true,
      }),
      keepalive: form.input({ type: 'number', min: '0', max: '600', value: model.keepaliveSeconds }),
      defaultPath: form.input({ value: model.defaultPath, placeholder: '/var/www (optional)', class: 'input input--mono' }),
      initialCommand: form.input({ value: model.initialCommand, placeholder: 'tmux attach (optional)', class: 'input input--mono' }),
    };

    let color = model.color;
    const swatches = h(
      'div',
      { class: 'swatches' },
      ACCENTS.map((value) =>
        h('button', {
          class: `swatch${value === color ? ' is-on' : ''}`,
          style: `background:${value}`,
          title: value,
          onclick: (event) => {
            event.preventDefault();
            color = value;
            for (const node of swatches.children) node.classList.toggle('is-on', node.title === value);
          },
        })
      )
    );

    const EXTERNAL = '__file__';

    const keyChoice = form.select(
      [
        ...state.keys.map((key) => ({
          value: key.id,
          label: `${key.name} - ${App.keys.typeLabel(key)}${key.encrypted ? ' (encrypted)' : ''}`,
        })),
        { value: EXTERNAL, label: 'External key file...' },
      ],
      { value: model.keyId || (model.privateKeyPath ? EXTERNAL : state.keys[0]?.id || EXTERNAL) }
    );

    const browse = h('button', { class: 'btn btn--ghost', onclick: pickKey }, [icon('folder'), 'Browse']);
    const fileRow = form.field(
      'Key file',
      h('div', { class: 'row row--split' }, [fields.keyPath, browse]),
      'OpenSSH and PuTTY formats are both accepted. Encrypted keys prompt for their passphrase.'
    );

    const keyBlock = h('div', { class: 'row' }, [
      form.field(
        'Key',
        keyChoice,
        state.keys.length
          ? 'Keys generated or imported in the Keys tab are managed for you.'
          : 'No managed keys yet. Add one in the Keys tab, or point at a file below.'
      ),
      fileRow,
    ]);

    async function pickKey(event) {
      event.preventDefault();
      try {
        const picked = await window.term.hosts.pickKey();
        if (picked) fields.keyPath.value = picked;
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    const syncKeySource = () => {
      fileRow.hidden = keyChoice.value !== EXTERNAL;
    };
    keyChoice.addEventListener('change', syncKeySource);

    const syncAuth = () => {
      keyBlock.hidden = fields.auth.value !== 'key';
      syncKeySource();
    };
    fields.auth.addEventListener('change', syncAuth);
    syncAuth();

    const secretRow = host && host.hasStoredSecret ? buildSecretRow(host) : null;

    return App.modal
      .show({
        title: host ? 'Edit host' : 'New host',
        iconName: 'server',
        wide: true,
        content: h('div', { class: 'row' }, [
          form.row([form.field('Display name', fields.name), form.field('Group', fields.group)]),
          h('div', { class: 'row row--split' }, [
            form.field('Address', fields.host),
            form.field('Port', fields.port),
          ]),
          form.row([form.field('Username', fields.username), form.field('Authentication', fields.auth)]),
          keyBlock,
          form.row([
            form.field('Keepalive seconds (0 disables)', fields.keepalive),
            form.field('Accent', swatches),
          ]),
          form.row([
            form.field('Default SFTP path', fields.defaultPath),
            form.field('Run on connect', fields.initialCommand),
          ]),
          secretRow,
        ]),
        buttons: [
          { label: 'Cancel', value: null },
          { label: host ? 'Save changes' : 'Create host', value: 'save', primary: true },
        ],
        onSubmit: async () => {
          await window.term.hosts.save({
            id: host ? host.id : undefined,
            name: fields.name.value,
            group: fields.group.value,
            host: fields.host.value,
            port: fields.port.value,
            username: fields.username.value,
            auth: fields.auth.value,
            keyId: keyChoice.value === EXTERNAL ? '' : keyChoice.value,
            privateKeyPath: keyChoice.value === EXTERNAL ? fields.keyPath.value : '',
            color,
            keepaliveSeconds: fields.keepalive.value,
            defaultPath: fields.defaultPath.value,
            initialCommand: fields.initialCommand.value,
          });
          return true;
        },
      })
      .then((result) => {
        if (result) reload();
      });
  }

  function buildSecretRow(host) {
    const row = h('div', { class: 'callout' }, [
      h('span', { text: 'A secret for this host is saved in the OS keychain.' }),
      h('button', {
        class: 'btn btn--ghost',
        text: 'Forget it',
        style: 'justify-self:start;margin-top:6px',
        onclick: async (event) => {
          event.preventDefault();
          await window.term.hosts.forgetSecret(host.id);
          App.toast.ok('Stored secret removed');
          row.remove();
          reload();
        },
      }),
    ]);
    return row;
  }

  App.hosts = { reload, render, edit };
})(window.App);
