# LuwanTerm documentation

Start here. Each guide stands on its own — read the one you need.

## Using it

| Guide | What's in it |
| --- | --- |
| [Getting started](getting-started.md) | Your first connection, host profiles, tabs, keyboard shortcuts |
| [SSH keys](keys.md) | Generating keys, using ones you already have, `.ppk` files, installing a key on a server |
| [SFTP](sftp.md) | Browsing, uploading, downloading folders, cancelling a transfer |
| [Tunnels](tunnels.md) | Local, remote and SOCKS5 forwarding, with worked examples |
| [Plugins](plugins.md) | Panels you describe in a JSON file, and why they are not code |
| [Discord presence](discord.md) | Turning it on and what it reveals |
| [Configuration](configuration.md) | `.env` build settings versus user settings |
| [Deploying to a fleet](enterprise.md) | Policy files, the audit log, and what they do not cover |
| [Fonts](../fonts/README.md) | The 193 families the picker offers |

## Building and shipping

| Guide | What's in it |
| --- | --- |
| [Building](building.md) | Installer and portable builds, the icon, build config |
| [Code signing](signing.md) | Why Windows warns, and what genuinely fixes it |
| [Antivirus](antivirus.md) | Why a scanner may flag it, and how to check for yourself |
| [Releasing](releasing.md) | Cutting a version, what gets attached, and the secrets it reads |

## The project

| File | What's in it |
| --- | --- |
| [Security](../SECURITY.md) | What is protected, what is not, and how to report a problem |
| [Contributing](../CONTRIBUTING.md) | Setup, the checks, and the house style |
| [Support](../SUPPORT.md) | Where to ask, where to report, and what this project does not promise |
| [Licence](licence.md) | What you may and may not do with it, in plain English |
| [Roadmap](roadmap.md) | What 2.0 is for, and what is deliberately not planned |
| [Provenance](provenance.md) | How a build identifies itself, and how to spot a copy |
| [Changelog](../CHANGELOG.md) | What changed in each release |

## Changing it

| Guide | What's in it |
| --- | --- |
| [Make it your own](customising.md) | Rename it, retheme it, add a sidebar panel or an IPC call |
| [Architecture](architecture.md) | How main, preload and renderer fit together |

## Where your data lives

Nothing is stored in the project folder. Everything sits in Electron's
`userData` directory:

```
%APPDATA%\LuwanTerm\
  hosts.json         host profiles
  keys.json          key records (paths for linked keys, metadata for generated ones)
  keys\              private keys this app generated, owner-only permissions
  snippets.json      saved commands
  settings.json      preferences
  known-hosts.json   pinned host fingerprints
  plugins\           panel descriptions, one JSON file each
  vault.dat          passwords and passphrases, encrypted by the OS keychain
```

Deleting that folder resets the app completely. `vault.dat` is useless on
another machine or user account — the OS keychain holds the actual key.
