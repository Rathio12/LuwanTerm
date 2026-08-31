'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, check, done } = require('./helpers/harness');

suite('provenance');

const root = path.join(__dirname, '..');
const { markersFrom, normalise } = require(path.join(root, 'build', 'check-copy'));

const sample = `
/**
 * A block comment sentence that is long enough to be worth fingerprinting here.
 */
const x = 1; // short
// A run of line comments that together say something specific about the code.
// It continues onto a second line and finishes the thought properly.
const message = 'The SUID sandbox helper binary was found but is not configured correctly';
const path1 = 'M12 2.6a2 2 0 0 1 2 2v.6l1.4.8.5-.3a2 2 0 0 1 2.7.7l.4.7a2 2 0 0 1-.7 2.7l-.5.3';
const short = 'too short to matter';
`;

const markers = [...markersFrom(sample)];
check('a block comment sentence becomes a marker',
  markers.some((m) => m.includes('long enough to be worth fingerprinting')));
check('a run of line comments becomes a marker',
  markers.some((m) => m.includes('say something specific about the code')));
check('a long string literal becomes a marker',
  markers.some((m) => m.includes('suid sandbox helper binary')));
check('a short comment is ignored', !markers.some((m) => m.includes('short')));
check('a short string is ignored', !markers.some((m) => m === 'too short to matter'));
check('svg path data is not treated as writing',
  !markers.some((m) => m.startsWith('m12 2 6a2')), `${markers.length} markers`);

check('normalising ignores case, punctuation and spacing',
  normalise('The  Quick-Brown, FOX!') === 'the quick brown fox');

const run = (target) => {
  const result = spawnSync(process.execPath, [path.join(root, 'build', 'check-copy.js'), target], {
    cwd: root,
    encoding: 'utf8',
  });
  const matched = /matched (\d+) of (\d+) markers\s+\(([\d.]+)%\)/.exec(result.stdout);
  return {
    output: result.stdout,
    score: matched ? Number(matched[3]) : -1,
    hits: matched ? Number(matched[1]) : -1,
    total: matched ? Number(matched[2]) : -1,
  };
};

const ours = run(path.join(root, 'src'));
check('the fingerprint is substantial', ours.total > 5000, `${ours.total} markers`);
check('our own source matches in the thousands', ours.hits > 1000, `${ours.hits} markers`);
check('it names this as a copy', /verdict: this is a copy/.test(ours.output));

const other = run(path.join(root, 'node_modules', 'ssh2'));
check('unrelated code barely registers', other.hits < 20, `${other.hits} of ${other.total}`);
check('and is not called a copy', !/verdict: this is a copy/.test(other.output));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-copy-'));
const disguise = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      disguise(source, target);
      continue;
    }
    const text = fs.readFileSync(source, 'utf8')
      .replace(/LuwanTerm/g, 'HyperShell')
      .replace(/[Ll]uwan/g, 'hyper')
      .replace(/Rathio12/g, 'someone-else')
      .replace(/^\s*\n/gm, '');
    fs.writeFileSync(target, text);
  }
};
disguise(path.join(root, 'src'), path.join(dir, 'lib'));

const stolen = run(dir);
check('a renamed, reformatted copy is still caught', stolen.hits > 1000, `${stolen.hits} markers`);
check('and is named as one', /verdict: this is a copy/.test(stolen.output));
check('the disguise costs almost nothing', ours.hits - stolen.hits < ours.hits * 0.1,
  `${ours.hits} -> ${stolen.hits}`);
check('so it cannot be defeated by renaming', stolen.hits > other.hits * 50,
  `${stolen.hits} vs ${other.hits} for unrelated code`);

fs.rmSync(dir, { recursive: true, force: true });

const stampScript = path.join(root, 'build', 'make-provenance.js');
const generated = path.join(root, 'src', 'main', 'provenance.generated.json');
const before = fs.existsSync(generated) ? fs.readFileSync(generated, 'utf8') : null;

const stamped = spawnSync(process.execPath, [stampScript], { cwd: root, encoding: 'utf8' });
check('the stamp is written', stamped.status === 0 && fs.existsSync(generated));

