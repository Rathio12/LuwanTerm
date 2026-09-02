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

  App.betaNotice = { maybeWarn, isBeta };
})();
