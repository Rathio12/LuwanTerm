'use strict';

/**
 * The smallest thing that can be called a test harness: a name, a list of
 * checks, and an exit code. No dependency, no watch mode, no configuration.
 */

const checks = [];
let suiteName = 'suite';

function suite(name) {
  suiteName = name;
}

/**
 * @param {string} label what is being asserted, phrased as a fact
 * @param {boolean} passed
 * @param {string} [detail] shown either way, so a pass can still be informative
 */
function check(label, passed, detail = '') {
  checks.push({ label, passed: Boolean(passed), detail });
  const mark = passed ? 'ok  ' : 'FAIL';
  console.log(`  ${mark} ${label}${detail ? ` :: ${detail}` : ''}`);
}

/** Asserts that `fn` throws, optionally matching a predicate on the error. */
function throws(label, fn, matches) {
  try {
    fn();
    check(label, false, 'it did not throw');
  } catch (err) {
    check(label, matches ? Boolean(matches(err)) : true, err.message);
  }
}

async function rejects(label, promise, matches) {
  try {
    await promise;
    check(label, false, 'it resolved');
  } catch (err) {
    check(label, matches ? Boolean(matches(err)) : true, err.message);
  }
}

function done() {
  const failed = checks.filter((c) => !c.passed).length;
  console.log(`SUMMARY ${suiteName} ${checks.length - failed} ${failed}`);
  process.exit(failed ? 1 : 0);
}

module.exports = { suite, check, throws, rejects, done };
