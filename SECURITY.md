# Security

[![Report privately](https://img.shields.io/badge/report-privately-ef4444?style=flat-square&logo=github&logoColor=white)](https://github.com/Rathio12/LuwanTerm/security/advisories/new)
![Attack suite](https://img.shields.io/badge/attack%20suite-37%20checks-22c55e?style=flat-square)
![Telemetry](https://img.shields.io/badge/telemetry-none-2B2D31?style=flat-square)
![Sandbox](https://img.shields.io/badge/renderer-sandboxed-7c5cff?style=flat-square)
![Signing](https://img.shields.io/badge/releases-unsigned-f2a33c?style=flat-square)


LuwanTerm holds private keys, passphrases and live connections to machines that
matter. This page says what is defended, what is not, and how to tell somebody
when it goes wrong.

## Reporting a vulnerability

> [!IMPORTANT]
> **Never open a public issue for a security problem**, and never post one in
> Discussions. A public report is a working exploit handed to everyone who reads
> the repository before there is a fix.

**[Open a private security advisory](https://github.com/Rathio12/LuwanTerm/security/advisories/new)**

That is the whole process. It is private to you and the maintainer, it produces
a CVE if one is warranted, and it does not require an email address from either
of us.

**What helps:**

- what you did, in enough detail to repeat it
- what happened, and what should have happened instead
- the version - `LuwanTerm.exe --provenance` prints the exact commit
- whether it needs a hostile server, a hostile file, or only a normal session

**What to expect:** this is one person's project with no support contract and no
response-time commitment. Reports are read and taken seriously. If something is
genuinely exploitable it gets fixed and released quickly, because releases here
are a version bump and a push.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No - update first |

There is no long-term support branch. Fixes go into the next release, and the
app updates itself.

## What is protected

**The window.** Every window runs with `sandbox: true`,
`contextIsolation: true` and `nodeIntegration: false`, under a
`default-src 'none'` Content Security Policy. Navigation is blocked outright and
`window.open` is intercepted. The renderer cannot reach Node, and there is no
`innerHTML` path left in the code for anything to be injected into.

**Credentials.** Passwords and passphrases go to the operating system keystore
through Electron's `safeStorage`, never to a plain file. Private keys are read
from where you already keep them and are never copied, converted or rewritten.

**Host identity.** An unknown or changed host key is shown before anything is
sent, and remembered once accepted. `requireKnownHost` in a
[policy file](guides/enterprise.md) turns an unrecognised key from a prompt into
a refusal.

**What the app talks to.** Two destinations: the SSH servers you asked for, and
GitHub to ask whether there is a newer release. That is enforced by a test that
fails if a `fetch`, an `XMLHttpRequest`, a `WebSocket` or a new socket appears
anywhere in the source. No telemetry, no analytics, no account, no crash
reporting service.

**Hostile input.** An attack suite of 37 checks pushes malformed and malicious
input at every parser and store: file names from a server trying to escape the
download folder, prototype keys in configuration files, truncated JSON, absurd
sizes, and values engineered to forge audit entries. It is verified by putting a
fixed bug back and watching the suite fail.

**The audit log.** Everything written passes a redactor first - passwords,
passphrases, key material and tokens never reach the file, at any nesting depth.

## What is not protected

Being clear about this is worth more than a longer list above.

**The releases are unsigned.** `Get-AuthenticodeSignature` on the published
installer returns `NotSigned`. That is why Windows warns on first run, and it
means you cannot verify the publisher from the file alone. Use the SHA-256 in
the release notes and `--provenance` instead, and see
[antivirus](guides/antivirus.md).

**A user who owns the machine.** Policy files configure *this application* on a
computer its user may well administer. Someone determined can edit the policy,
replace the executable, or use a different SSH client entirely. Policy stops
mistakes and casual circumvention. Controls that survive a hostile user live on
the server: `sshd_config`, certificate authorities, bastion hosts and their own
logs.

**The away screen is a curtain, not a lock.** It hides what is on screen when
you stop typing. It asks for no password and does not pretend to.

**Anything the operating system already gives away.** If malware is running as
you, it can read the same keystore the app reads, and watch the same keyboard.

**Your servers.** This is a client. It does not harden the machines you connect
to, and it cannot tell you that one of them has been compromised.

## Dependencies

Seven runtime dependencies, all MIT, updated by Dependabot weekly for npm.
GitHub Actions are only bumped for major versions - the noise of patch bumps
teaches people to merge without looking.

The security-sensitive surface is deliberately small and deliberately not
hand-rolled: [`ssh2`](https://github.com/mscdex/ssh2) does the protocol and the
crypto. What this project wrote itself is the PuTTY `.ppk` parser and the
OpenSSH key encoder, and both are tested against fixtures that `ssh2` itself
accepts.

## Scope

**In scope:** anything that lets a hostile server, a malicious file, or another
user on the same machine read credentials, run code, escape a chosen directory,
or make the app connect somewhere it should not.

**Out of scope:** the SmartScreen warning (unsigned builds - known, documented),
antivirus false positives (see the guide), and anything requiring the attacker
to already have code execution as you.
