(() => {
  'use strict';

  const { h } = App.dom;

  const EARLIEST_SESSION = 8;
  const AFTER_DAYS = 3;
  const CHANCE = 0.15;
  const DELAY_MIN_MS = 20000;
  const DELAY_MAX_MS = 90000;

  let asked = false;

  const days = (ms) => ms / (24 * 60 * 60 * 1000);
  const between = (low, high) => low + Math.random() * (high - low);

  async function noteSession() {
    if (asked) return;

    // Never in a development run. Asking the person building the thing to go
    // and star it is absurd, and counting those sessions would mean a real
    // install arrived with the counter already spent.
    try {
      if (!(await window.term.app.info()).packaged) return;
    } catch {
      return;
    }

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
    const repo = links.github || '';
    const open = (url) => {
      if (url) window.term.app.openExternal(url).catch(() => {});
    };

    const choice = await App.modal.show({
      title: 'Enjoying LuwanTerm?',
      iconName: 'terminal',
      content: h('div', { class: 'row' }, [
        h('p', {
          text: 'It is free, it always will be, and it is not for sale. A star is the only '
            + 'thing it asks for.',
        }),
        h('span', {
          class: 'note',
          text: 'Asked once. Close this and it will not come back.',
        }),
      ]),
      buttons: [
        { label: 'View on GitHub', value: 'view' },
        { label: 'Give it a star', value: 'star', primary: true },
      ],
    });

    if (choice === 'star') {
      open(repo);
      await window.term.settings.set({ starPromptState: 'starred' });
      App.toast.info('Thank you.');
      return;
    }

    if (choice === 'view') {
      open(repo);
      await window.term.settings.set({ starPromptState: 'viewed' });
      return;
    }

    await window.term.settings.set({ starPromptState: 'dismissed' });
  }

  App.supportPrompt = { noteSession, ask };
})();