const stamp = JSON.parse(fs.readFileSync(generated, 'utf8'));
check('it records the commit', /^[0-9a-f]{40}$/.test(stamp.commit), stamp.commitShort);
check('it records when it was built', !Number.isNaN(Date.parse(stamp.builtAt)));
check('it records where it came from', stamp.origin.startsWith('https://github.com/'));
check('it names the licence', /not for sale/.test(stamp.licence));

spawnSync(process.execPath, [stampScript], { cwd: root, encoding: 'utf8' });
const second = JSON.parse(fs.readFileSync(generated, 'utf8'));
check('every build gets its own id', second.buildId !== stamp.buildId);
check('while the commit stays the same', second.commit === stamp.commit);

if (before !== null) fs.writeFileSync(generated, before);

delete require.cache[require.resolve(path.join(root, 'src', 'main', 'provenance'))];
const provenance = require(path.join(root, 'src', 'main', 'provenance'));
check('the app reads the stamp', provenance.stamped === true);
check('and describes itself in one line', /^LuwanTerm .* from https:/.test(String(provenance)));

const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const testKey = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

const stampWith = (env) => {
  const result = spawnSync(process.execPath, [stampScript], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PROVENANCE_KEY: env },
  });
  return { output: result.stdout + result.stderr, record: JSON.parse(fs.readFileSync(generated, 'utf8')) };
};

const signed = stampWith(testKey);
check('a key produces a signature', typeof signed.record.signature === 'string' && signed.record.signature.length > 40);
check('and the build says it signed one', /signed/.test(signed.output));
check('the source digest is recorded', /^sha256:[0-9a-f]{64}$/.test(signed.record.tree), `${signed.record.files} files`);

const check1 = (record, key) =>
  crypto.verify(
    null,
    Buffer.from(provenance.canonical(record), 'utf8'),
    key,
    Buffer.from(record.signature, 'base64')
  );

check('the signature verifies with the matching key', check1(signed.record, publicKey));

const tampered = { ...signed.record, origin: 'https://github.com/SomeoneElse/ProTerm' };
check('a rebranded record no longer verifies', !check1(tampered, publicKey));

const movedId = { ...signed.record, buildId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
check('a swapped build id no longer verifies', !check1(movedId, publicKey));

const otherKey = crypto.generateKeyPairSync('ed25519');
check(
  'a fork cannot sign as the project',
  !crypto.verify(
    null,
    Buffer.from(provenance.canonical(signed.record), 'utf8'),
    otherKey.publicKey,
    Buffer.from(signed.record.signature, 'base64')
  )
);

check(
  'the signature covers every field it says it does',
  provenance.SIGNED_FIELDS.every((field) => provenance.canonical(signed.record).includes(`${field}=`)),
  provenance.SIGNED_FIELDS.join(', ')
);

const canonicalText = provenance.canonical(signed.record);
check('the canonical form is one line per field',
  canonicalText.split(String.fromCharCode(10)).length === provenance.SIGNED_FIELDS.length);

const unsigned = stampWith('');
check('no key means no signature', unsigned.record.signature === undefined);
check('and the build says so', /no PROVENANCE_KEY/.test(unsigned.output));

const digestRoot = path.join(root, 'src');
const first = provenance.digestTree(digestRoot);
check('the digest is stable across runs', provenance.digestTree(digestRoot).tree === first.tree);
check('it covers the whole of src', first.files > 40, `${first.files} files`);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-digest-'));
fs.writeFileSync(path.join(scratch, 'a.js'), 'const a = 1;\n');
fs.writeFileSync(path.join(scratch, 'b.js'), 'const b = 2;\n');
const base = provenance.digestTree(scratch);

fs.writeFileSync(path.join(scratch, 'b.js'), 'const b = 3;\n');
check('changing a byte changes the digest', provenance.digestTree(scratch).tree !== base.tree);

fs.writeFileSync(path.join(scratch, 'b.js'), 'const b = 2;\n');
check('and putting it back restores it', provenance.digestTree(scratch).tree === base.tree);

fs.writeFileSync(path.join(scratch, 'c.generated.json'), '{"x":1}\n');
check('a generated file is left out', provenance.digestTree(scratch).tree === base.tree);

fs.rmSync(scratch, { recursive: true, force: true });

if (before !== null) fs.writeFileSync(generated, before);
else fs.rmSync(generated, { force: true });

done();
