/* SSH key store: generate, import, inspect, install on a server, delete. */
(function (App) {
  'use strict';

  const { h, icon, iconButton, qs } = App.dom;
  const { form } = App.modal;
  const state = App.state;

  const GENERATE_TYPES = [
    { value: 'ed25519', label: 'Ed25519 (recommended)', bits: null },
    { value: 'rsa', label: 'RSA', bits: [4096, 3072, 2048] },
    { value: 'ecdsa', label: 'ECDSA', bits: [256, 384, 521] },
  ];

  /** Turns an SSH algorithm name into a short badge. */
  function typeLabel(key) {
    if (!key.type || key.type === 'unknown') return 'LOCKED';
    if (key.type === 'ssh-ed25519') return 'ED25519';
    if (key.type === 'ssh-rsa') return `RSA${key.bits ? ` ${key.bits}` : ''}`;
    if (key.type.startsWith('ecdsa')) return `ECDSA ${key.type.replace(/\D+/g, '') || ''}`.trim();
    return key.type.toUpperCase();
  }

  async function reload() {
    state.keys = await window.term.keys.list();
    render();
  }

  function matches(key, filter) {
    if (!filter) return true;
    return `${key.name} ${key.type} ${key.comment} ${key.fingerprint}`.toLowerCase().includes(filter);
  }

  function render() {
    const list = qs('#key-list');
    list.replaceChildren();

    const filter = state.filter.trim().toLowerCase();
    const visible = state.keys.filter((key) => matches(key, filter));

    if (!visible.length) {
      if (state.keys.length) {
        list.append(h('div', { class: 'hint', text: 'No keys match that search.' }));
        return;
      }
      list.append(
        h('div', {
          class: 'hint',
          text: 'No keys yet. Generate one, or add a key you already have - the add button can also look through the usual places on this PC.',
        })
      );
      return;
    }

    for (const key of visible) list.append(row(key));
  }

  const SOURCE_TAGS = {
    linked: { label: 'Linked file', class: 'tag tag--found' },
  };

  function row(key) {
    const found = key.source === 'discovered';
    const sourceTag = SOURCE_TAGS[key.source];

    return h('div', { class: 'keyrow', title: key.path || key.fingerprint }, [
      h('div', { class: 'keyrow__top' }, [
        h('span', { class: 'keyrow__name', text: key.name }),
        h('div', { class: 'keyrow__acts' }, [
          key.publicKey
            ? iconButton('upload-cloud', { title: 'Install on a server', onClick: () => deploy(key) })
            : null,
          key.publicKey
            ? iconButton('copy', { title: 'Copy public key', onClick: () => copyPublic(key) })
            : null,
          iconButton('edit', { title: 'Details', onClick: () => details(key) }),
          found
            ? null
            : iconButton('trash', {
                title: 'Delete',
                className: 'iconbtn iconbtn--danger',
                onClick: () => remove(key),
              }),
        ]),
      ]),
      h('div', { class: 'keyrow__meta' }, [
        h('span', { class: 'tag', text: typeLabel(key) }),
        sourceTag ? h('span', { class: sourceTag.class, text: sourceTag.label }) : null,
        key.encrypted ? h('span', { class: 'tag tag--lock' }, [icon('shield'), 'Encrypted']) : null,
        h('span', {
          class: 'keyrow__fp',
          text: key.fingerprint ? key.fingerprint.replace('SHA256:', '') : key.path || '',
        }),
      ]),
    ]);
  }

  async function copyPublic(key) {
    try {
      await window.term.clipboard.write(key.publicKey);
      App.toast.ok('Public key copied');
    } catch (err) {
      App.toast.error(err.message);
    }
  }

  async function remove(key) {
    const used = state.hosts.filter((host) => host.keyId === key.id);
    const confirmed = await App.modal.confirm({
      title: 'Delete key',
      message: used.length
        ? `${used.length} host profile${used.length > 1 ? 's use' : ' uses'} this key and will stop connecting until you pick another one. The private key file is erased.`
        : 'The private key file is erased from this machine. Anything already trusting its public half keeps trusting it.',
      detail: `${key.name} - ${key.fingerprint}`,
      confirmLabel: 'Delete key',
    });
    if (!confirmed) return;

    try {
      await window.term.keys.remove(key.id);
      App.toast.ok(`Deleted ${key.name}`);
      reload();
      App.hosts.reload();
    } catch (err) {
      App.toast.error(err.message);
    }
  }

  function details(key) {
    const publicField = form.textarea({ readonly: true, rows: 4, value: key.publicKey });
    publicField.style.minHeight = '86px';

    const rename = form.input({ value: key.name });

    return App.modal
      .show({
        title: 'Key details',
        iconName: 'key',
        wide: true,
        content: h('div', { class: 'row' }, [
          form.field('Name', rename),
          h('dl', { class: 'kv' }, [
            h('dt', { text: 'Type' }),
            h('dd', { text: typeLabel(key) }),
            h('dt', { text: 'Fingerprint' }),
            h('dd', { text: key.fingerprint }),
            h('dt', { text: 'Comment' }),
            h('dd', { text: key.comment || '(none)' }),
            h('dt', { text: 'Source' }),
            h('dd', { text: key.source === 'generated' ? 'Generated here' : 'Imported' }),
          ]),
          form.field(
            'Public key',
            publicField,
            'Paste this line into ~/.ssh/authorized_keys on the server, or use "Install on a server".'
          ),
          h('button', { class: 'btn btn--ghost', style: 'justify-self:start', onclick: (event) => {
            event.preventDefault();
            copyPublic(key);
          } }, [icon('copy'), 'Copy public key']),
        ]),
        buttons: [
          { label: 'Close', value: null },
          { label: 'Save name', value: 'save', primary: true },
        ],
        onSubmit: async () => {
          await window.term.keys.rename(key.id, rename.value);
          return true;
        },
      })
      .then((result) => {
        if (result) reload();
      });
  }

  /* ---------- Generate ---------- */

  function create() {
    const name = form.input({ placeholder: 'laptop' });
    const type = form.select(GENERATE_TYPES.map(({ value, label }) => ({ value, label })), {
      value: 'ed25519',
    });
    const bits = form.select([], {});
    const comment = form.input({
      value: `${state.info.platform === 'win32' ? 'windows' : 'local'}@luwanterm`,
      class: 'input input--mono',
    });
    const passphrase = form.input({ type: 'password', placeholder: 'Optional but recommended' });
    const remember = form.check(
      state.info.secretsAvailable
        ? 'Remember the passphrase in the OS keychain'
        : 'Secret storage is unavailable on this system',
      state.info.secretsAvailable,
      { disabled: !state.info.secretsAvailable }
    );

    const bitsField = form.field('Size', bits);

    const syncBits = () => {
      const spec = GENERATE_TYPES.find((entry) => entry.value === type.value);
      bitsField.hidden = !spec.bits;
      if (!spec.bits) return;
      bits.replaceChildren(
        ...spec.bits.map((value, index) =>
          h('option', { value, selected: index === 0 }, [`${value} bits`])
        )
      );
    };
    type.addEventListener('change', syncBits);
    syncBits();

    return App.modal
      .show({
        title: 'Generate a key pair',
        iconName: 'key',
        wide: true,
        content: h('div', { class: 'row' }, [
          form.row([form.field('Name', name), form.field('Type', type)]),
          form.row([bitsField, form.field('Comment', comment)]),
          form.field('Passphrase', passphrase, 'Leave empty for a key that connects without prompting.'),
          remember,
          h('p', {
            text: 'The private key is written to this app\u2019s data folder with owner-only permissions. Only its public half ever leaves the machine.',
          }),
        ]),
        buttons: [
          { label: 'Cancel', value: null },
          { label: 'Generate', value: 'create', primary: true },
        ],
        onSubmit: async () => {
          const created = await window.term.keys.create({
            name: name.value,
            type: type.value,
            bits: bits.value,
            comment: comment.value,
            passphrase: passphrase.value,
            savePassphrase: remember.input.checked,
          });
          return created;
        },
      })
      .then(async (created) => {
        if (!created) return;
        await reload();
        App.toast.ok(`Created ${created.name}`);
        details(state.keys.find((key) => key.id === created.id) || created);
      });
  }

  /* ---------- Import ---------- */

  /**
   * Entry point for adding a key that already exists. Nothing is ever pulled in
   * automatically - the user picks the file, or asks for a scan.
   */
  async function addExisting() {
    const choice = await App.modal.show({
      title: 'Add an existing key',
      iconName: 'key',
      content: h('div', { class: 'row' }, [
        h('p', {
          text: 'Point at a key file, or look through the usual places on this PC. Nothing is added until you choose it.',
        }),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Find keys on this PC', value: 'scan' },
        { label: 'Browse for a file', value: 'browse', primary: true },
      ],
    });

    if (choice === 'browse') return importKey();
    if (choice === 'scan') return scanForKeys();
    return undefined;
  }

  /** Explicit, user-triggered scan of ~/.ssh and PuTTY's saved sessions. */
  async function scanForKeys() {
    let found;
    try {
      found = await window.term.keys.scan();
    } catch (err) {
      App.toast.error(err.message);
      return;
    }

    if (!found.length) {
      App.toast.info('No new keys found in your .ssh folder or PuTTY sessions.');
      return;
    }

    const rows = found.map((key) => {
      const box = h('input', { type: 'checkbox' });
      const label = h('label', { class: 'check pick' }, [
        box,
        h('div', { class: 'pick__text' }, [
          h('div', { class: 'pick__name' }, [
            h('span', { text: key.name }),
            h('span', { class: 'tag', text: typeLabel(key) }),
            key.encrypted ? h('span', { class: 'tag tag--lock', text: 'Encrypted' }) : null,
          ]),
          h('div', { class: 'pick__path', text: key.path }),
        ]),
      ]);
      return { key, box, label };
    });

    const chosen = await App.modal.show({
      title: `Found ${found.length} key${found.length > 1 ? 's' : ''}`,
      iconName: 'key',
      wide: true,
      content: h('div', { class: 'row' }, [
        h('p', { text: 'Tick the ones you want to use. They stay where they are - nothing is copied or altered.' }),
        h('div', { class: 'pick__list' }, rows.map((row) => row.label)),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Add selected', value: 'add', primary: true },
      ],
      onSubmit: () => {
        const picked = rows.filter((row) => row.box.checked);
        if (!picked.length) throw new Error('Tick at least one key, or cancel.');
        return picked.map((row) => row.key);
      },
    });

    if (!chosen || !Array.isArray(chosen)) return;

    let added = 0;
    for (const key of chosen) {
      try {
        await window.term.keys.link({ filePath: key.path, name: key.name });
        added += 1;
      } catch (err) {
        App.toast.error(`${key.name}: ${err.message}`);
      }
    }

    if (added) {
      await reload();
      App.toast.ok(`Added ${added} key${added > 1 ? 's' : ''}`);
    }
  }

  async function importKey() {
    let filePath;
    try {
      filePath = await window.term.keys.pickFile();
    } catch (err) {
      App.toast.error(err.message);
      return;
    }
    if (!filePath) return;

    let passphrase = '';
    let probe;

    try {
      probe = await window.term.keys.probe(filePath, '');
      while (!probe.usable && probe.needsPassphrase) {
        const answer = await App.modal.prompt({
          title: 'Encrypted key',
          label: probe.wrongPassphrase
            ? 'That passphrase did not work. Try again.'
            : 'This key is encrypted. Enter its passphrase.',
          okLabel: 'Unlock',
        });
        if (!answer) return;
        passphrase = answer;
        probe = await window.term.keys.probe(filePath, passphrase);
      }
    } catch (err) {
      App.toast.error(err.message);
      return;
    }

    const name = form.input({ value: filePath.split(/[\/]/).pop() });
    const remember = form.check(
      state.info.secretsAvailable
        ? 'Remember the passphrase in the OS keychain'
        : 'Secret storage is unavailable on this system',
      state.info.secretsAvailable && Boolean(passphrase),
      { disabled: !state.info.secretsAvailable || !passphrase }
    );

    const copyIn = form.check('Copy the key into LuwanTerm', false);

    const result = await App.modal.show({
      title: 'Add key',
      iconName: 'key',
      wide: true,
      content: h('div', { class: 'row' }, [
        form.field('Name', name),
        h('dl', { class: 'kv' }, [
          h('dt', { text: 'File' }),
          h('dd', { text: filePath }),
          h('dt', { text: 'Type' }),
          h('dd', { text: probe.type }),
          h('dt', { text: 'Fingerprint' }),
          h('dd', { text: probe.fingerprint }),
        ]),
        passphrase ? remember : null,
        copyIn,
        h('p', {
          text: 'Leave the box unticked to keep using the file where it is, so you can add as many existing keys as you like without moving them.',
        }),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Add key', value: 'import', primary: true },
      ],
      onSubmit: async () => {
        const payload = {
          filePath,
          name: name.value,
          passphrase,
          savePassphrase: remember.input.checked,
        };
        // Unticked means "use it where it lives", which is the common case.
        return copyIn.input.checked
          ? window.term.keys.import(payload)
          : window.term.keys.link(payload);
      },
    });

    if (!result) return;
    await reload();
    App.toast.ok(`Added ${result.name}`);
  }

  /* ---------- Install on a server ---------- */

  async function deploy(key) {
    const ready = [...state.sessions.values()].filter((entry) => entry.info.status === 'ready');

    if (!ready.length) {
      App.toast.error('Connect to a host first, then install the key from that session.');
      return;
    }

    const picker = form.select(
      ready.map((entry) => ({
        value: entry.key,
        label: `${entry.host.username}@${entry.host.host} (${entry.info.name})`,
      })),
      { value: state.activeId && ready.some((e) => e.key === state.activeId) ? state.activeId : ready[0].key }
    );

    const chosen = await App.modal.show({
      title: 'Install public key',
      iconName: 'upload-cloud',
      content: h('div', { class: 'row' }, [
        form.field('Session', picker),
        h('p', {
          text: `Appends "${key.name}" to ~/.ssh/authorized_keys for the account you are logged in as, creating ~/.ssh with the permissions sshd requires. Running it twice is harmless.`,
        }),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Install', value: 'go', primary: true },
      ],
      onSubmit: () => picker.value,
    });
    if (!chosen) return;

    try {
      const result = await window.term.keys.deploy(chosen, key.id);
      App.toast.ok(
        result.added
          ? `Installed ${result.keyName} for ${result.account}`
          : `${result.keyName} was already authorised for ${result.account}`
      );
    } catch (err) {
      App.toast.error(err.message);
    }
  }

  App.keys = { reload, render, create, addExisting, importKey, scanForKeys, deploy, typeLabel };
})(window.App);
