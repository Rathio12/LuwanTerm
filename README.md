# LuwanTerm

A clean SSH client: tabbed terminals, an SFTP browser, and port forwarding, in one
Electron desktop app.

## Features

- **Terminals** - tabbed sessions on xterm.js with GPU rendering, search, and
  copy-on-select. Each tab keeps its own scrollback and pty size.
- **Host profiles** - name, group, accent colour, keepalive, a command to run on
  connect, and a default SFTP path per host.
- **Authentication** - password, private key, or SSH agent
  (`openssh-ssh-agent` pipe / Pageant on Windows, `SSH_AUTH_SOCK` elsewhere).
  Keyboard-interactive challenges such as one-time codes are prompted for.
- **Keys** - generate Ed25519 / RSA / ECDSA pairs, add keys you already have, copy
  a public key, or install one on a server (the `ssh-copy-id` job, done for you and
  safe to repeat). The add button can also scan the usual places on this PC and
  offer what it finds - nothing is taken without you picking it.
- **PuTTY `.ppk` files work directly** - versions 2 and 3, every key type, encrypted
  or not. Files are read where they live and are never rewritten or converted on
  disk; a `.ppk` stays a `.ppk`.
- **Host key verification** - fingerprints are recorded on first use and checked
  on every connect, with an explicit warning when a key changes.
- **Secret storage** - passwords and passphrases are encrypted by the OS keychain
  through Electron `safeStorage`. If the platform cannot encrypt, nothing is
  written to disk and you are asked each time.
- **SFTP** - browse, upload, download, rename, delete (recursive), and create
  folders, with live transfer progress.
- **Tunnels** - local (`-L`), remote (`-R`), and dynamic SOCKS5 (`-D`) forwarding,
  with a live connection count per tunnel.
- **Snippets** - saved commands you can send to the focused session.
- **Discord Rich Presence** - optional, off by default. Shows a session count,
  not host names, unless you explicitly ask for those.
- **Splash on launch** - a small window appears immediately and is replaced by
  the app once the renderer has finished loading, so startup is never a blank
  screen. It gives up and shows the window anyway after 8 seconds.

## Running it

```bash
npm install
npm start        # or: npm run dev  (renderer console logs + devtools)
```

Build for Windows - produces both an installer and a single-file portable exe
in `dist/`:

```bash
npm run dist
```

| Output | What it is |
| --- | --- |
| `LuwanTerm-1.0.0-setup.exe` | Installer. Per-user, lets you choose the folder, makes shortcuts. |
| `LuwanTerm-1.0.0-portable.exe` | Single file, runs with no installation. |

