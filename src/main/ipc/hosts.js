'use strict';

const { handle } = require('./helpers');
const hosts = require('../store/hosts');
const vault = require('../store/vault');

function decorate(host) {
  return {
    ...host,
    hasStoredSecret:
      vault.has(`host:${host.id}:password`) || vault.has(`host:${host.id}:passphrase`),
  };
}

function register() {
  handle('hosts:list', () => hosts.list().map(decorate));
  handle('hosts:save', (input) => decorate(hosts.save(input)));
  handle('hosts:duplicate', (id) => decorate(hosts.duplicate(id)));

  handle('hosts:remove', (id) => {
    const removed = hosts.remove(id);
    if (removed) vault.clearPrefix(`host:${id}:`);
    return removed;
  });

  handle('hosts:forget-secret', (id) => vault.clearPrefix(`host:${id}:`));
  handle('hosts:accents', () => hosts.ACCENTS);
}

module.exports = { register };
