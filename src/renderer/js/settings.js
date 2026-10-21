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

  const WEIGHTS = [
    { value: '300', label: 'Light' },
    { value: 'normal', label: 'Regular' },
    { value: '500', label: 'Medium' },
    { value: '600', label: 'Semibold' },
    { value: 'bold', label: 'Bold' },
  ];

  const RIGHT_CLICK = [
    { value: 'paste', label: 'Paste' },
    { value: 'copy-paste', label: 'Copy a selection, otherwise paste' },
    { value: 'none', label: 'Do nothing' },
  ];

  const BELLS = [
    { value: 'none', label: 'Silent' },
    { value: 'flash', label: 'Flash the terminal' },
  ];

  const EFFECTS = [
    { value: 'none', label: 'None' },
    { value: 'constellation', label: 'Constellation - drifting nodes and links' },
    { value: 'flow', label: 'Flow - particles drifting on a current' },
    { value: 'rain', label: 'Digital rain - falling glyphs' },
    { value: 'dots', label: 'Dot matrix - a rippling grid of light' },
    { value: 'horizon', label: 'Horizon - neon grid under a setting sun' },
  ];

  const EFFECT_NAMES = Object.fromEntries(EFFECTS.map((entry) => [entry.value, entry.label.split(' - ')[0]]));

  const GUIDE = '/blob/main/guides/themes.md';

  const MOUSE_FORCES = [
    { value: 'none', label: 'Leave them be' },
    { value: 'repel', label: 'Push them away' },
    { value: 'attract', label: 'Pull them in' },
  ];

  const CORNER_STYLES = [
    { value: 'square', label: 'Square' },
    { value: 'subtle', label: 'Subtle' },
    { value: 'default', label: 'Rounded' },
    { value: 'round', label: 'Extra round' },
  ];

  const RESETTABLE = [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'terminalTheme',
    'terminalPadding', 'scrollSensitivity', 'ctrlWheelZoom', 'rightClick', 'bell',
    'cursorBlink', 'cursorStyle', 'scrollback', 'copyOnSelect', 'confirmOnClose', 'webgl',
    'backgroundImage', 'backgroundOpacity', 'backgroundBlur', 'backgroundEffect',
    'effectDensity', 'effectSpeed', 'effectLinks', 'effectGrid', 'effectGlow', 'effectAccent', 'effectMouse',
    'effectMouseForce', 'effectNodeGlow', 'effectPulse', 'effectNodeSize', 'effectLineWidth',
    'effectLineOpacity', 'effectGridSize', 'effectColor', 'effectOpacity', 'terminalOpacity', 'accentColor',
    'uiScale', 'uiFontFamily', 'uiCorners', 'sidebarWidth', 'reduceMotion',
    'idleLockMinutes', 'idleDisconnectMinutes', 'recentSessions', 'startClock', 'clockSeconds', 'clock12h',
    'discordEnabled', 'discordLabel', 'discordTimer', 'discordShowIdle', 'discordShowCount', 'discordClearOnAway',
  ];

  function applyStored() {
    App.applyAccent(state.settings.accentColor);
    App.applyInterface(state.settings);
    App.effect.apply(state.settings);
    App.clock.apply(state.settings);
    App.applyBackground();
    for (const entry of state.sessions.values()) entry.term?.applySettings(state.settings);
  }

  function section(id, title, children) {
    return h('section', { class: 'setsec', id: `settings-${id}` }, [
      h('h3', { class: 'setsec__title', text: title }),
      ...children,
    ]);
  }

  let showing = false;

  async function open(focus, overrides) {
    if (showing) return;
    showing = true;
    let next = { focus, overrides };
    try {
      while (next) next = await show(next.focus, next.overrides);
    } finally {
      showing = false;
    }
  }

  async function show(focus, overrides) {

    try {
      state.settings = await window.term.settings.get();
    } catch {

    }
    const current = overrides ? { ...state.settings, ...overrides } : state.settings;

    let info = state.info;
    try {
      info = await window.term.app.info();
      state.info = info;
    } catch {
      info = state.info;
    }
    const discordInfo = (info && info.discord) || {};

    const fields = {
      fontFamily: form.input({ value: current.fontFamily, class: 'input input--mono' }),
      fontSize: form.input({ type: 'number', min: '9', max: '28', value: current.fontSize }),
      fontWeight: form.select(WEIGHTS, { value: current.fontWeight }),
      cursorStyle: form.select(CURSORS, { value: current.cursorStyle }),
      scrollback: form.input({ type: 'number', min: '200', max: '200000', step: '500', value: current.scrollback }),
      rightClick: form.select(RIGHT_CLICK, { value: current.rightClick }),
      bell: form.select(BELLS, { value: current.bell }),
      uiFontFamily: form.input({ value: current.uiFontFamily, placeholder: 'Inter, Segoe UI (default)' }),
      uiCorners: form.select(CORNER_STYLES, { value: current.uiCorners }),
      backgroundEffect: form.select(EFFECTS, { value: current.backgroundEffect }),
      effectGrid: form.check('Grid in the corner', current.effectGrid),
      effectGlow: form.check('Corner glow', current.effectGlow),
      effectAccent: form.check('Use my accent colour', current.effectAccent),
      effectMouse: form.check('Reach for the mouse pointer', current.effectMouse),
      effectPulse: form.check('Twinkle', current.effectPulse),
      effectMouseForce: form.select(MOUSE_FORCES, { value: current.effectMouseForce }),
      effectColor: h('input', { type: 'color', class: 'colorpick', value: current.effectColor }),
      cursorBlink: form.check('Blinking cursor', current.cursorBlink),
      copyOnSelect: form.check('Copy on select', current.copyOnSelect),
      ctrlWheelZoom: form.check('Ctrl + mouse wheel zooms the terminal', current.ctrlWheelZoom),
      confirmOnClose: form.check('Confirm before closing a live session', current.confirmOnClose),
      recentSessions: form.check('Show recent sessions on the start screen', current.recentSessions),
      startClock: form.check('Show a clock on the start screen', current.startClock),
      clockSeconds: form.check('With seconds', current.clockSeconds),
      clock12h: form.check('12-hour time (AM / PM)', current.clock12h),
      reduceMotion: form.check('Reduce motion - no fades or slides', current.reduceMotion),
      idleLockMinutes: form.input({ type: 'number', min: '0', max: '240', value: current.idleLockMinutes }),
      idleDisconnectMinutes: form.input({ type: 'number', min: '0', max: '1440', value: current.idleDisconnectMinutes }),
      webgl: form.check('GPU accelerated rendering (needs a restart)', current.webgl),
      discordEnabled: form.check('Show Luwan Shell on your Discord profile', current.discordEnabled),
      discordLabel: form.select(
        [
          { value: 'provider', label: 'Provider' },
          { value: 'name', label: 'Profile name' },
          { value: 'none', label: 'Nothing' },
        ],
        { value: current.discordLabel }
      ),
      discordTimer: form.check('Show a timer', current.discordTimer),
      discordShowIdle: form.check('Show "Idle" while no session is open', current.discordShowIdle),
      discordShowCount: form.check('Show how many sessions are open', current.discordShowCount),
      discordClearOnAway: form.check('Hide it while the away screen is up', current.discordClearOnAway),
    };

    const sliders = {
      lineHeight: slider('Line height', { min: '100', max: '200', step: '5', value: current.lineHeight }, '%'),
      letterSpacing: slider('Letter spacing', { min: '0', max: '6', step: '1', value: current.letterSpacing }, 'px'),
      terminalPadding: slider('Padding', { min: '0', max: '40', step: '1', value: current.terminalPadding }, 'px'),
      scrollSensitivity: slider('Scroll speed', { min: '1', max: '10', step: '1', value: current.scrollSensitivity }, 'x'),
      uiScale: slider('Interface scale', { min: '75', max: '150', step: '5', value: current.uiScale }, '%'),
      effectDensity: slider('Density', { min: '10', max: '220', step: '5', value: current.effectDensity }, ''),
      effectSpeed: slider('Speed', { min: '0', max: '100', step: '1', value: current.effectSpeed }, '%'),
      effectNodeGlow: slider('Glow', { min: '0', max: '100', step: '1', value: current.effectNodeGlow }, '%'),
      effectNodeSize: slider('Size', { min: '50', max: '250', step: '5', value: current.effectNodeSize }, '%'),
      effectLineWidth: slider('Line width', { min: '3', max: '20', step: '1', value: current.effectLineWidth }, ''),
      effectLineOpacity: slider('Line opacity', { min: '0', max: '100', step: '1', value: current.effectLineOpacity }, '%'),
      effectGridSize: slider('Grid size', { min: '24', max: '160', step: '4', value: current.effectGridSize }, 'px'),
      effectOpacity: slider('Effect opacity', { min: '10', max: '100', step: '1', value: current.effectOpacity }, '%'),
      effectLinks: slider('Link distance', { min: '60', max: '240', step: '5', value: current.effectLinks }, 'px'),
      sidebarWidth: slider('Sidebar width', { min: '200', max: '440', step: '4', value: current.sidebarWidth }, 'px'),
    };

    const appearance = buildAppearance(current);
    const background = buildBackground(current);
    const themes = buildThemes(current);
    const updates = buildUpdates();
    const pluginList = buildPlugins();
    const trusted = await loadKnownHosts();
    const labelNote = h('span', { class: 'note', hidden: true });
    const syncLabelNote = () => {
      const named = fields.discordLabel.value === 'name';
      labelNote.hidden = !named;
      if (named) labelNote.textContent = 'Profile names will be visible on your Discord profile.';
    };
    fields.discordLabel.addEventListener('change', syncLabelNote);
    syncLabelNote();

    const discordStatus = h('span', { class: 'note' });
    const syncDiscordStatus = () => {
      const sessions = Number(discordInfo.sessions) || 0;
      let text;
      if (!fields.discordEnabled.input.checked) {
        text = 'Rich Presence is off.';
      } else if (!discordInfo.connected) {
        text = 'Not connected to Discord. Discord has to be running for this to switch on.';
      } else if (!sessions) {
        text = fields.discordShowIdle.input.checked
          ? 'Connected to Discord. Showing Luwan Shell as idle.'
          : 'Connected to Discord. Nothing shows until a session is connected.';
      } else {
        text = `Connected to Discord with ${sessions} session${sessions === 1 ? '' : 's'} open.`;
      }
      discordStatus.textContent = text;
    };
    fields.discordEnabled.input.addEventListener('change', syncDiscordStatus);
    fields.discordShowIdle.input.addEventListener('change', syncDiscordStatus);
    syncDiscordStatus();

    const collect = () => ({
      fontFamily: fields.fontFamily.value.trim() || undefined,
      fontSize: fields.fontSize.value,
      fontWeight: fields.fontWeight.value,
      lineHeight: sliders.lineHeight.input.value,
      letterSpacing: sliders.letterSpacing.input.value,
      terminalPadding: sliders.terminalPadding.input.value,
      scrollSensitivity: sliders.scrollSensitivity.input.value,
      terminalTheme: themes.value(),
      rightClick: fields.rightClick.value,
      bell: fields.bell.value,
      uiScale: sliders.uiScale.input.value,
      sidebarWidth: sliders.sidebarWidth.input.value,
      uiFontFamily: fields.uiFontFamily.value.trim(),
      uiCorners: fields.uiCorners.value,
      backgroundEffect: fields.backgroundEffect.value,
      effectDensity: sliders.effectDensity.input.value,
      effectSpeed: sliders.effectSpeed.input.value,
      effectLinks: sliders.effectLinks.input.value,
      effectGrid: fields.effectGrid.input.checked,
      effectGlow: fields.effectGlow.input.checked,
      effectAccent: fields.effectAccent.input.checked,
      effectMouse: fields.effectMouse.input.checked,
      effectMouseForce: fields.effectMouseForce.value,
      effectNodeGlow: sliders.effectNodeGlow.input.value,
      effectPulse: fields.effectPulse.input.checked,
      effectNodeSize: sliders.effectNodeSize.input.value,
      effectLineWidth: sliders.effectLineWidth.input.value,
      effectLineOpacity: sliders.effectLineOpacity.input.value,
      effectGridSize: sliders.effectGridSize.input.value,
      effectOpacity: sliders.effectOpacity.input.value,
      effectColor: fields.effectColor.value,
      reduceMotion: fields.reduceMotion.input.checked,
      ctrlWheelZoom: fields.ctrlWheelZoom.input.checked,
      idleLockMinutes: fields.idleLockMinutes.value,
      idleDisconnectMinutes: fields.idleDisconnectMinutes.value,
      cursorStyle: fields.cursorStyle.value,
      scrollback: fields.scrollback.value,
      cursorBlink: fields.cursorBlink.input.checked,
      copyOnSelect: fields.copyOnSelect.input.checked,
      confirmOnClose: fields.confirmOnClose.input.checked,
      recentSessions: fields.recentSessions.input.checked,
      startClock: fields.startClock.input.checked,
      clockSeconds: fields.clockSeconds.input.checked,
      clock12h: fields.clock12h.input.checked,
      webgl: fields.webgl.input.checked,
      discordEnabled: fields.discordEnabled.input.checked,
      discordLabel: fields.discordLabel.value,
      discordTimer: fields.discordTimer.input.checked,
      discordShowIdle: fields.discordShowIdle.input.checked,
      discordShowCount: fields.discordShowCount.input.checked,
      discordClearOnAway: fields.discordClearOnAway.input.checked,
      ...appearance.value(),
      ...background.value(),
    });

    const draft = () => {
      const next = { ...state.settings };
      for (const [key, value] of Object.entries(collect())) {
        if (value === undefined) continue;
        next[key] = typeof state.settings[key] === 'number' ? Number(value) : value;
      }
      return next;
    };

    const preview = App.dom.debounce(() => {
      const next = draft();
      App.applyAccent(next.accentColor);
      App.applyInterface(next);
      App.effect.apply(next);
      App.clock.apply(next);
      syncEffect();
      for (const entry of state.sessions.values()) entry.term?.applySettings(next);
    }, 90);
    themes.onChange(preview);

    const mouseForce = form.field('Mouse', fields.effectMouseForce);
    const only = (element, effects) => {
      element.dataset.only = effects;
      return element;
    };
    only(sliders.effectLinks.element, 'constellation');
    only(mouseForce, 'constellation');
    only(sliders.effectLineOpacity.element, 'constellation flow');
    only(sliders.effectLineWidth.element, 'constellation flow horizon');
    only(fields.effectPulse, 'constellation dots');
    only(fields.effectMouse, 'constellation flow dots horizon');

    const effectOptions = h('div', { class: 'row' }, [
      form.row([sliders.effectDensity.element, sliders.effectSpeed.element]),
      form.row([sliders.effectNodeGlow.element, sliders.effectNodeSize.element]),
      form.row([sliders.effectLinks.element, sliders.effectLineWidth.element]),
      form.row([sliders.effectLineOpacity.element, sliders.effectOpacity.element]),
      form.row([sliders.effectGridSize.element, h('div')]),
      form.row([
        mouseForce,
        form.field('Colour when not using the accent', fields.effectColor),
      ]),
      h('div', { class: 'row row--2' }, [
        fields.effectPulse, fields.effectGrid, fields.effectGlow, fields.effectAccent, fields.effectMouse,
      ]),
      h('span', {
        class: 'note',
        text: 'It draws behind everything and pauses while the window is hidden. With Reduce motion on it holds still.',
      }),
    ]);
    const syncEffect = () => {
      const chosen = fields.backgroundEffect.value;
      effectOptions.hidden = chosen === 'none';
      for (const element of effectOptions.querySelectorAll('[data-only]')) {
        element.hidden = !element.dataset.only.split(' ').includes(chosen);
      }
    };
    syncEffect();

    let reopen = null;
    const close = () => content.closest('.modal')?.querySelector('.modal__head .iconbtn')?.click();
    const presets = buildPresets({
      preview: (theme) => {
        reopen = { focus: 'themes', overrides: theme.settings, name: theme.name };
        close();
      },
      look: () => draft(),
    });
    const restore = h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        const confirmed = await App.modal.confirm({
          title: 'Restore defaults',
          message: 'Put every setting on this page back to how Luwan Shell ships? Your hosts, '
            + 'keys, snippets, plugins and update channel are not touched.',
          confirmLabel: 'Restore',
        });
        if (!confirmed) return;
        try {
          state.settings = await window.term.settings.reset(RESETTABLE);
          reopen = { restored: true };
          close();
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon('refresh'), 'Restore defaults']);

    const sections = [
      section('themes', 'Themes', [presets.element]),
      section('terminal', 'Terminal', [
        form.row([
          form.field('Terminal font', fields.fontFamily),
          form.field('Size', fields.fontSize),
        ]),
        buildFonts(current, fields.fontFamily),
        form.row([
          form.field('Font weight', fields.fontWeight),
          sliders.lineHeight.element,
        ]),
        form.row([sliders.letterSpacing.element, sliders.terminalPadding.element]),
        themes.element,
        form.row([
          form.field('Cursor', fields.cursorStyle),
          form.field('Scrollback lines', fields.scrollback),
        ]),
        form.row([sliders.scrollSensitivity.element, form.field('Bell', fields.bell)]),
        h('div', { class: 'row' }, [fields.cursorBlink, fields.webgl]),
      ]),
      section('interface', 'Interface', [
        appearance.element,
        form.row([sliders.uiScale.element, sliders.sidebarWidth.element]),
        form.row([
          form.field('Interface font', fields.uiFontFamily),
          form.field('Corners', fields.uiCorners),
        ]),
        fields.reduceMotion,
      ]),
      section('background', 'Background', [
        form.field('Animated background', fields.backgroundEffect),
        effectOptions,
        background.element,
      ]),
      section('behaviour', 'Behaviour', [
        form.row([form.field('Right click in the terminal', fields.rightClick), h('div')]),
        h('div', { class: 'row' }, [fields.copyOnSelect, fields.ctrlWheelZoom, fields.confirmOnClose, fields.recentSessions]),
        h('div', { class: 'row row--3' }, [fields.startClock, fields.clockSeconds, fields.clock12h]),
        form.row([
          form.field('Away screen after (minutes)', fields.idleLockMinutes),
          form.field('Close idle sessions after (minutes)', fields.idleDisconnectMinutes),
        ]),
        h('span', {
          class: 'note',
          text: 'The away screen hides what is on your terminal behind your background image '
            + 'when you stop touching the keyboard. It is a curtain, not a lock - it asks for '
            + 'no password. Closing idle sessions counts a session idle when nothing has been '
            + 'sent or received, so a command that runs silently for that long is closed too. '
            + 'Zero turns either off.',
        }),
      ]),
      section('discord', 'Discord', [
        h('div', { class: 'field' }, [
          h('label', { text: 'Discord Rich Presence' }),
          fields.discordEnabled,
          discordStatus,
          form.field('What Discord shows', fields.discordLabel),
          fields.discordTimer,
          fields.discordShowIdle,
          fields.discordShowCount,
          fields.discordClearOnAway,
          h('span', {
            class: 'note',
            text: 'Addresses, user names, ports, paths and commands are never sent - only the '
              + 'activity type, an optional label for a host you have switched on in its own '
              + 'settings, and a session count if you tick it. A host only appears at all when '
              + 'you turn on Show in Discord on that host.',
          }),
          labelNote,
        ]),
      ]),
      section('plugins', 'Plugins', [pluginList.element]),
      section('about', 'Updates and about', [updates.element, buildAbout()]),
      section('security', 'Security', [
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
      section('reset', 'Start over', [
        h('div', { class: 'about__links' }, [restore]),
        h('span', {
          class: 'note',
          text: 'Changes on this page preview as you make them. Cancel undoes them; Save keeps them.',
        }),
      ]),
    ];

    const nav = h('nav', { class: 'setnav' }, sections.map((node) =>
      h('button', {
        class: 'setnav__item',
        text: node.querySelector('.setsec__title').textContent,
        onclick: (event) => {
          event.preventDefault();
          node.scrollIntoView({ block: 'start', behavior: state.settings.reduceMotion ? 'auto' : 'smooth' });
        },
      })
    ));

    const content = h('div', { class: 'row' }, [nav, ...sections]);
    content.addEventListener('input', preview);
    content.addEventListener('change', preview);

    const shown = App.modal.show({
      title: 'Settings',
      iconName: 'cog',
      wide: true,
      content,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Save', value: 'save', primary: true },
      ],
      onSubmit: async () => {
        state.settings = await window.term.settings.set(collect());
        return true;
      },
    });

    if (focus === 'themes') {
      requestAnimationFrame(() => sections[0].scrollIntoView({ block: 'start' }));
    }
    if (focus === 'plugins') {
      requestAnimationFrame(() => pluginList.element.scrollIntoView({ block: 'start' }));
    }
    if (overrides) {
      preview();
      App.applyBackground({
        image: current.backgroundImage,
        opacity: current.backgroundOpacity,
        blur: current.backgroundBlur,
      });
    }

    const result = await shown;

    if (updates.element.dispose) updates.element.dispose();

    applyStored();
    App.afk?.apply(state.settings);
    App.recent?.refresh();

    if (reopen && reopen.restored) {
      App.toast.ok('Defaults restored');
      return {};
    }
    if (reopen) {
      App.toast.info(`Previewing ${reopen.name}. Save to keep it, Cancel to go back.`);
      return { focus: reopen.focus, overrides: reopen.overrides };
    }
    if (result) App.toast.ok('Settings saved');
    return null;
  }

  function buildPresets({ preview, look }) {
    const grid = h('div', { class: 'presets' });
    const status = h('span', { class: 'note', text: 'Looking for themes...' });
    const schemes = App.terminal.themes;

    function card(theme) {
      const values = theme.settings;
      const scheme = schemes[values.terminalTheme] || schemes.luwan;
      const effect = values.backgroundEffect && values.backgroundEffect !== 'none'
        ? EFFECT_NAMES[values.backgroundEffect]
        : 'Still';
      const remove = theme.source === 'yours'
        ? iconButton('trash', {
            title: 'Delete this theme',
            className: 'iconbtn iconbtn--danger preset__remove',
            onClick: async (event) => {
              event.preventDefault();
              event.stopPropagation();
              const confirmed = await App.modal.confirm({
                title: 'Delete theme',
                message: `Delete ${theme.name}? Its file is removed from your themes folder.`,
                confirmLabel: 'Delete',
              });
              if (!confirmed) return;
              try {
                await window.term.themes.remove(theme.id);
                refresh();
              } catch (err) {
                App.toast.error(err.message);
              }
            },
          })
        : null;

      return h('button', {
        class: 'preset',
        title: theme.description || theme.name,
        dataset: { theme: theme.id },
        onclick: (event) => {
          event.preventDefault();
          preview(theme);
        },
      }, [
        h('span', { class: 'preset__swatch', style: `background:${scheme.background}` }, [
          h('i', { style: `background:${values.accentColor}` }),
          h('i', { style: `background:${scheme.colours.green}` }),
          h('i', { style: `background:${scheme.colours.blue}` }),
          h('i', { style: `background:${scheme.colours.magenta}` }),
        ]),
        h('span', { class: 'preset__name', text: theme.name }),
        h('span', { class: 'preset__meta', text: [scheme.label, effect, theme.source === 'yours' ? 'Yours' : ''].filter(Boolean).join(' · ') }),
        remove,
      ]);
    }

    async function refresh() {
      let listing;
      try {
        listing = await window.term.themes.list();
      } catch (err) {
        status.textContent = err.message;
        return;
      }
      grid.replaceChildren(...listing.themes.map(card));
      for (const entry of listing.broken) {
        grid.append(h('div', { class: 'preset preset--broken' }, [
          h('span', { class: 'preset__name', text: entry.file }),
          h('span', { class: 'preset__meta', text: entry.problems.join('; ') }),
        ]));
      }
      status.textContent = `Your own themes live in ${listing.folder}`;
    }

    const button = (name, label, run) => h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        try {
          await run();
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon(name), label]);

    const actions = h('div', { class: 'about__links' }, [
      button('download', 'Save current look as a theme', async () => {
        const name = await App.modal.prompt({ title: 'Save as a theme', label: 'Theme name', placeholder: 'My night setup' });
        if (!name) return;
        const saved = await window.term.themes.save({ name, look: look() });
        App.toast.ok(`Saved as ${saved.file}`);
        refresh();
      }),
      button('plus', 'Add from file', async () => {
        const added = await window.term.themes.install();
        if (!added) return;
        App.toast.ok(`${added.name} added`);
        refresh();
      }),
      button('folder', 'Open folder', () => window.term.themes.openFolder()),
      button('code', 'How to make one', () => {
        const base = (state.info.links || {}).github;
        if (base) return window.term.app.openExternal(`${base}${GUIDE}`);
        return null;
      }),
    ]);

    refresh();

    return {
      element: h('div', { class: 'field' }, [
        h('span', {
          class: 'note',
          text: 'A theme sets the colours, accent, corners and background in one go. Click one to '
            + 'preview it - nothing is kept until you press Save.',
        }),
        grid,
        actions,
        status,
      ]),
      refresh,
    };
  }

  function buildThemes(current) {
    const themes = App.terminal.themes;
    let chosen = themes[current.terminalTheme] ? current.terminalTheme : 'luwan';
    let listener = () => {};

    const grid = h('div', { class: 'themes' });
    for (const [id, theme] of Object.entries(themes)) {
      const c = theme.colours;
      const card = h('button', {
        class: `themecard${id === chosen ? ' is-on' : ''}`,
        title: theme.label,
        dataset: { theme: id },
        style: `background:${theme.background};color:${theme.foreground}`,
        onclick: (event) => {
          event.preventDefault();
          chosen = id;
          for (const other of grid.children) other.classList.toggle('is-on', other === card);
          listener();
        },
      }, [
        h('span', { class: 'themecard__name', text: theme.label }),
        h('span', { class: 'themecard__line' }, [
          h('span', { style: `color:${c.green}`, text: 'root@vps' }),
          h('span', { text: ':' }),
          h('span', { style: `color:${c.blue}`, text: '~' }),
          h('span', { text: '$ ls' }),
        ]),
        h('span', { class: 'themecard__dots' },
          ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((name) =>
            h('i', { style: `background:${c[name]}` }))),
      ]);
      grid.append(card);
    }

    return {
      element: h('div', { class: 'field' }, [
        h('label', { text: 'Colour scheme' }),
        grid,
        h('span', { class: 'note', text: 'Luwan follows your accent colour for the cursor and selection.' }),
      ]),
      value: () => chosen,
      onChange: (fn) => { listener = fn; },
    };
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

    // Paint straight away. Choosing a background you cannot see until you press
    // Save is guesswork, and the accent colour has always worked this way.
    const preview = () => App.applyBackground({
      image: chosen,
      opacity: opacity.input.value,
      blur: blur.input.value,
    });

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
          preview();
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
        preview();
      },
    }, [icon('x'), 'Clear']);

    for (const control of [opacity.input, blur.input]) {
      control.addEventListener('input', preview);
    }

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
    available: 'An update is available.',
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
      if (value.status === 'available') {
        status.textContent = `Version ${value.version} is available.`;
      }
      download.hidden = value.status !== 'available';
      restart.hidden = value.status !== 'ready';
    };

    const download = h('button', {
      class: 'btn btn--primary',
      hidden: true,
      onclick: (event) => {
        event.preventDefault();
        status.textContent = 'Downloading...';
        window.term.updates.download().catch((err) => {
          status.textContent = err.message;
        });
      },
    }, [icon('download'), 'Download it']);

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
      // Ask before turning it on, not after a beta has installed itself.
      if (betaBox.checked && !(await App.betaNotice.confirmOptIn())) {
        betaBox.checked = false;
        return;
      }

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
      h('div', { class: 'about__links' }, [check, download, restart]),
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

  /**
   * Installed plugins, with the command each one runs printed beside it.
   *
   * The command is not hidden behind a details toggle on purpose: a plugin runs
   * on your servers, and the only honest way to offer that is to show what it
   * runs before you switch it on. Switching one on saves immediately - a panel
   * you enabled and a Cancel that silently took it away again would be worse.
   */
  function buildPlugins() {
    const list = h('div', { class: 'plugset__list' });
    const status = h('span', { class: 'note', text: 'Looking for plugins...' });

    async function toggle(plugin, on) {
      try {
        await window.term.plugins.enable(plugin.id, on);
        state.emit('plugins:changed');
      } catch (err) {
        App.toast.error(err.message);
        refresh();
      }
    }

    async function forget(entry) {
      const confirmed = await App.modal.confirm({
        title: 'Remove plugin',
        message: `Delete ${entry.name || entry.file}? The file is removed from the plugins folder.`,
        confirmLabel: 'Delete',
      });
      if (!confirmed) return;

      try {
        await window.term.plugins.remove(entry.id);
        state.emit('plugins:changed');
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    function row(entry, { enabled = false, problem = '' } = {}) {
      const box = problem
        ? null
        : form.check('', enabled, { title: `Show ${entry.name} in the Plugins panel` });
      if (box) box.input.addEventListener('change', () => toggle(entry, box.input.checked));

      return h('div', { class: `plugset__item${problem ? ' plugset__item--broken' : ''}` }, [
        box || h('span', { class: 'plugset__mark' }, [icon('bug')]),
        h('div', { class: 'plugset__text' }, [
          h('div', { class: 'plugset__name', text: entry.name || entry.file }),
          h('div', {
            class: problem ? 'plugset__problem' : 'plugset__command',
            text: problem || entry.command,
          }),
          entry.refreshSeconds
            ? h('div', { class: 'plugset__every', text: `Runs again every ${entry.refreshSeconds}s while the panel is open` })
            : null,
        ]),
        iconButton('trash', {
          title: 'Delete this plugin',
          className: 'iconbtn iconbtn--danger',
          onClick: (event) => {
            event.preventDefault();
            forget(entry);
          },
        }),
      ]);
    }

    async function refresh() {
      let listing;
      try {
        listing = await window.term.plugins.list();
      } catch (err) {
        status.textContent = err.message;
        return;
      }

      list.replaceChildren();

      for (const plugin of listing.plugins) {
        list.append(row(plugin, { enabled: listing.enabled.includes(plugin.id) }));
      }
      for (const entry of listing.broken) {
        list.append(row(entry, { problem: `${entry.file}: ${entry.problems.join('; ')}` }));
      }

      if (!listing.plugins.length && !listing.broken.length) {
        list.append(h('div', { class: 'hint', text: 'Nothing installed. Add a manifest, or drop one in the folder yourself.' }));
      }

      status.textContent = listing.allowed
        ? listing.folder
        : 'Plugins are disabled by policy on this machine, so none of these will run.';

      let missing = [];
      try {
        missing = (await window.term.plugins.starters()).filter((starter) => !starter.installed);
      } catch {
        missing = [];
      }
      pack.hidden = missing.length === 0;
      packLabel.textContent = `Add ${missing.length} ready-made plugins`;
    }

    const packLabel = h('span', { text: 'Add the starter pack' });

    const pack = h('button', {
      class: 'btn btn--ghost',
      hidden: true,
      onclick: async (event) => {
        event.preventDefault();
        try {
          const added = await window.term.plugins.addStarters();
          App.toast.ok(added.length
            ? `${added.length} plugins added. Tick the ones you want.`
            : 'They are all here already.');
          state.emit('plugins:changed');
          refresh();
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon('plus'), packLabel]);

    const add = h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        try {
          const installed = await window.term.plugins.install();
          if (!installed) return;
          App.toast.ok(`${installed.name} added. Switch it on to see it.`);
          state.emit('plugins:changed');
          refresh();
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon('download'), 'Add from file']);

    const folder = h('button', {
      class: 'btn btn--ghost',
      onclick: async (event) => {
        event.preventDefault();
        try {
          await window.term.plugins.openFolder();
        } catch (err) {
          App.toast.error(err.message);
        }
      },
    }, [icon('folder'), 'Open folder']);

    const reload = h('button', {
      class: 'btn btn--ghost',
      onclick: (event) => {
        event.preventDefault();
        refresh();
      },
    }, [icon('refresh'), 'Reload']);

    const element = h('div', { class: 'field' }, [
      h('label', { text: 'Plugins' }),
      h('span', {
        class: 'note',
        text: 'A plugin is a description of a panel, not code: a name, a command, and the '
          + 'shape of its output. Luwan Shell runs the command on the server you are connected '
          + 'to and draws the result as a table. It can do nothing you could not do by typing '
          + 'the command yourself, which is why plugins are safe to share as a single file.',
      }),
      h('div', { class: 'about__links' }, [pack, add, folder, reload]),
      list,
      status,
    ]);

    refresh();
    return { element, refresh };
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
      button('heart', 'Support the work', links.donate),
      button('chat', 'Discord', links.discord),
    ].filter(Boolean);

    return h('div', { class: 'field' }, [
      h('label', { text: `About - Luwan Shell ${state.info.version}` }),
      h('div', { class: 'about__links' }, buttons),
      h('span', {
        class: 'note',
        text: 'Found something broken, or want to help? Both are welcome. The last one is only if you like the thing - it changes nothing about the app.',
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
