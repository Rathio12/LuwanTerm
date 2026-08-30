# Security

LuwanTerm holds SSH credentials and opens shells on remote machines, so its
security properties matter more than most desktop apps. This is what it does,
what it does not do, and how to report a problem.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's [private vulnerability reporting](https://github.com/Rathio12/LuwanTerm/security/advisories/new),
or email <david.neeon18@gmail.com> with `LuwanTerm security` in the subject.

Please include what you were doing, what happened, and how to reproduce it. A
proof of concept helps enormously. You will get an acknowledgement, and a fix or
an explanation of why it is not a problem.

This is a personal project, not a funded one: expect a best-effort response
rather than an SLA, and there is no bounty.

## What is protected

| Area | How |
| --- | --- |
| Passwords and passphrases | Encrypted by the OS keychain through Electron `safeStorage`. If the platform cannot encrypt, **nothing is written** and you are asked on every connect |
| Server identity | Host keys are pinned on first use and checked on every connection. A changed fingerprint stops the connection and warns loudly |
| Private keys | Generated keys are written owner-only. Keys you already have are read where they are and **never rewritten**, converted, or copied unless you ask |
| `.ppk` passphrases | Used to decrypt in memory at connect time, never handed to the SSH layer or written anywhere |
| The renderer | Sandboxed, context-isolated, no Node integration. Every privileged action crosses a narrow preload bridge |
| Page content | A strict CSP, navigation blocked, external links handed to the system browser |
| Telemetry | There is none. The app talks to your servers, to GitHub for update checks, and to a local Discord socket if you leave presence on |

## What is not protected

Being straight about the limits is more useful than a longer list of features.

- **An attacker with your unlocked user account can read your keys.** The
  keychain protects data at rest against another account or a stolen disk, not
  against code running as you.
- **`vault.dat` is only as strong as your OS account.** It is useless on another
  machine, but not a substitute for full-disk encryption.
- **Discord Rich Presence is a disclosure channel.** Host names are off by
  default for that reason. Turn them on and anyone who can see your profile can
  see which machines you are on.
- **A background image is inlined into the window.** Do not use one containing
  anything sensitive.
- **Releases are signed with a self-signed certificate**, which proves builds
  come from the same key but is not a trusted-CA signature. See
  [docs/signing.md](docs/signing.md).
- **The app has not been audited**, and has not yet been exercised against a
  wide range of real SSH servers.

## Dependencies

The runtime surface is deliberately small: `ssh2` for the protocol, `xterm.js`
for the terminal, `electron-updater` for updates. PuTTY `.ppk` parsing, the
SOCKS5 proxy, the SSH wire codec, Discord Rich Presence and the icon generator
are all first-party, which keeps the dependency tree short but means bugs in
them are ours. They are covered by the test suites described in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Scope

In scope: anything that leaks credentials or key material, defeats host key
verification, executes code from a remote host, or escapes the renderer sandbox.

Out of scope: needing local administrator access, physical access to an unlocked
machine, or social engineering of the person using the app.
