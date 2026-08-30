/* Preferences dialog and the trusted host-key list. */
(function (App) {
  'use strict';

  const { h, iconButton } = App.dom;
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
        h('div', { class: 'field' }, [
          h('label', { text: 'Discord Rich Presence' }),
          fields.discordEnabled,
          fields.discordShowHost,
          h('span', {
            class: 'note',
            text: 'Shows a session count only, unless you tick the box above - anyone who can see your profile can see whatever it displays.',
          }),
        ]),
        h('div', { class: 'field' }, [
          h('label', { text: 'Trusted host keys' }),
          trusted.element,
        ]),
        h('p', {
          text: state.info.secretsAvailable
            ? 'Passwords and passphrases are encrypted by the operating system keychain.'
            : 'This system has no keychain available, so secrets are never written to disk and you are asked on every connect.',
        }),
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
        });
        return true;
      },
    });

    if (!result) return;
    for (const entry of state.sessions.values()) entry.term?.applySettings(state.settings);
    App.toast.ok('Settings saved');
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
