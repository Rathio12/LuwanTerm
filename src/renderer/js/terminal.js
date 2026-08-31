(function (App) {
  'use strict';

  const { h, icon } = App.dom;

  const THEME = {
    background: '#0a0b12',
    foreground: '#e9ecf8',
    cursor: '#7c5cff',
    cursorAccent: '#0a0b12',
    selectionBackground: 'rgba(124, 92, 255, 0.32)',
    black: '#1b1e2b',
    red: '#ff5c72',
    green: '#22c58b',
    yellow: '#f2a33c',
    blue: '#4b7cff',
    magenta: '#b47cff',
    cyan: '#3ea8ff',
    white: '#c8cde0',
    brightBlack: '#3a3f57',
    brightRed: '#ff8a99',
    brightGreen: '#5fe0b0',
    brightYellow: '#ffc46b',
    brightBlue: '#7c9dff',
    brightMagenta: '#cba4ff',
    brightCyan: '#7cc7ff',
    brightWhite: '#eef0f8',
  };

  function themeFor(settings) {
    const alpha = Math.min(100, Math.max(20, Number(settings.terminalOpacity) || 100)) / 100;
    const accent = settings.accentColor || THEME.cursor;

    return {
      ...THEME,
      background: alpha >= 1 ? THEME.background : `rgba(10, 11, 18, ${alpha})`,
      cursor: accent,
      selectionBackground: App.dom.withAlpha(accent, 0.32),
    };
  }

  function create(sessionId, settings) {
    const pane = h('div', { class: 'term-pane', dataset: { session: sessionId } });
    const host = h('div', { style: 'height:100%' });
    pane.append(host);

    const term = new window.Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      scrollback: settings.scrollback,
      allowProposedApi: true,
      macOptionIsMeta: true,
      allowTransparency: Number(settings.terminalOpacity) < 100,
      theme: themeFor(settings),
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

    if (settings.copyOnSelect) {
      term.onSelectionChange(() => {
        const selection = term.getSelection();
        if (selection) window.term.clipboard.write(selection).catch(() => {});
      });
    }

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
      paste();
    });

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
        term.options.fontFamily = next.fontFamily;
        term.options.fontSize = next.fontSize;
        term.options.cursorBlink = next.cursorBlink;
        term.options.cursorStyle = next.cursorStyle;
        term.options.scrollback = next.scrollback;
        term.options.theme = themeFor(next);
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

  App.terminal = { create };
})(window.App);
