# Contributing

![CLA](https://img.shields.io/badge/CLA-none%20required-22c55e?style=flat-square)
![Copyright](https://img.shields.io/badge/copyright-stays%20yours-22c55e?style=flat-square)
![Node](https://img.shields.io/badge/node-24+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
[![PRs](https://img.shields.io/badge/pull%20requests-welcome-7c5cff?style=flat-square)](https://github.com/Rathio12/LuwanTerm/pulls) <!-- tests -->![Tests](https://img.shields.io/badge/tests-595%20passing-22c55e?style=flat-square)<!-- /tests -->

Pull requests are welcome. So are bug reports, and so is telling me something is
badly designed.

> [!NOTE]
> **No CLA, no copyright assignment.** You keep the copyright in what you write.
> By opening a pull request you license it under the [licence](LICENSE) everyone
> else gets it under, and confirm it is yours to give. That is the whole
> arrangement - see section 10 of the licence.

## Before you start

**Small things** - a typo, a broken link, an obviously wrong string - just send
the patch.

**Anything larger**, open an issue or a
[discussion](https://github.com/Rathio12/LuwanTerm/discussions) first. Not for
permission, but because it is miserable to write something for a week and find
out it conflicts with a plan you could not see. The
[roadmap](guides/roadmap.md) says where things are going, including what is
deliberately *not* planned.

## Getting set up

```bash
npm install
npm start        # or npm run dev for renderer logs and devtools
```

**Node 24 or newer**, and Windows for the Windows build targets. Node 24 is
not arbitrary: encrypted PuTTY v3 keys need `crypto.argon2Sync`, which
arrived in 24, and it is the version Electron 44 bundles - so the tests run
on the same runtime as the app. That is the whole setup —
there is no bundler, no watch task, and no code generation step. Edit a file and
restart.

## Before you open a pull request

```bash
npm run check
```

That runs [`build/check-project.js`](build/check-project.js) and then the test
suites, which is what CI runs. It verifies every file parses, every `<script>` and `<link>` in the HTML
resolves, everything the renderer loads is a real dependency, documentation
links are not broken, and no signing material has been committed.

If you touched the crypto or key handling, run the suites too — they cover the
PuTTY parser, the OpenSSH encoder, key generation and discovery, and they are
the reason those parts can be trusted.

## House style

The point of these is consistency, not ceremony.

- **No `//` comments.** Explanation goes in JSDoc blocks or in `guides/`.
  `node build/strip-comments.js` removes any that creep in (`--dry` previews).
- **Comments explain *why*, not *what*.** If a line needs a comment to say what
  it does, rename something instead.
- **No bundler, no framework.** Renderer modules are plain scripts in an IIFE
  attaching to `window.App`, listed in `index.html` in load order.
- **Errors are for humans.** `throw new Error('Port must be between 1 and 65535.')`,
  not an error code.
- **Optional things fail quietly.** Discord, WebGL, the OS keychain and the
  updater all degrade instead of breaking the app.
- **Never touch a user's files.** The app deletes only what it created, and
  never rewrites a key.

[guides/architecture.md](guides/architecture.md) explains how the pieces fit, and
[guides/customising.md](guides/customising.md) has worked examples of adding a panel,
an IPC call or a setting — plus the gotchas that will bite you.

## Tests

**A test that cannot fail is not a test.** The rule here is that a new check
must be shown to fail against the broken behaviour before it is trusted -
delete the fix, watch it go red, put the fix back. Several checks in this
repository exist because doing that revealed they were asserting nothing.

Three layers, and they answer different questions:

| | What it proves |
| --- | --- |
| `npm test` | Every parser, store, the policy layer, the updater and the attack suite |
| `npm run check-site` | The published page really works, driven in an Electron window |
| `node build/check-app.js` | The app boots and its interface behaves, over the DevTools protocol |

The last one stays out of CI because its results depend on which fonts the
machine has and whether Discord is running. Run it before anything you care
about.

Prefer a test that drives the real thing over one that asserts a shape. Several
bugs here shipped with green suites: a settings regex that matched nothing, an
update prompt drawn underneath the splash, a panel holding a session id that no
longer existed. Every one of them passed its unit tests and failed the moment
something opened a window.

## Commits

Explain why the change was needed, not just what changed. If you fixed a bug,
say what the symptom was — that is what someone reads the history for later.

## Releasing

Maintainers only:

```bash
npm version 1.3.0 --no-git-tag-version
git commit -am "Release 1.3.0"
git push
```

Pushing a version that has no release yet builds, tags and publishes it. See
[guides/building.md](guides/building.md).

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md)
explains how to report one privately.

## Licensing of contributions

There is **no CLA and no copyright assignment**. You keep the copyright in what
you write.

By opening a pull request you license your contribution under the
[LuwanTerm Licence](LICENSE) — the same terms everyone else gets it under — and
you confirm it is yours to give: that you wrote it, or otherwise have the right
to submit it.

The licence is source-available rather than OSI open source: free to use
anywhere including at work, free to fork and republish, but **not for sale**,
and not for use against people. [guides/licence.md](guides/licence.md) explains
what that means in practice. If a contribution would only make sense under
different terms, say so in the pull request rather than leaving it implicit.
