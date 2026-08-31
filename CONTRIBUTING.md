# Contributing

## Getting set up

```bash
npm install
npm start        # or npm run dev for renderer logs and devtools
```

Node 20+ and Windows for the Windows build targets. That is the whole setup —
there is no bundler, no watch task, and no code generation step. Edit a file and
restart.

## Before you open a pull request

```bash
npm run check
```

That runs [`build/check-project.js`](build/check-project.js), which is what CI
runs. It verifies every file parses, every `<script>` and `<link>` in the HTML
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
