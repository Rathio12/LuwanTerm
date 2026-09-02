(() => {
  'use strict';

  const { h } = App.dom;

  const isBeta = (version) => /-beta\./i.test(String(version || ''));

  /**
   * Shown once per beta version. Someone who opted into betas knows roughly what
   * they signed up for, but they deserve reminding which build they are on and
   * where a crash should go - and being asked again every launch would teach
   * them to dismiss it without reading.
   */
  async function maybeWarn(info) {
    const version = info && info.version;
    if (!isBeta(version)) return false;

    let settings;
    try {
      settings = await window.term.settings.get();
    } catch {
      return false;
    }
    if (settings.betaNoticeSeen === version) return false;

    const links = (info && info.links) || {};
    const choice = await App.modal.show({
      title: `Beta build - ${version}`,
      iconName: 'shield',
      tone: 'danger',
      content: h('div', { class: 'row' }, [
        h('p', {
          text: 'This is a beta. It has had the same tests a release does, but it is the '
            + 'version things break in - expect the odd crash or something behaving oddly.',
        }),
        h('p', {
          text: 'If that happens, please report it. A beta nobody reports is just a worse '
            + 'release.',
        }),
        h('span', {
          class: 'note',
          text: 'Turn off "Include beta builds" in Settings to go back to stable ones. '
            + 'Shown once per beta build.',
        }),
      ]),
      buttons: [
        { label: 'Report an issue', value: 'report' },
        { label: 'Got it', value: 'ok', primary: true },
      ],
    });

    try {
      await window.term.settings.set({ betaNoticeSeen: version });
    } catch {
      // Worst case it is shown again next launch.
    }

    if (choice === 'report' && links.issues) {
      window.term.app.openExternal(links.issues).catch(() => {});
    }
    return true;
  }

  /**
   * Asked when somebody ticks the box, which is the moment the decision is
   * actually made - warning them only once a beta has already installed itself
   * is a warning that arrives too late to act on.
   */
  async function confirmOptIn() {
    const choice = await App.modal.show({
      title: 'Take beta builds?',
      iconName: 'shield',
      tone: 'danger',
      content: h('div', { class: 'row' }, [
        h('p', {
          text: 'You will be offered builds before they are finished. They get the same tests '
            + 'a release does, but they are the version things break in - expect the odd crash '
            + 'or something behaving oddly, and please report it when it happens.',
        }),
        h('p', {
          text: 'Going back means installing a stable build by hand, or waiting for the next '
            + 'stable release to overtake the beta you are on.',
        }),
        h('span', {
          class: 'note',
          text: 'You can untick this at any time. Every beta also says so when it starts.',
        }),
      ]),
      buttons: [
        { label: 'Not now', value: 'no' },
        { label: 'Yes, send me betas', value: 'yes', primary: true },
      ],
    });
    return choice === 'yes';
  }

  App.betaNotice = { maybeWarn, isBeta, confirmOptIn };
})();
