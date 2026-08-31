'use strict';

const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('updater');

installElectronStub();
const updater = require(path.join(__dirname, '..', 'src', 'main', 'updater'));

const cases = [
  ['1.1.0', '1.0.0', true, 'a minor bump is newer'],
  ['1.10.0', '1.9.0', true, '1.10.0 beats 1.9.0'],
  ['2.0.0', '1.99.99', true, 'a major bump wins'],
  ['1.0.1', '1.0.0', true, 'a patch bump is newer'],
  ['1.0.0', '1.0.0', false, 'the same version is not newer'],
  ['1.0.0', '1.0.1', false, 'an older version is not newer'],
  ['1.0.0', '2.0.0', false, 'a lower major is not newer'],
  ['1.2', '1.2.0', false, 'a missing segment counts as zero'],
  ['1.2.1', '1.2', true, 'and the other way round'],
];

for (const [candidate, current, expected, label] of cases) {
  check(label, updater.isNewer(candidate, current) === expected, `${candidate} vs ${current}`);
}

updater.check({ userAsked: true }).then((result) => {
  check('an unpackaged build reports updates as disabled', result === null);
  check('and says why', updater.state().status === 'disabled', updater.state().reason);

  check('watching is a no-op when unpackaged', updater.watch(() => {}) === undefined);
  check('installing without a download is refused', (() => {
    try {
      updater.install();
      return false;
    } catch {
      return true;
    }
  })());

  done();
});
