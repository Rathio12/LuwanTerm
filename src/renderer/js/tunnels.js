/* Port-forwarding panel for one session. */
(function (App) {
  'use strict';

  const { h, icon, iconButton } = App.dom;
  const { form } = App.modal;

  const LABELS = {
    local: 'Local',
    remote: 'Remote',
    dynamic: 'SOCKS5',
  };

  function routeOf(tunnel) {
    if (tunnel.type === 'dynamic') {
      return `${tunnel.localHost}:${tunnel.localPort}  ->  proxy through host`;
    }
    if (tunnel.type === 'remote') {
      return `server:${tunnel.remotePort}  ->  ${tunnel.localHost}:${tunnel.localPort}`;
    }
    return `${tunnel.localHost}:${tunnel.localPort}  ->  ${tunnel.remoteHost}:${tunnel.remotePort}`;
  }

  function create(sessionId) {
    const list = h('div', { class: 'tn__list' });

    const element = h('div', { class: 'tn' }, [
      list,
      h('div', { class: 'tn__foot' }, [
        h('button', { class: 'btn btn--primary', onclick: () => openDialog() }, [
          icon('plus'),
          'New tunnel',
        ]),
      ]),
    ]);

    async function refresh() {
      try {
        render(await window.term.tunnels.list(sessionId));
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    function render(tunnels) {
      list.replaceChildren();
      if (!tunnels.length) {
        list.append(
          h('div', {
            class: 'hint',
            text: 'No tunnels on this session yet. Forward a local port, expose a local service, or run a SOCKS5 proxy.',
          })
        );
        return;
      }

      for (const tunnel of tunnels) {
        list.append(
          h('div', { class: 'tn__item', dataset: { tunnel: tunnel.id } }, [
            h('div', {}, [
              h('span', { class: `tn__kind tn__kind--${tunnel.type}`, text: LABELS[tunnel.type] }),
              h('div', { class: 'tn__route', text: routeOf(tunnel) }),
              h('div', { class: 'tn__live', text: `${tunnel.connections} active connection${tunnel.connections === 1 ? '' : 's'}` }),
            ]),
            iconButton('power', {
              title: 'Close tunnel',
              className: 'iconbtn iconbtn--danger',
              onClick: () => close(tunnel),
            }),
          ])
        );
      }
    }

    /** Live connection counts arrive as events; patch the row in place. */
    function updateActivity(payload) {
      const row = list.querySelector(`[data-tunnel="${payload.id}"] .tn__live`);
      if (row) {
        row.textContent = `${payload.connections} active connection${payload.connections === 1 ? '' : 's'}`;
      }
    }

    async function close(tunnel) {
      try {
        await window.term.tunnels.close(sessionId, tunnel.id);
        App.toast.ok('Tunnel closed');
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    async function openDialog() {
      const type = form.select(
        [
          { value: 'local', label: 'Local forward  (-L)' },
          { value: 'remote', label: 'Remote forward  (-R)' },
          { value: 'dynamic', label: 'Dynamic SOCKS5 proxy  (-D)' },
        ],
        { value: 'local' }
      );

      const localHost = form.input({ value: '127.0.0.1', class: 'input input--mono' });
      const localPort = form.input({ type: 'number', min: '1', max: '65535', value: '8080', class: 'input input--mono' });
      const remoteHost = form.input({ value: '127.0.0.1', class: 'input input--mono' });
      const remotePort = form.input({ type: 'number', min: '1', max: '65535', value: '80', class: 'input input--mono' });

      const localBlock = form.row([
        form.field('Listen address', localHost),
        form.field('Listen port', localPort),
      ]);
      const remoteBlock = form.row([
        form.field('Destination host', remoteHost),
        form.field('Destination port', remotePort),
      ]);
      const explain = h('p', {});

      const relabel = () => {
        const mode = type.value;
        remoteBlock.hidden = mode === 'dynamic';
        if (mode === 'local') {
          localBlock.querySelector('label').textContent = 'Listen address';
          remoteBlock.querySelectorAll('label')[0].textContent = 'Destination host';
          remoteBlock.querySelectorAll('label')[1].textContent = 'Destination port';
          explain.textContent =
            'Traffic hitting this local port travels through the SSH connection and comes out at the destination, as seen from the server.';
        } else if (mode === 'remote') {
          localBlock.querySelector('label').textContent = 'Forward to address (on this machine)';
          remoteBlock.querySelectorAll('label')[0].textContent = 'Server bind address';
          remoteBlock.querySelectorAll('label')[1].textContent = 'Server bind port';
          explain.textContent =
            'The server listens on its own port and hands every connection back to the address above on this machine.';
        } else {
          explain.textContent =
            'Point a browser or CLI tool at this port as a SOCKS5 proxy and its traffic exits from the server.';
        }
      };
      type.addEventListener('change', relabel);
      relabel();

      const config = await App.modal.show({
        title: 'New tunnel',
        iconName: 'link',
        content: h('div', { class: 'row' }, [
          form.field('Type', type),
          localBlock,
          remoteBlock,
          explain,
        ]),
        buttons: [
          { label: 'Cancel', value: null },
          { label: 'Open tunnel', value: 'ok', primary: true },
        ],
        onSubmit: () => ({
          type: type.value,
          localHost: localHost.value.trim(),
          localPort: localPort.value,
          remoteHost: remoteHost.value.trim(),
          remotePort: remotePort.value,
        }),
      });
      if (!config) return;

      try {
        const tunnel = await window.term.tunnels.open(sessionId, config);
        App.toast.ok(`Tunnel open: ${routeOf(tunnel)}`);
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    refresh();

    return { element, refresh, updateActivity };
  }

  App.tunnels = { create };
})(window.App);
