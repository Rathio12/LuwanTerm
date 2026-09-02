(() => {
  'use strict';

  const { h } = App.dom;

  const HISTORY = 60;

  const bytes = (value) => {
    if (!Number.isFinite(value)) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
  };

  const rate = (value) => (Number.isFinite(value) ? `${bytes(value)}/s` : '-');

  const duration = (seconds) => {
    if (!Number.isFinite(seconds)) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  function meter(label) {
    const fill = h('span', { class: 'meter__fill' });
    const value = h('span', { class: 'meter__value', text: '-' });
    const element = h('div', { class: 'meter' }, [
      h('div', { class: 'meter__head' }, [h('span', { text: label }), value]),
      h('div', { class: 'meter__track' }, [fill]),
    ]);
    return {
      element,
      set(percent, text) {
        const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
        fill.style.width = `${safe}%`;
        fill.classList.toggle('is-high', safe >= 90);
        value.textContent = text;
      },
    };
  }

  /** A sparkline of recent throughput, drawn from the samples we already hold. */
  function graph() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${HISTORY} 30`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('spark');

    const line = (className) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', className);
      svg.append(path);
      return path;
    };
    const rx = line('spark__rx');
    const tx = line('spark__tx');

    const plot = (series, peak) => series
      .map((value, index) => {
        const x = HISTORY - series.length + index;
        const y = 30 - (peak ? (value / peak) * 28 : 0) - 1;
        return `${index ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
      })
      .join(' ');

    return {
      element: svg,
      draw(down, up) {
        const peak = Math.max(1, ...down, ...up);
        rx.setAttribute('d', plot(down, peak));
        tx.setAttribute('d', plot(up, peak));
      },
    };
  }

  function create(sessionId) {
    const cpu = meter('CPU');
    const memory = meter('Memory');
    const swap = meter('Swap');
    const chart = graph();

    const note = h('span', { class: 'note', text: 'Reading the server...' });
    const uptime = h('span', { class: 'stat__value', text: '-' });
    const load = h('span', { class: 'stat__value', text: '-' });
    const down = h('span', { class: 'stat__value', text: '-' });
    const up = h('span', { class: 'stat__value', text: '-' });

    const row = (label, value) => h('div', { class: 'stat' }, [
      h('span', { class: 'stat__label', text: label }),
      value,
    ]);

    const element = h('div', { class: 'stats' }, [
      cpu.element,
      memory.element,
      swap.element,
      h('div', { class: 'stats__net' }, [
        h('div', { class: 'stats__netHead' }, [
          h('span', { text: 'Network' }),
          h('span', { class: 'stats__legend' }, [
            h('span', { class: 'dot dot--rx' }), 'in ',
            h('span', { class: 'dot dot--tx' }), 'out',
          ]),
        ]),
        chart.element,
      ]),
      h('div', { class: 'stats__grid' }, [
        row('Download', down),
        row('Upload', up),
        row('Uptime', uptime),
        row('Load', load),
      ]),
      note,
    ]);

    const history = { rx: [], tx: [] };
    let unsubscribe = null;
    let started = false;

    const push = (series, value) => {
      series.push(Number.isFinite(value) ? value : 0);
      while (series.length > HISTORY) series.shift();
    };

    function render(reading) {
      if (!reading || !reading.supported) {
        note.textContent = (reading && reading.reason) || 'Nothing to read.';
        return;
      }

      cpu.set(reading.cpu, Number.isFinite(reading.cpu) ? `${reading.cpu}%` : 'measuring...');

      if (reading.memory) {
        memory.set(reading.memory.percent,
          `${bytes(reading.memory.used)} of ${bytes(reading.memory.total)}`);
      }
      if (reading.swap) {
        swap.set(reading.swap.percent, `${bytes(reading.swap.used)} of ${bytes(reading.swap.total)}`);
      } else {
        swap.set(0, 'none');
      }

      uptime.textContent = duration(reading.uptime);
      load.textContent = reading.load ? reading.load.map((value) => value.toFixed(2)).join('  ') : '-';

      const net = reading.network || {};
      down.textContent = rate(net.rx);
      up.textContent = rate(net.tx);
      push(history.rx, net.rx);
      push(history.tx, net.tx);
      chart.draw(history.rx, history.tx);

      note.textContent = reading.cores
        ? `${reading.cores} cores${net.interfaces ? ` - ${net.interfaces.join(', ')}` : ''}`
        : '';
    }

    return {
      element,
      async start() {
        if (started) return;
        started = true;

        // One stream from the server rather than a request every few seconds:
        // it updates as fast as the server sends, and costs one channel.
        unsubscribe = window.term.stats.onSample(({ sessionId: id, sample }) => {
          if (id === sessionId) render(sample);
        });

        try {
          await window.term.stats.subscribe(sessionId);
        } catch (err) {
          note.textContent = err.message;
          started = false;
        }
      },
      stop() {
        if (!started) return;
        started = false;

        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        window.term.stats.unsubscribe(sessionId).catch(() => {});
      },
    };
  }

  App.stats = { create };
})();
