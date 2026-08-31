(function (App) {
  'use strict';

  const { h, qs, icon } = App.dom;

  const form = {
    field: (label, control, note) =>
      h('div', { class: 'field' }, [
        label ? h('label', { text: label }) : null,
        control,
        note ? h('span', { class: 'note', text: note }) : null,
      ]),

    input: (attrs = {}) => h('input', { class: 'input', ...attrs }),
    textarea: (attrs = {}) => h('textarea', { class: 'textarea', ...attrs }),

    select: (options, attrs = {}) =>
      h(
        'select',
        { class: 'select', ...attrs },
        options.map((option) =>
          h('option', { value: option.value, selected: option.value === attrs.value }, [option.label])
        )
      ),

    check: (label, checked, attrs = {}) => {
      const box = h('input', { type: 'checkbox', checked: Boolean(checked), ...attrs });
      const wrapper = h('label', { class: 'check' }, [box, h('span', { text: label })]);
      wrapper.input = box;
      return wrapper;
    },

    row: (children, variant = '2') => h('div', { class: `row row--${variant}` }, children),
  };

  let openCount = 0;

  function show(config) {
    const {
      title,
      iconName = 'server',
      tone = '',
      content,
      buttons = [{ label: 'Close', value: null }],
      wide = false,
      persistent = false,
      onSubmit,
    } = config;

    const root = qs('#modal-root');

    return new Promise((resolve) => {
      let settled = false;

      const close = (value) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeydown, true);
        card.remove();
        openCount -= 1;
        if (openCount === 0) root.classList.remove('is-open');
        resolve(value);
      };

      const commit = async (button) => {
        if (!button.value || !onSubmit) {
          close(button.value ?? null);
          return;
        }
        try {
          const result = await onSubmit(button.value);
          if (result !== false) close(result === true || result === undefined ? button.value : result);
        } catch (err) {
          App.toast.error(err.message);
        }
      };

      const footer = h(
        'div',
        { class: 'modal__foot' },
        buttons.map((button) =>
          h('button', {
            class: `btn btn--${button.variant || (button.primary ? 'primary' : 'ghost')}`,
            text: button.label,
            onclick: () => commit(button),
          })
        )
      );

      const card = h('div', { class: `modal${wide ? ' modal--wide' : ''}` }, [
        h('div', { class: 'modal__head' }, [
          h('span', { class: `modal__mark${tone ? ` modal__mark--${tone}` : ''}` }, [icon(iconName)]),
          h('h2', { text: title }),
          h('button', { class: 'iconbtn', onclick: () => close(null) }, [icon('x')]),
        ]),
        h('div', { class: 'modal__body' }, [content]),
        footer,
      ]);

      const isTopmost = () => root.lastElementChild === card;

      const onKeydown = (event) => {
        if (!card.isConnected || !isTopmost()) return;
        if (event.key === 'Escape' && !persistent) {
          event.stopPropagation();
          close(null);
        }
        if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
          const primary = buttons.find((button) => button.primary);
          if (primary) {
            event.preventDefault();
            event.stopPropagation();
            commit(primary);
          }
        }
      };

      root.addEventListener('mousedown', (event) => {
        if (persistent || event.target !== root || !isTopmost()) return;
        close(null);
      });

      openCount += 1;
      root.classList.add('is-open');
      root.append(card);
      document.addEventListener('keydown', onKeydown, true);

      const firstInput = card.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
      else card.querySelector('.btn--primary')?.focus();
    });
  }

  async function confirm({ title, message, confirmLabel = 'Confirm', tone = 'danger', detail }) {
    const value = await show({
      title,
      iconName: tone === 'danger' ? 'trash' : 'shield',
      tone,
      content: h('div', { class: 'field' }, [
        h('p', { text: message }),
        detail ? h('div', { class: 'callout callout--danger' }, [h('code', { text: detail })]) : null,
      ]),
      buttons: [
        { label: 'Cancel', value: null },
        { label: confirmLabel, value: 'confirm', variant: tone === 'danger' ? 'danger' : 'primary', primary: true },
      ],
    });
    return value === 'confirm';
  }

  async function prompt({ title, label, value = '', placeholder = '', okLabel = 'Save', mono = false }) {
    const field = form.input({ value, placeholder, class: `input${mono ? ' input--mono' : ''}` });
    const result = await show({
      title,
      iconName: 'edit',
      content: form.field(label, field),
      buttons: [
        { label: 'Cancel', value: null },
        { label: okLabel, value: 'ok', primary: true },
      ],
      onSubmit: () => {
        const text = field.value.trim();
        if (!text) throw new Error('Please enter a value.');
        return text;
      },
    });
    return result;
  }

  App.modal = { show, confirm, prompt, form };
})(window.App);
