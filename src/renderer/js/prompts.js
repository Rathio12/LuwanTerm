/* Interactive prompts the main process raises during a connection. */
(function (App) {
  'use strict';

  const { h } = App.dom;
  const { form } = App.modal;

  async function askSecret(payload) {
    const label = payload.secretKind === 'passphrase' ? 'Key passphrase' : 'Password';
    const input = form.input({ type: 'password', placeholder: label, autocomplete: 'off' });
    const remember = form.check(
      payload.canSave ? 'Remember in the OS keychain' : 'Secret storage is unavailable on this system',
      false,
      { disabled: !payload.canSave }
    );

    const value = await App.modal.show({
      title: `${label} required`,
      iconName: payload.secretKind === 'passphrase' ? 'key' : 'shield',
      persistent: true,
      content: h('div', { class: 'row' }, [
        h('p', {
          text: payload.keyName
            ? `Key "${payload.keyName}" for ${payload.username}@${payload.host}`
            : `${payload.username}@${payload.host} (${payload.hostName})`,
        }),
        form.field(label, input),
        remember,
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Connect', value: 'ok', primary: true },
      ],
      onSubmit: () => {
        if (!input.value) throw new Error(`${label} cannot be empty.`);
        return { value: input.value, save: remember.input.checked };
      },
    });

    return value && value.value ? value : null;
  }

  async function askHostKey(payload) {
    const changed = payload.status === 'changed';

    const details = h('dl', { class: 'kv' }, [
      h('dt', { text: 'Server' }),
      h('dd', { text: `${payload.host}:${payload.port}` }),
      h('dt', { text: 'Key type' }),
      h('dd', { text: payload.keyType }),
      h('dt', { text: 'Fingerprint' }),
      h('dd', { text: payload.fingerprint }),
    ]);

    const warning = changed
      ? h('div', { class: 'callout callout--danger' }, [
          h('strong', { text: 'The host key has changed since you last connected.' }),
          h('span', {
            text:
              'This happens after a legitimate server rebuild, but it is also what a machine-in-the-middle attack looks like. Only continue if you know why it changed.',
          }),
        ])
      : h('div', { class: 'callout' }, [
          h('strong', { text: 'This host has not been seen before.' }),
          h('span', { text: 'Compare the fingerprint with the one on the server before trusting it.' }),
        ]);

    const value = await App.modal.show({
      title: changed ? 'Host key changed' : 'Unknown host key',
      iconName: 'shield',
      tone: changed ? 'danger' : 'warn',
      persistent: true,
      content: h('div', { class: 'row' }, [warning, details]),
      buttons: [
        { label: 'Reject', value: null },
        {
          label: changed ? 'Trust the new key' : 'Trust and connect',
          value: 'trust',
          variant: changed ? 'danger' : 'primary',
          primary: !changed,
        },
      ],
    });

    return value === 'trust';
  }

  async function askKeyboard(payload) {
    const inputs = payload.prompts.map((label) => ({
      label,
      input: form.input({ type: /password|passcode|token|otp|code/i.test(label) ? 'password' : 'text' }),
    }));

    const value = await App.modal.show({
      title: payload.name || 'Server challenge',
      iconName: 'key',
      persistent: true,
      content: h('div', { class: 'row' }, [
        payload.instructions ? h('p', { text: payload.instructions }) : null,
        ...inputs.map((entry) => form.field(entry.label.replace(/:\s*$/, ''), entry.input)),
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Submit', value: 'ok', primary: true },
      ],
    });

    return value === 'ok' ? inputs.map((entry) => entry.input.value) : null;
  }

  const HANDLERS = { secret: askSecret, hostkey: askHostKey, keyboard: askKeyboard };

  function register() {
    window.term.ssh.onPrompt(async (payload) => {
      const handler = HANDLERS[payload.kind];
      let answer = null;
      if (handler) {
        try {
          answer = await handler(payload);
        } catch (err) {
          console.error('[prompt] failed:', err);
        }
      }
      window.term.ssh.respond(payload.requestId, answer).catch(() => {});
    });
  }

  App.prompts = { register };
})(window.App);