Use `npm run dist:signed` instead to sign them - see
[Windows warnings on first run](#windows-warnings-on-first-run).

`npm run make-icon` regenerates `build/icon.ico` (it is drawn in code, so the
build needs no image tooling).

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle sessions |
| `Alt+1` … `Alt+9` | Jump to session |
| `Ctrl+Shift+W` | Close session |
| `Ctrl+Shift+N` | New host |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copy / paste |
| `Ctrl+Shift+F` | Find in terminal |
| Right click | Paste |

## Layout

```
src/
  main/
    main.js            app lifecycle and single-instance lock
    window.js          frameless BrowserWindow
    preload.js         contextBridge API (window.term)
    paths.js           userData file locations
    ipc/               one module per IPC surface, uniform {ok,data,error} envelope
    ssh/
      connection.js    ssh2 client, auth, host-key verification
      session.js       one tab: shell + sftp + tunnels over one connection
      manager.js       session registry and renderer prompt bridge
      sftp.js          SFTP operations, cancellable transfers
      ppk.js           PuTTY .ppk reader (v2 and v3)
      openssh-key.js   in-memory OpenSSH key encoder
      wire.js          SSH binary wire codec
      keygen.js        key generation and inspection
      discovery.js     finds keys already on this machine
      tunnels.js       local / remote / dynamic forwarding
      socks5.js        SOCKS5 CONNECT for dynamic forwards
      fingerprint.js   OpenSSH-style SHA256 fingerprints
    store/             hosts, snippets, settings, known hosts, secret vault
  renderer/
    index.html         markup and icon sprite
    splash.html        startup window
    styles/            tokens.css -> base.css -> app.css
    js/                one module per surface, namespaced under window.App
```

Configuration lives in Electron's `userData` directory: `hosts.json`,
`snippets.json`, `settings.json`, `known-hosts.json`, and the encrypted
`vault.dat`.

## Windows warnings on first run

Windows shows "Windows protected your PC" for two separate reasons, and it helps
to know which one you are hitting:

1. **Mark of the Web** - anything downloaded from a browser or chat app is tagged
   as internet-sourced. This is what triggers the SmartScreen prompt most of the
   time, and it applies to signed apps too.
2. **No trusted signature** - the app is not signed by a certificate Windows
   already trusts, so the publisher shows as unknown.

### Clearing the download mark

Nothing to install; this is usually all you need:

```powershell
Unblock-File .\LuwanTerm-1.0.0-setup.exe
```

Or right-click the file, Properties, tick **Unblock**, Apply. Files you build
yourself never get this mark, so a local `npm run dist` is unaffected.

### Signing with your own certificate

This gives the app a stable publisher identity and makes it a trusted, known
publisher on machines that trust the certificate.

```powershell
npm run make-cert     # once - creates build/certs/ (git-ignored)
npm run dist:signed   # build signed installer + portable
npm run trust-cert    # once per machine, in an ADMIN PowerShell
```

`trust-cert` adds the certificate to the machine's Trusted Root and Trusted
Publishers stores. That is a genuine change to what the machine trusts, so only
run it for a certificate you generated yourself. To undo it:

```powershell
powershell -File build/trust-cert.ps1 -Remove
```

**Be clear about what this does and does not do.** On machines that have run
`trust-cert`, the signature validates and the publisher shows as LuwanIO. On any
other machine the certificate is not trusted, so SmartScreen behaves exactly as
it does for an unsigned build. A self-signed certificate cannot change that.

### If you need it to be clean for everyone

There is no free publicly-trusted code signing certificate. The real options are:

| Route | Cost | Notes |
| --- | --- | --- |
| Certum open source | ~EUR 30/yr | Works for individuals, including in the EU. Requires ID verification. |
| Azure Trusted Signing | cheap, monthly | Microsoft's service. Individual accounts are US/Canada only; EU needs a registered organisation. |
| SignPath Foundation | free | Genuinely free, but only for open-source projects, and the certificate is issued to SignPath. |
| Microsoft Store (MSIX) | free | Microsoft signs it for you. Needs Store onboarding and review. |

`build/dist-signed.js` reads `CSC_LINK` and `CSC_KEY_PASSWORD`, so a real
certificate drops straight in with no other changes.

## Discord Rich Presence

Off out of the box, and inert until you supply your own application id.

1. Create an application at <https://discord.com/developers/applications> and copy
   its **Application ID**. Upload an image named `icon` under Rich Presence assets
   if you want artwork.
2. Settings, tick **Show LuwanTerm on your Discord profile**, paste the id.

By default it shows `LuwanTerm - 3 sessions`. **It deliberately does not show host
names**, because an SSH client announcing which machines you are logged into is a
genuine leak - Discord sees it, and so does anyone who can view your profile.
There is a separate tick box if you want host names anyway.

Implemented directly against Discord's IPC protocol in
[discord.js](src/main/discord.js), so there is no dependency on the unmaintained
`discord-rpc` package. If Discord is closed or never installed, the whole thing
silently does nothing.

## Keys on disk

Keys reach the app three ways, and the difference matters:

- **Found** - the add-key button can scan `~/.ssh` and PuTTY's saved sessions and
  show you what it finds. **Nothing is added automatically**; you tick what you
  want, and the files are used straight from where they are.
- **Added** - a file you point at. By default it is *linked*, meaning the app
  remembers the path and reads it in place, so you can use as many existing key
  files as you like without moving any of them. Tick "Copy into LuwanTerm" if you
  would rather it took its own copy.
- **Generated** - created by the app, written into its data folder with
  owner-only permissions.

Removing a linked or generated key never touches a file the app did not create.

## Security notes

- The renderer runs sandboxed with context isolation and no Node integration;
  every privileged action crosses the preload bridge.
- A strict CSP is set in `index.html`, navigation is blocked, and external links
  open in the system browser.
- Host keys are pinned on first use. A changed fingerprint stops the connection
  until you accept it explicitly.
- `vault.dat` holds only what the OS keychain encrypted; it is written with mode
  `0600` and is useless on another machine or account.
- A `.ppk` passphrase is used to decrypt the key in memory at connect time and is
  never handed to the SSH layer or written anywhere.
- Generated keys are verified before being stored: `ssh2` 1.17 drops a leading
  zero byte from roughly one Ed25519 public key in 256, producing a key nothing
  can read back, so `keygen.js` checks each pair and discards a bad draw.
