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

    try {
      state.settings = await window.term.settings.get();
    } catch {

    }
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

    const appearance = buildAppearance(current);
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
        buildFonts(current, fields.fontFamily),
        h('div', { class: 'row' }, [
          fields.cursorBlink,
          fields.copyOnSelect,
          fields.confirmOnClose,
          fields.webgl,
        ]),
        appearance.element,
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
          ...appearance.value(),
          ...background.value(),
        });
        return true;
      },
    });

    if (updates.element.dispose) updates.element.dispose();

    if (!result) {
      App.applyAccent(state.settings.accentColor);
      return;
    }
    App.applyAccent(state.settings.accentColor);
    App.applyBackground();
    for (const entry of state.sessions.values()) entry.term?.applySettings(state.settings);
    App.toast.ok('Settings saved');
  }

  let fontCatalogue = null;

  const SAMPLE = 'const ok = 0O1lI; ~$>_';

  function slider(label, attrs, unit) {
    const input = h('input', { type: 'range', ...attrs });
    const value = h('span', { class: 'slider__value', text: `${input.value}${unit}` });

    input.addEventListener('input', () => {
      value.textContent = `${input.value}${unit}`;
    });

    const element = h('div', { class: 'field' }, [
      h('div', { class: 'slider__head' }, [h('label', { text: label }), value]),
      input,
    ]);
    return { element, input };
  }

  function isInstalled(name, ctx) {
    const probe = 'mmmmmmmmmmlliWWW';
    return ['monospace', 'serif', 'sans-serif'].some((generic) => {
      ctx.font = `72px ${generic}`;
      const base = ctx.measureText(probe).width;
      ctx.font = `72px "${name}", ${generic}`;
      return ctx.measureText(probe).width !== base;
    });
  }

  async function systemMonoFonts() {
    if (typeof window.queryLocalFonts !== 'function') return [];
    try {
      const fonts = await window.queryLocalFonts();
      return [...new Set(fonts.map((font) => font.family))].filter((family) =>
        /\b(mono\w*|code|consol\w*|courier|terminal)\b/i.test(family)
      );
    } catch {
      return [];
    }
  }

  function primaryFamily(stack) {
    return String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  }

  function buildFonts(current, fontField) {
    const list = h('div', { class: 'fontpick' });
    const element = h('div', { class: 'field' }, [
      h('label', { text: 'Installed monospace fonts' }),
      list,
      h('span', { class: 'note', text: 'Click one to use it. The box above takes any font stack.' }),
    ]);

    const ctx = document.createElement('canvas').getContext('2d');

    const render = (names) => {
      list.replaceChildren();
      if (!names.length) {
        list.append(h('div', { class: 'hint', text: 'No known monospace fonts detected.' }));
        return;
      }
      for (const name of names) {
        const row = h('button', {
          class: 'fontpick__row',
          style: `font-family: "${name}", monospace`,
          onclick: (event) => {
            event.preventDefault();
            fontField.value = `${name}, monospace`;
            for (const other of list.children) other.classList.remove('is-on');
            row.classList.add('is-on');
          },
        }, [
          h('span', { class: 'fontpick__name', text: name }),
          h('span', { class: 'fontpick__sample', text: SAMPLE }),
        ]);
        if (primaryFamily(fontField.value) === name) row.classList.add('is-on');
        list.append(row);
      }
    };

    list.append(h('div', { class: 'hint', text: 'Looking for installed fonts...' }));

    (async () => {
      if (!fontCatalogue) {
        try {
          fontCatalogue = await window.term.app.fonts();
        } catch {
          fontCatalogue = [];
        }
      }

      const extra = await systemMonoFonts();
      const names = [...new Set([...fontCatalogue, ...extra])];
      const detected = names.filter((name) => isInstalled(name, ctx));
      detected.sort((a, b) => a.localeCompare(b));
      render(detected);
    })();

    return element;
  }

  const ACCENTS = ['#7c5cff', '#3ea8ff', '#22c58b', '#f2a33c', '#ff5c8a', '#ff5c72', '#c084fc'];

  function buildAppearance(current) {
    let accent = current.accentColor;

    const custom = h('input', { type: 'color', class: 'colorpick', value: accent });
    const swatches = h('div', { class: 'swatches' }, ACCENTS.map((value) =>
      h('button', {
        class: `swatch${value === accent ? ' is-on' : ''}`,
        style: `background:${value}`,
        title: value,
        onclick: (event) => {
          event.preventDefault();
          accent = value;
          custom.value = value;
          for (const node of swatches.children) node.classList.toggle('is-on', node.title === value);
          App.applyAccent(value);
        },
      })
    ));

    custom.addEventListener('input', () => {
      accent = custom.value;
      for (const node of swatches.children) node.classList.remove('is-on');
      App.applyAccent(accent);
    });

    const opacity = slider(
      'Terminal opacity',
      { min: '20', max: '100', step: '1', value: current.terminalOpacity },
      '%'
    );

    const element = h('div', { class: 'row row--2' }, [
      form.field('Accent colour', h('div', { class: 'about__links' }, [swatches, custom])),
      h('div', { class: 'row' }, [
        opacity.element,
        h('span', {
          class: 'note',
          text: 'Lower it to see your background through the terminal. Applies to sessions opened after saving.',
        }),
      ]),
    ]);

    return {
      element,
      value: () => ({ accentColor: accent, terminalOpacity: opacity.input.value }),
    };
  }

  function buildBackground(current) {
    let chosen = current.backgroundImage;

    const label = h('span', { class: 'note', text: chosen || 'No image chosen' });
    const opacity = slider('Opacity', { min: '0', max: '100', step: '1', value: current.backgroundOpacity }, '%');
    const blur = slider('Blur', { min: '0', max: '40', step: '1', value: current.backgroundBlur }, 'px');

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
      form.row([opacity.element, blur.element]),
    ]);

    return {
      element,
      value: () => ({
        backgroundImage: chosen,
        backgroundOpacity: opacity.input.value,
        backgroundBlur: blur.input.value,
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

    const beta = form.check('Include beta builds', state.settings.betaUpdates);
    const betaBox = beta.querySelector('input');
    betaBox.addEventListener('change', async () => {
      try {
        await window.term.settings.set({ betaUpdates: betaBox.checked });
        App.toast.info(betaBox.checked
          ? 'Beta builds are now offered. Check for updates to look for one.'
          : 'Back to stable builds only.');
      } catch (err) {
        betaBox.checked = !betaBox.checked;
        App.toast.error(err.message);
      }
    });

    const element = h('div', { class: 'field' }, [
      h('label', { text: `Updates - you are running ${state.info.version}` }),
      h('div', { class: 'about__links' }, [check, restart]),
      status,
      beta,
      h('span', {
        class: 'note',
        text: 'Beta builds go out before they are finished. They get the same tests as a '
          + 'release, but they are the version things break in - and going back means '
          + 'installing an older build by hand. Leave this off unless you want to help find '
          + 'what is broken.',
      }),
    ]);

    element.dispose = stop;
    return { element };
  }

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
      button('globe', 'View page', links.website),
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
