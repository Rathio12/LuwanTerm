# Architecture

Three processes, one rule: **the renderer is untrusted and can only reach the
system through the preload bridge.**

```
main process                preload              renderer
------------                -------              --------
ssh2, filesystem,   <-->    window.term   <-->   xterm.js, DOM
keychain, dialogs           (contextBridge)      window.App.*
```

The renderer runs sandboxed, with context isolation on and Node integration off.
Navigation is blocked and external links open in the system browser.

## Layout

```
src/
  main/
    main.js            lifecycle, single-instance lock, splash, Discord presence
    window.js          BrowserWindow creation
    preload.js         the entire renderer-facing API
    paths.js           userData file locations
    ipc/               one module per surface; uniform {ok,data,error} envelope
    ssh/
      connection.js    ssh2 client, auth, host-key verification
      session.js       one tab: shell + sftp + tunnels on one connection
      manager.js       session registry, prompt bridge, key deployment
      sftp.js          SFTP operations and cancellable transfers
      tunnels.js       local / remote / dynamic forwarding
      socks5.js        SOCKS5 CONNECT, for dynamic forwards
      ppk.js           PuTTY .ppk reader (v2 and v3)
      openssh-key.js   in-memory OpenSSH key encoder
      wire.js          SSH binary wire codec
      keygen.js        key generation, inspection, auth material
      discovery.js     finds keys already on this machine
      fingerprint.js   OpenSSH-style SHA256 fingerprints
    store/             hosts, keys, snippets, settings, known hosts, vault
    discord.js         Rich Presence over Discord's IPC socket
  renderer/
    index.html         markup and the icon sprite
    splash.html        startup window
    styles/            tokens.css -> base.css -> app.css
    js/                one module per surface, namespaced under window.App
```

## How a connection happens

1. Renderer calls `window.term.ssh.connect(hostId, size)`.
2. `manager.create()` looks up the profile and resolves credentials — from the
   vault, or by asking the renderer through the prompt bridge.
3. `SshConnection.connect()` dials, and `hostVerifier` checks the server's
   fingerprint against `known-hosts.json`, prompting if it's new or changed.
4. On success a `Session` opens a shell channel and starts streaming.
5. The renderer creates an xterm instance and flushes any output that arrived
   before it existed.

Output that arrives before the terminal is mounted is buffered in
`sessions.pending` — the shell opens (and any connect command runs) before the
connect promise resolves, so this window is real.

## The prompt bridge

Passwords, host-key trust and 2FA challenges all need a human, but they arise
deep inside the main process. `manager.ask()` sends a request with an id, parks
a promise, and the renderer answers via `ssh:prompt-response`. Prompts time out
after three minutes so nothing hangs forever.

## The IPC envelope

Every handler goes through `ipc/helpers.js`:

```js
{ ok: true,  data: <result> }
{ ok: false, error: '<message>' }
```

Preload unwraps it and throws a real `Error`, so renderer code uses ordinary
`try/catch` and gets readable messages instead of Electron's
"Error invoking remote method" wrapper.

## Key material

Three sources — generated (in the app's folder), linked (a path the app
remembers), and discovered (found by an explicit scan). They resolve through the
same `keys.privateKey(id)`, which reads whatever file backs that id.

`keygen.loadForAuth()` is the single point where material becomes something
`ssh2` can use. A `.ppk` is decoded in memory there and its passphrase consumed;
everything else passes straight through. **No key file is ever rewritten.**

## Renderer modules

Plain scripts, loaded in order, each an IIFE attaching to `window.App`. Load
order matters: `dom` → `toast` → `modal` → `state` → feature modules → `app.js`,
which boots everything on `DOMContentLoaded`.

State lives in `App.state` with a small pub/sub. There's no reactivity — modules
call their own `render()` when something changes.

## Why no bundler

The dependency surface is small, the renderer loads xterm as a UMD global from
`node_modules`, and everything else is first-party. A bundler would add a build
step and a watch loop for no benefit. The cost is that load order is manual and
`index.html` must list every script.
