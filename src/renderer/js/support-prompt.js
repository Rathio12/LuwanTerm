(() => {
  'use strict';

  const { h } = App.dom;

  const EARLIEST_SESSION = 8;
  const AFTER_DAYS = 3;
  const CHANCE = 0.15;
  const DEFER_SESSIONS = 25;
  const DELAY_MIN_MS = 20000;
  const DELAY_MAX_MS = 90000;

  let asked = false;

  const days = (ms) => ms / (24 * 60 * 60 * 1000);
  const between = (low, high) => low + Math.random() * (high - low);

  async function noteSession() {
    if (asked) return;

    let settings;
    try {
      settings = await window.term.settings.get();
    } catch {
      return;
    }
    if (settings.starPromptState !== 'pending') return;

    const firstRunAt = settings.starPromptFirstRunAt || Date.now();
    const sessions = (settings.starPromptSessions || 0) + 1;
    await window.term.settings.set({ starPromptSessions: sessions, starPromptFirstRunAt: firstRunAt });

    if (sessions < EARLIEST_SESSION) return;
    if (days(Date.now() - firstRunAt) < AFTER_DAYS) return;

    if (Math.random() > CHANCE) return;

    asked = true;
    setTimeout(() => ask(), between(DELAY_MIN_MS, DELAY_MAX_MS));
  }

  async function ask() {
    if (App.modal.isOpen()) return;

    const links = (await window.term.app.info()).links || {};
    const open = (url) => {
      if (url) window.term.app.openExternal(url).catch(() => {});
    };

    const choice = await App.modal.show({
      title: 'Enjoying LuwanTerm?',
      iconName: 'terminal',
      content: h('div', { class: 'row' }, [
        h('p', {
          text: 'It is free, it always will be, and it is not for sale. The only thing it '
            + 'asks for is a star, or a hand with the code.',
        }),
        h('span', {
          class: 'note',
          text: 'Asked once. Whichever button you pick, this will not come back.',
        }),
      ]),
      buttons: [
        { label: 'Not now', value: 'later' },
        { label: 'Contribute', value: 'contribute' },
        { label: 'Star it', value: 'star', primary: true },
      ],
    });

    if (choice === 'star') {
      open(links.github);
      await window.term.settings.set({ starPromptState: 'starred' });
      App.toast.info('Thank you.');
      return;
    }
    if (choice === 'contribute') {
      open(links.github ? `${links.github}/blob/main/CONTRIBUTING.md` : '');
      await window.term.settings.set({ starPromptState: 'contributing' });
      return;
    }

    await window.term.settings.set({ starPromptState: 'pending', starPromptSessions: -DEFER_SESSIONS });
  }

  App.supportPrompt = { noteSession };
})();
