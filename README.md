<div align="center">

<img src="guides/images/icon.png" width="88" alt="LuwanTerm">

# LuwanTerm

A clean SSH client for Windows — tabbed terminals, SFTP, and port forwarding in one window.

<!-- badges -->
![Electron](https://img.shields.io/badge/electron-44%2B-2B2D31?style=flat-square&logo=electron&logoColor=white)
![Node](https://img.shields.io/badge/node-24%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![ssh2](https://img.shields.io/badge/ssh2-1.17.0-7c5cff?style=flat-square)
![Terminal](https://img.shields.io/badge/terminal-xterm.js-57F287?style=flat-square)
![PuTTY](https://img.shields.io/badge/PuTTY%20.ppk-v2%20%2B%20v3-5865F2?style=flat-square)
![Sessions](https://img.shields.io/badge/sessions-unlimited-2B2D31?style=flat-square)
[![Licence](https://img.shields.io/badge/licence-source--available%2C%20not%20for%20sale-f2a33c?style=flat-square)](https://github.com/Rathio12/LuwanTerm/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-568%20passing-22c55e?style=flat-square)](https://github.com/Rathio12/LuwanTerm/tree/main/test)
[![Lines of Code](https://img.shields.io/endpoint?url=https%3A%2F%2Fghloc.vercel.app%2Fapi%2FRathio12%2FLuwanTerm%2Fbadge&style=flat-square&color=7c5cff)](https://github.com/Rathio12/LuwanTerm)
[![Release](https://img.shields.io/github/v/release/Rathio12/LuwanTerm?style=flat-square&label=release&color=3ea8ff)](https://github.com/Rathio12/LuwanTerm/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Rathio12/LuwanTerm/total?style=flat-square&color=f2a33c)](https://github.com/Rathio12/LuwanTerm/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/Rathio12/LuwanTerm/ci.yml?style=flat-square&label=CI&branch=main)](https://github.com/Rathio12/LuwanTerm/actions/workflows/ci.yml)
<!-- /badges -->


</div>

<div align="center">
  <img src="guides/images/app.png" width="820" alt="LuwanTerm main window">
</div>

## What it does

A terminal, a file browser and a tunnel manager in one window, for people who
live in SSH sessions all day.

> [!NOTE]
> Windows only for now. It is an Electron app, so nothing stops it building on
> macOS or Linux - the installer, the signing and the testing are simply not
> there yet.

### Connecting

- **Tabbed sessions.** As many as you like, to as many hosts as you like. No cap,
  no account, no sign-in.
- **Keys that already exist.** OpenSSH keys, PuTTY `.ppk` files - both v2 and v3,
  including encrypted ones - and whatever your SSH agent is holding. Nothing is
  converted or rewritten; your files are read where they are.
- **Key generation.** Ed25519, ECDSA and RSA, with the public half installable on
  a server in one step.
- **Jump hosts.** Reach a machine with no direct route, the way `ProxyJump` does.
- **Host key verification.** Unknown and changed keys are shown before anything
  is sent, and remembered afterwards.
- **Auto-reconnect.** A session that drops on its own comes back. One you closed
  stays closed.

### Working

- **SFTP built in.** Browse, upload, download whole folders, rename, delete,
  change permissions, and cancel a transfer that is taking too long.
- **Port forwarding.** Local, remote and SOCKS5, managed from a panel rather than
  remembered as flags.
- **Live server stats.** CPU, memory, swap, uptime, load and a network graph -
  streamed from one channel, not polled.
- **Plugins.** A panel you describe in a small JSON file - a command, and the
  shape of its output. `docker ps`, `systemctl --failed`, `df -h`, `who`. They
  are data, never code, and the command is shown before you switch one on.
- **Snippets.** Commands you type often, one click away.
- **Session logging.** A readable transcript per session, with escape sequences
  stripped.

### Looking after itself

- **Updates that ask.** It checks GitHub, tells you what is available, and waits
  for an answer. Nothing installs behind your back.
- **Policy files and an audit log.** For deploying to more than one machine -
  see [Deploying to a fleet](guides/enterprise.md).
- **An away screen.** Hides your terminal behind your own background image when
  you stop typing, and closes idle sessions after a while.

### Making it yours

Every monospace font on your machine with a live preview, seven accent colours
or a custom one, a background image with opacity and blur, and terminal opacity
on top. The [font catalogue](fonts/README.md) knows 193 families.

## Try it without installing

The [website](https://rathio12.github.io/LuwanTerm/) has a working copy of the
interface: change the font, the size, the accent and the terminal opacity, and
watch it apply. The font list below it runs the same check the app does to find
what you have installed, then loads the rest from Google Fonts - **click any
font in that list and the demo switches to it.**

## Getting it

<table>
<tr>
<td width="50%">

**Installer**

[**Download the latest release**](https://github.com/Rathio12/LuwanTerm/releases/latest)

Start Menu entry, desktop shortcut, and it updates itself from then on.

</td>
<td width="50%">

**Portable**

Same page, the `-portable.exe` file.

One file, nothing installed, nothing written outside its own folder. It cannot
update itself - download a newer one when you want it.

</td>
</tr>
</table>

> [!TIP]
> Every release lists a SHA-256 for both files. `Get-FileHash .\LuwanTerm-setup.exe -Algorithm SHA256`
> tells you whether what you downloaded is what was published.

### Running from source

```bash
git clone https://github.com/Rathio12/LuwanTerm.git
cd LuwanTerm
npm install
npm start
```

Needs **Node 24 or newer**. That is not arbitrary: encrypted PuTTY v3 keys need
`crypto.argon2Sync`, which arrived in 24, and it is the version Electron 44
bundles - so the tests run on the same runtime the app does.

There is no bundler, no watch task and no code generation. Edit a file, restart.

```bash
npm start          # run it
npm test           # the full suite, including the attack checks
npm run check      # the checks CI runs
npm run dist       # build the installer and the portable exe
```

## Windows will warn on first run

> [!WARNING]
> You will see **"Windows protected your PC"**. Click **More info**, then
> **Run anyway**.

That is SmartScreen, and it is not a virus scanner - it never looks inside the
file. It asks whether the app is signed by a publisher Windows trusts and
whether many machines have run it already, and warns when both answers are no.
A release published an hour ago, signed by nobody, answers no twice.

Which is why a clean VirusTotal result and a SmartScreen warning are not a
contradiction: they are unrelated systems answering unrelated questions.

It goes away when a code-signing certificate is bought, or when enough people
have downloaded a release for it to build a reputation. Nothing else removes it,
and [the full explanation](guides/antivirus.md) does not pretend otherwise -
including why obfuscating the binary to dodge detection is not on the table.

Meanwhile you can check what you downloaded is what was published: the SHA-256
is in the release notes, and `LuwanTerm.exe --provenance` names the exact commit
the binary was built from.

## Supporting it

LuwanTerm is free and always will be - the [licence](LICENSE) forbids selling
it, and that is deliberate.

**[ko-fi.com/derechtealec](https://ko-fi.com/derechtealec)**

If you like what this is, and you feel like it, that is there. If you do not,
use the app anyway - it is the same app either way. Nothing is gated, no
feature waits behind it, and it will never ask you twice. A star on the
repository means just as much, and costs nothing.

## Getting help

Questions go to **[Discussions](https://github.com/Rathio12/LuwanTerm/discussions)**,
bugs to [issues](https://github.com/Rathio12/LuwanTerm/issues/new/choose), and
anything security-related [privately](https://github.com/Rathio12/LuwanTerm/security/advisories/new)
rather than in public. [SUPPORT.md](SUPPORT.md) says which is which, and what
this project does and does not promise.

## Contributing

Pull requests are welcome, and there is **no CLA and no copyright assignment** -
you keep the copyright in what you write.

```bash
npm run check      # what CI runs: the project checks, then the suites
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the setup, the house style, and what
the checks expect. The short version: no bundler, no framework, comments are
stripped from the source, and a test that cannot fail is not a test.

## Security

> [!IMPORTANT]
> Found a vulnerability? **Do not open a public issue.**
> [Report it privately](https://github.com/Rathio12/LuwanTerm/security/advisories/new).

This is an SSH client. It holds private keys and connects to production
machines, so it is treated accordingly:

- **`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`** on every
  window, with a `default-src 'none'` CSP and navigation blocked
- **Credentials in the OS keystore** through `safeStorage`, never in plain files
- **Two outbound destinations only** - the servers you asked for, and GitHub for
  the update check. A test fails if a third ever appears
- **An attack suite** that pushes hostile input where it can actually
  arrive: a server you connected to, a file somebody else wrote, a value crossing
  IPC
- **No telemetry, no analytics, no account**

[SECURITY.md](SECURITY.md) is honest about the limits as well as the
protections.

## Documentation

Everything lives in **[guides/](guides/)**. Each stands on its own.

<details>
<summary><b>Using it</b></summary>

| Guide | What is in it |
| --- | --- |
| [Getting started](guides/getting-started.md) | First connection, host profiles, tabs, shortcuts |
| [SSH keys](guides/keys.md) | Generating, adding your own, `.ppk`, installing on a server |
| [SFTP](guides/sftp.md) | Transfers, folder downloads, cancelling |
| [Tunnels](guides/tunnels.md) | Local, remote and SOCKS5, with worked examples |
| [Plugins](guides/plugins.md) | Describing a panel in JSON, and why plugins are not code |
| [Customising](guides/customising.md) | Fonts, colours, background, and rebranding a fork |
| [Discord presence](guides/discord.md) | Turning it on, and what it does and does not reveal |

</details>

<details>
<summary><b>Running it somewhere serious</b></summary>

| Guide | What is in it |
| --- | --- |
| [Deploying to a fleet](guides/enterprise.md) | Policy files, the audit log, and what they do not cover |
| [Configuration](guides/configuration.md) | Build settings versus user settings |
| [Provenance](guides/provenance.md) | Proving a binary is the one that was published |
| [Antivirus](guides/antivirus.md) | Why a scanner may flag it, and how to check for yourself |

</details>

<details>
<summary><b>Working on it</b></summary>

| Guide | What is in it |
| --- | --- |
| [Architecture](guides/architecture.md) | How the pieces fit, for anyone changing the code |
| [Building](guides/building.md) | Installer, portable, icon, build config |
| [Releasing](guides/releasing.md) | Cutting a version, and the secrets it reads |
| [Code signing](guides/signing.md) | Why Windows complains and what actually fixes it |
| [Roadmap](guides/roadmap.md) | What 2.0 is for, and what is deliberately not planned |
| [Licence](guides/licence.md) | What you may and may not do, in plain English |

</details>

## Built on

[Electron](https://electronjs.org) · [ssh2](https://github.com/mscdex/ssh2) · [xterm.js](https://xtermjs.org) — no bundler, no framework, plain modules.

## Licence

[**LuwanTerm Licence 1.0**](LICENSE) — source-available, free to use, not for
sale. In short:

| | |
| --- | --- |
| Use it anywhere, including at work or for a client | **Yes** |
| Read, fork, modify and republish it | **Yes** |
| Contribute, and keep the copyright in what you wrote | **Yes** |
| Sell it, or a paid product, service or support built on it | **No** |
| Use it to break into systems, surveil or harass people | **No** |

Being paid for your own work is fine — a consultant using LuwanTerm on a
client's servers is paid for the setup, not for LuwanTerm. Charging that client
*for LuwanTerm* is what the licence forbids.

This is deliberately **source-available rather than OSI open source**: an
OSI-approved licence cannot restrict what you use the software for, and these
restrictions are the point. Everything is public and forkable — it is just not
for sale. See [the licence guide](guides/licence.md) for what that means in
practice.
