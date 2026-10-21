(function (App) {
  'use strict';

  const { h, icon } = App.dom;

  const ANSI = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
    'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
  ];

  const scheme = (label, background, foreground, cursor, selection, colours, light = false) => ({
    label,
    light,
    background,
    foreground,
    cursor,
    selection,
    colours: Object.fromEntries(ANSI.map((name, index) => [name, colours[index]])),
  });

  const THEMES = {
    luwan: scheme('Luwan', '#0a0b12', '#e9ecf8', null, null, [
      '#1b1e2b', '#ff5c72', '#22c58b', '#f2a33c', '#4b7cff', '#b47cff', '#3ea8ff', '#c8cde0',
      '#3a3f57', '#ff8a99', '#5fe0b0', '#ffc46b', '#7c9dff', '#cba4ff', '#7cc7ff', '#eef0f8',
    ]),
    dracula: scheme('Dracula', '#282a36', '#f8f8f2', '#f8f8f2', '#44475a', [
      '#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff',
    ]),
    nord: scheme('Nord', '#2e3440', '#d8dee9', '#d8dee9', '#434c5e', [
      '#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4',
    ]),
    gruvbox: scheme('Gruvbox', '#282828', '#ebdbb2', '#ebdbb2', '#504945', [
      '#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984',
      '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2',
    ]),
    'one-dark': scheme('One Dark', '#282c34', '#abb2bf', '#528bff', '#3e4451', [
      '#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
      '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff',
    ]),
    'tokyo-night': scheme('Tokyo Night', '#1a1b26', '#c0caf5', '#c0caf5', '#33467c', [
      '#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5',
    ]),
    catppuccin: scheme('Catppuccin', '#1e1e2e', '#cdd6f4', '#f5e0dc', '#585b70', [
      '#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de',
      '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8',
    ]),
    'solarized-dark': scheme('Solarized Dark', '#002b36', '#839496', '#93a1a1', '#073642', [
      '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3',
    ]),
    'solarized-light': scheme('Solarized Light', '#fdf6e3', '#657b83', '#586e75', '#eee8d5', [
      '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3',
    ], true),
    'github-light': scheme('GitHub Light', '#ffffff', '#24292f', '#0969da', '#bbdfff', [
      '#24292f', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781',
      '#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f',
    ], true),
  };

  const schemeFor = (settings) => THEMES[settings.terminalTheme] || THEMES.luwan;

  function opacityOf(settings) {
    return Math.min(100, Math.max(20, Number(settings.terminalOpacity) || 100)) / 100;
  }

  function themeFor(settings) {
    const chosen = schemeFor(settings);
    const alpha = opacityOf(settings);
    const accent = settings.accentColor || '#7c5cff';
    const cursor = chosen.cursor || accent;
    const selection = chosen.selection || accent;

    return {
      ...chosen.colours,
      foreground: chosen.foreground,
      background: alpha >= 1 ? chosen.background : App.dom.withAlpha(chosen.background, alpha),
      cursor,
      cursorAccent: chosen.background,
      selectionBackground: App.dom.withAlpha(selection, chosen.selection ? 0.75 : 0.32),
    };
  }

  function optionsFor(settings) {
    return {
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      fontWeight: settings.fontWeight || 'normal',
      fontWeightBold: 'bold',
      lineHeight: (Number(settings.lineHeight) || 100) / 100,
      letterSpacing: Number(settings.letterSpacing) || 0,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      scrollback: settings.scrollback,
      scrollSensitivity: Number(settings.scrollSensitivity) || 1,
      theme: themeFor(settings),
    };
  }

  function paintPane(pane, settings) {
    const stored = Number(settings.terminalPadding);
    const padding = Number.isFinite(stored) ? stored : 12;
    pane.style.padding = [padding, Math.max(0, padding - 6), padding, padding + 2]
      .map((side) => side + 'px').join(' ');
    pane.style.background = opacityOf(settings) >= 1 ? schemeFor(settings).background : '';
  }

  function create(sessionId, settings) {
    const pane = h('div', { class: 'term-pane', dataset: { session: sessionId } });
    const host = h('div', { style: 'height:100%' });
    pane.append(host);

    let current = settings;
    paintPane(pane, settings);

    const term = new window.Terminal({
      ...optionsFor(settings),
      allowProposedApi: true,
      macOptionIsMeta: true,
      allowTransparency: Number(settings.terminalOpacity) < 100,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    const searchAddon = new window.SearchAddon.SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(
      new window.WebLinksAddon.WebLinksAddon((_event, uri) => {
        window.term.app.openExternal(uri).catch((err) => App.toast.error(err.message));
      })
    );

    term.open(host);

    if (settings.webgl) {
      try {
        const webgl = new window.WebglAddon.WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {

      }
    }

    term.onData((data) => window.term.ssh.write(sessionId, data).catch(() => {}));
    term.onResize(({ cols, rows }) => window.term.ssh.resize(sessionId, cols, rows).catch(() => {}));

    term.onSelectionChange(() => {
      if (!current.copyOnSelect) return;
      const selection = term.getSelection();
      if (selection) window.term.clipboard.write(selection).catch(() => {});
    });

    term.onBell(() => {
      if (current.bell !== 'flash') return;
      pane.classList.remove('is-ringing');
      void pane.offsetWidth;
      pane.classList.add('is-ringing');
    });
    pane.addEventListener('animationend', () => pane.classList.remove('is-ringing'));

    const paste = async () => {
      try {
        const text = await window.term.clipboard.read();
        if (text) term.paste(text);
      } catch (err) {
        App.toast.error(`Paste failed: ${err.message}`);
      }
    };

    const search = buildSearch(pane, searchAddon, term);

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const combo = event.ctrlKey && event.shiftKey;
      if (combo && event.code === 'KeyC') {
        const selection = term.getSelection();
        if (selection) window.term.clipboard.write(selection).catch(() => {});
        return false;
      }
      if (combo && event.code === 'KeyV') {
        paste();
        return false;
      }
      if (combo && event.code === 'KeyF') {
        search.toggle();
        return false;
      }
      if (event.key === 'Escape' && search.isOpen()) {
        search.close();
        return false;
      }

      if (event.ctrlKey && event.code === 'Tab') return false;
      if (event.altKey && /^Digit[1-9]$/.test(event.code)) return false;
      return true;
    });

    pane.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (current.rightClick === 'none') return;
      const selection = current.rightClick === 'copy-paste' ? term.getSelection() : '';
      if (selection) {
        window.term.clipboard.write(selection).catch(() => {});
        term.clearSelection();
        return;
      }
      paste();
    });

    pane.addEventListener('wheel', (event) => {
      if (!event.ctrlKey || !current.ctrlWheelZoom) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(28, Math.max(9, term.options.fontSize + step));
      if (next !== term.options.fontSize) {
        term.options.fontSize = next;
        fit();
      }
    }, { passive: false, capture: true });

    const observer = new ResizeObserver(() => fit());
    observer.observe(pane);

    let overlay = null;

    function fit() {
      if (!pane.isConnected || pane.clientWidth < 40 || pane.clientHeight < 40) return;
      try {
        fitAddon.fit();
      } catch {

      }
    }

    return {
      element: pane,
      term,
      focus: () => term.focus(),
      fit,
      paste,
      write: (chunk) => term.write(chunk),
      dimensions: () => ({ cols: term.cols, rows: term.rows }),

      applySettings(next) {
        current = next;
        Object.assign(term.options, optionsFor(next));
        paintPane(pane, next);
        fit();
      },

      setOverlay(config) {
        if (overlay) {
          overlay.remove();
          overlay = null;
        }
        if (!config) return;
        overlay = h('div', { class: 'term-overlay' }, [
          h('div', { class: 'term-overlay__msg' }, [
            config.spinner ? h('div', { class: 'spinner' }) : null,
            h('h2', { text: config.title }),
            h('p', { text: config.message || '' }),
            config.action
              ? h('button', {
                  class: 'btn btn--primary',
                  text: config.action.label,
                  style: 'margin-top:12px',
                  onclick: config.action.onClick,
                })
              : null,
          ]),
        ]);
        pane.append(overlay);
      },

      dispose() {
        observer.disconnect();
        term.dispose();
        pane.remove();
      },
    };
  }

  function buildSearch(pane, searchAddon, term) {
    const input = h('input', { type: 'search', placeholder: 'Find in terminal' });
    const options = { caseSensitive: false, regex: false, decorations: undefined };

    const findNext = () => input.value && searchAddon.findNext(input.value, options);
    const findPrev = () => input.value && searchAddon.findPrevious(input.value, options);

    const bar = h('div', { class: 'term-search', hidden: true }, [
      input,
      h('button', { class: 'iconbtn', title: 'Previous', onclick: findPrev }, [icon('up')]),
      h('button', { class: 'iconbtn', title: 'Next', onclick: findNext }, [icon('down')]),
      h('button', { class: 'iconbtn', title: 'Close', onclick: () => close() }, [icon('x')]),
    ]);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') (event.shiftKey ? findPrev() : findNext());
      if (event.key === 'Escape') close();
      event.stopPropagation();
    });

    function close() {
      bar.hidden = true;
      searchAddon.clearDecorations?.();
      term.focus();
    }

    pane.append(bar);

    return {
      isOpen: () => !bar.hidden,
      close,
      toggle() {
        if (bar.hidden) {
          bar.hidden = false;
          input.select();
          input.focus();
        } else {
          close();
        }
      },
    };
  }

  App.terminal = { create, themes: THEMES };
})(window.App);
