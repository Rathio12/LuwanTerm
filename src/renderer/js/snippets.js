(function (App) {
  'use strict';

  const { h, iconButton, qs } = App.dom;
  const { form } = App.modal;
  const state = App.state;

  async function reload() {
    state.snippets = await window.term.snippets.list();
    render();
  }

  function matches(snippet, filter) {
    if (!filter) return true;
    return `${snippet.label} ${snippet.command}`.toLowerCase().includes(filter);
  }

  function render() {
    const list = qs('#snippet-list');
    list.replaceChildren();

    const filter = state.filter.trim().toLowerCase();
    const visible = state.snippets.filter((snippet) => matches(snippet, filter));

    if (!visible.length) {
      if (state.snippets.length) {
        list.append(h('div', { class: 'hint', text: 'No snippets match that search.' }));
        return;
      }
      list.append(
        h('div', {
          class: 'hint',
          text: 'No snippets yet. Save commands you type often and send them to any session with one click.',
        })
      );
      return;
    }

    for (const snippet of visible) {
      list.append(
        h(
          'div',
          {
            class: 'snippet',
            title: snippet.command,
            onclick: () => App.sessions.sendToActive(snippet.command, snippet.runOnInsert),
          },
          [
            h('div', { class: 'snippet__label' }, [
              h('span', { text: snippet.label }),
              h('div', { class: 'snippet__acts' }, [
                iconButton('edit', {
                  title: 'Edit',
                  onClick: (event) => {
                    event.stopPropagation();
                    edit(snippet);
                  },
                }),
                iconButton('trash', {
                  title: 'Delete',
                  className: 'iconbtn iconbtn--danger',
                  onClick: (event) => {
                    event.stopPropagation();
                    remove(snippet);
                  },
                }),
              ]),
            ]),
            h('div', { class: 'snippet__cmd', text: snippet.command }),
          ]
        )
      );
    }
  }

  async function remove(snippet) {
    const confirmed = await App.modal.confirm({
      title: 'Delete snippet',
      message: 'This removes the saved command.',
      detail: snippet.command,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    await window.term.snippets.remove(snippet.id);
    reload();
  }

  function edit(snippet = null) {
    const label = form.input({ value: snippet ? snippet.label : '', placeholder: 'Tail nginx errors' });
    const command = form.textarea({
      value: snippet ? snippet.command : '',
      placeholder: 'tail -f /var/log/nginx/error.log',
    });
    const runOnInsert = form.check('Press Enter after inserting', snippet ? snippet.runOnInsert : true);

    return App.modal
      .show({
        title: snippet ? 'Edit snippet' : 'New snippet',
        iconName: 'code',
        content: h('div', { class: 'row' }, [
          form.field('Label', label),
          form.field('Command', command),
          runOnInsert,
        ]),
        buttons: [
          { label: 'Cancel', value: null },
          { label: 'Save', value: 'save', primary: true },
        ],
        onSubmit: async () => {
          await window.term.snippets.save({
            id: snippet ? snippet.id : undefined,
            label: label.value,
            command: command.value,
            runOnInsert: runOnInsert.input.checked,
          });
          return true;
        },
      })
      .then((result) => {
        if (result) reload();
      });
  }

  App.snippets = { reload, render, edit };
})(window.App);
