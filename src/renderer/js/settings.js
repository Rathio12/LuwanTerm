/* Preferences dialog and the trusted host-key list. */
(function (App) {
  'use strict';

  const { h, icon, iconButton } = App.dom;
  const { form } = App.modal;
  const state = App.state;

  const CURSORS = [
    { value: 'bar', label: 'Bar' },
    { value: 'block', label: 'Block' },
    { value: 'underline', label: 'Underline' },
  ];

  async function open() {
    const current = state.settings;

    const fields = {
      fontFamily: form.input({ value: current.fontFamily, class: 'input input--mono' }),
      fontSize: form.input({ type: 'number', min: '9', max: '28', value: current.fontSize }),
      cursorStyle: form.select(CURSORS, { value: current.cursorStyle }),
      scrollback: form.input({ type: 'number', min: '200', max: '200000', step: '500', value: current.scrollback }),
      cursorBlink: form.check('Blinking cursor', current.cursorBlink),
      copyOnSelect: form.check('Copy on select', current.copyOnSelect),
      confirmOnClose: form.check('Confirm before closing a live session', current.confirmOnClose),
      webgl: form.check('GPU accelerated rendering (needs a restart)', current.webgl),
      discordEnabled: form.check('Show LuwanTerm on your Discord profile', current.discordEnabled),
      discordShowHost: form.check('Include the host name in what Discord shows', current.discordShowHost),
    };

    const background = buildBackground(current);
    const updates = buildUpdates();
    const trusted = await loadKnownHosts();

    const result = await App.modal.show({
      title: 'Settings',
      iconName: 'cog',
      wide: true,
      content: h('div', { class: 'row' }, [
        form.row([
          form.field('Terminal font', fields.fontFamily),
          form.field('Size', fields.fontSize),
        ]),
        form.row([
          form.field('Cursor', fields.cursorStyle),
          form.field('Scrollback lines', fields.scrollback),
        ]),
        h('div', { class: 'row' }, [
          fields.cursorBlink,
          fields.copyOnSelect,
          fields.confirmOnClose,
          fields.webgl,
        ]),
        background.element,
        h('div', { class: 'field' }, [
          h('label', { text: 'Discord Rich Presence' }),
          fields.discordEnabled,
          fields.discordShowHost,
          h('span', {
            class: 'note',
            text: 'Shows a session count only, unless you tick the box above - anyone who can see your profile can see whatever it displays.',
          }),
        ]),
        updates.element,
        buildAbout(),
        h('div', { class: 'field' }, [
          h('label', { text: 'Trusted host keys' }),
          h('span', {
            class: 'note',
            text: state.info.secretsAvailable
              ? 'Passwords and passphrases are encrypted by the operating system keychain.'
              : 'This system has no keychain available, so secrets are never written to disk and you are asked on every connect.',
          }),
          trusted.element,
        ]),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Save', value: 'save', primary: true },
      ],
      onSubmit: async () => {
        state.settings = await window.term.settings.set({
          fontFamily: fields.fontFamily.value.trim() || undefined,
          fontSize: fields.fontSize.value,
          cursorStyle: fields.cursorStyle.value,
          scrollback: fields.scrollback.value,
          cursorBlink: fields.cursorBlink.input.checked,
          copyOnSelect: fields.copyOnSelect.input.checked,
          confirmOnClose: fields.confirmOnClose.input.checked,
          webgl: fields.webgl.input.checked,
          discordEnabled: fields.discordEnabled.input.checked,
          discordShowHost: fields.discordShowHost.input.checked,
          ...background.value(),
        });
        return true;
      },
    });

    if (updates.element.dispose) updates.element.dispose();

    if (!result) return;
    App.applyBackground();
    for (const entry of state.sessions.values()) entry.term?.applySettings(state.settings);
    App.toast.ok('Settings saved');
  }

  /** Picks a global background image, with opacity and blur to tame it. */
  function buildBackground(current) {
    let chosen = current.backgroundImage;

    const label = h('span', { class: 'note', text: chosen || 'No image chosen' });
    const opacity = h('input', {
      type: 'range', min: '0', max: '100', step: '1', value: current.backgroundOpacity,
    });
    const blur = h('input', {
      type: 'range', min: '0', max: '40', step: '1', value: current.backgroundBlur,
    });

    const choose = h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        try {
          const picked = await window.term.app.pickBackground();
          if (!picked) return;
          chosen = picked;
          label.textContent = picked;
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon('folder'), 'Choose image']);

    const clear = h('button', {
      class: 'btn btn--ghost',
      onclick: (event) => {
        event.preventDefault();
        chosen = '';
        label.textContent = 'No image chosen';
      },
    }, [icon('x'), 'Clear']);

    const element = h('div', { class: 'field' }, [
      h('label', { text: 'Background image' }),
      h('div', { class: 'about__links' }, [choose, clear]),
      label,
      form.row([form.field('Opacity', opacity), form.field('Blur', blur)]),
    ]);

    return {
      element,
      value: () => ({
        backgroundImage: chosen,
        backgroundOpacity: opacity.value,
        backgroundBlur: blur.value,
      }),
    };
  }

  const UPDATE_TEXT = {
    idle: 'Not checked yet.',
    checking: 'Checking for updates...',
    current: 'You are on the latest version.',
    downloading: 'Downloading update...',
    ready: 'Update downloaded. Restart to apply it.',
    'available-portable': 'A newer version exists. Portable builds cannot update themselves - download it again.',
    disabled: 'Updates are only checked in a packaged build.',
    error: 'Could not check for updates.',
  };

  /** Update status, with a manual check and a restart when one is waiting. */
  function buildUpdates() {
    const status = h('span', { class: 'note', text: UPDATE_TEXT.idle });
    const restart = h('button', {
      class: 'btn btn--primary',
      hidden: true,
      onclick: (event) => {
        event.preventDefault();
        window.term.updates.install().catch((err) => App.toast.error(err.message));
      },
    }, [icon('refresh'), 'Restart and update']);

    const describe = (value) => {
      const text = UPDATE_TEXT[value.status] || UPDATE_TEXT.idle;
      if (value.status === 'downloading' && value.percent) {
        status.textContent = `Downloading update ${value.version || ''} - ${value.percent}%`;
      } else if (value.status === 'error') {
        status.textContent = value.message || text;
      } else if (value.status === 'ready') {
        status.textContent = `Version ${value.version} downloaded. Restart to apply it.`;
      } else {
        status.textContent = text;
      }
      restart.hidden = value.status !== 'ready';
    };

    const check = h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        status.textContent = UPDATE_TEXT.checking;
        try {
          describe(await window.term.updates.check());
        } catch (err) {
          status.textContent = err.message;
        }
      },
    }, [icon('down'), 'Check for updates']);

    window.term.updates.state().then(describe).catch(() => {});
    const stop = window.term.updates.onState(describe);

    const element = h('div', { class: 'field' }, [
      h('label', { text: `Updates - you are running ${state.info.version}` }),
      h('div', { class: 'about__links' }, [check, restart]),
      status,
    ]);

    element.dispose = stop;
    return { element };
  }

  /** Version plus the places to report a bug or get involved. */
  function buildAbout() {
    const links = state.info.links || {};

    const button = (name, label, url) =>
      url
        ? h('button', {
            class: 'btn btn--ghost',
            onclick: (event) => {
              event.preventDefault();
              window.term.app.openExternal(url).catch((err) => App.toast.error(err.message));
            },
          }, [icon(name), label])
        : null;

    const buttons = [
      button('bug', 'Report a bug', links.issues),
      button('code', 'Source on GitHub', links.github),
      button('chat', 'Discord', links.discord),
    ].filter(Boolean);

    return h('div', { class: 'field' }, [
      h('label', { text: `About - LuwanTerm ${state.info.version}` }),
      h('div', { class: 'about__links' }, buttons),
      h('span', {
        class: 'note',
        text: 'Found something broken, or want to help? Both are welcome.',
      }),
    ]);
  }

  /** Small embedded list so a stale or rotated host key can be forgotten. */
  async function loadKnownHosts() {
    const element = h('div', { class: 'tn__list', style: 'max-height:170px;padding:0' });

    async function refresh() {
      const entries = await window.term.knownHosts.list();
      element.replaceChildren();

      if (!entries.length) {
        element.append(h('div', { class: 'hint', text: 'No host keys trusted yet.' }));
        return;
      }

      for (const entry of entries) {
        element.append(
          h('div', { class: 'tn__item' }, [
            h('div', {}, [
              h('div', { text: `${entry.host}:${entry.port}` }),
              h('div', { class: 'tn__route', text: `${entry.keyType} - ${entry.fingerprint}` }),
            ]),
            iconButton('trash', {
              title: 'Forget this key',
              className: 'iconbtn iconbtn--danger',
              onClick: async (event) => {
                event.preventDefault();
                await window.term.knownHosts.remove(entry.host, entry.port);
                refresh();
              },
            }),
          ])
        );
      }
    }

    await refresh();
    return { element, refresh };
  }

  App.settings = { open };
})(window.App);
