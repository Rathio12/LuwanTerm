/* Shared renderer state with a minimal event bus. */
(function (App) {
  'use strict';

  const listeners = new Map();

  const state = {
    info: { version: '', platform: '', secretsAvailable: false },
    settings: {
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      copyOnSelect: true,
      confirmOnClose: true,
      webgl: true,
    },
    hosts: [],
    keys: [],
    snippets: [],
    /** @type {Map<string, {info: object, term: object, dock: string|null, cwd: string}>} */
    sessions: new Map(),
    activeId: null,
    filter: '',

    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event).delete(handler);
    },

    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[state] listener for "${event}" failed:`, err);
        }
      }
    },

    session(id) {
      return state.sessions.get(id) || null;
    },

    active() {
      return state.activeId ? state.sessions.get(state.activeId) : null;
    },

    hostById(id) {
      return state.hosts.find((host) => host.id === id) || null;
    },

    /** Sessions currently open for a given host profile. */
    sessionsForHost(hostId) {
      return [...state.sessions.values()].filter((entry) => entry.info.hostId === hostId);
    },
  };

  App.state = state;
})(window.App);
