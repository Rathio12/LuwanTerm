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
[![Tests](https://img.shields.io/badge/tests-196%20passing-22c55e?style=flat-square)](https://github.com/Rathio12/LuwanTerm/tree/main/test)
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

- **Terminals** — tabbed sessions on xterm.js with GPU rendering, a find bar, and copy-on-select.
- **Hosts** — profiles with groups, accent colours, keepalive, and a command to run on connect.
- **Keys** — generate Ed25519 / RSA / ECDSA pairs, use keys you already have, or install a public key on a server for you.
- **PuTTY `.ppk` files work directly** — v2 and v3, every key type, encrypted or not. Read where they live, never converted or rewritten.
- **SFTP** — browse, upload, download whole folders, rename, delete, with live progress and cancellable transfers.
- **Tunnels** — local (`-L`), remote (`-R`), and dynamic SOCKS5 (`-D`) forwarding.
- **Host key pinning** — fingerprints recorded on first use and checked every time, with a loud warning if one changes.
- **Make it yours** — pick from every monospace font you have installed (previewed in its own face), set an accent colour, and put an image behind the interface.
- **Updates itself** — checks GitHub releases, downloads in the background, offers a restart.
- **Secrets in the OS keychain** — never written to disk in the clear. If the platform can't encrypt, nothing is stored at all.

## Try it without installing

The [website](https://rathio12.github.io/LuwanTerm/) has a working copy of the
interface: change the font, the size, the accent and the terminal opacity, and
watch it apply. The font list below it runs the same check the app does to find
what you have installed, then loads the rest from Google Fonts - **click any
font in that list and the demo switches to it.**

## Quick start

```bash
npm install
npm start
```

Or grab a build:

```bash
npm run dist     # installer + portable exe in dist/
```

## Contributing and security

[SECURITY.md](SECURITY.md) is worth a read before trusting this with real
credentials — it is honest about the limits as well as the protections.
[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and house style, and
[CHANGELOG.md](CHANGELOG.md) tracks what changed.

## Documentation

Everything lives in **[guides/](guides/)**:

| Guide | What's in it |
| --- | --- |
| [Getting started](guides/getting-started.md) | First connection, hosts, tabs, shortcuts |
| [SSH keys](guides/keys.md) | Generating, adding your own, `.ppk`, installing on a server |
| [SFTP](guides/sftp.md) | Transferring files, folder downloads, cancelling |
| [Tunnels](guides/tunnels.md) | Local, remote and SOCKS5 forwarding with worked examples |
| [Configuration](guides/configuration.md) | `.env` build settings versus user settings |
| [Building](guides/building.md) | Installer, portable, icon, the build config |
| [Code signing](guides/signing.md) | Why Windows complains and what actually fixes it |
| [Discord presence](guides/discord.md) | Turning it on, and what it does and doesn't reveal |
| [Make it your own](guides/customising.md) | Rebranding, retheming, adding a panel or an IPC call |
| [Architecture](guides/architecture.md) | How the pieces fit, for anyone changing the code |

## Built on

[Electron](https://electronjs.org) · [ssh2](https://github.com/mscdex/ssh2) · [xterm.js](https://xtermjs.org) — no bundler, no framework, plain modules.

## Licence

UNLICENSED — private project.
