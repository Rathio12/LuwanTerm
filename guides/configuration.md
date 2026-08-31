# Configuration

Two different things get called "settings" here, and the difference matters.

| | Build-time (`.env`) | User settings |
| --- | --- | --- |
| Where | `.env`, baked into the build | Settings dialog, saved in `userData` |
| Who changes it | Whoever builds the app | Whoever runs the app |
| Examples | Discord application id, links | Font, background image, Discord on/off |

Anything that identifies *this build* belongs in `.env`. A release must not be
reconfigurable by whoever runs it — otherwise it could be made to report as
somebody else's Discord application.

## `.env`

Copy [`.env.example`](../.env.example) to `.env` and edit. It is git-ignored, so
your values stay yours.

```ini
# Discord application to report as. Empty disables Rich Presence entirely.
DISCORD_CLIENT_ID=1543680676539273276

# The image Rich Presence shows: either the name of an art asset uploaded in the
# Discord developer portal, or a public image url. Discord accepts both.
DISCORD_LARGE_IMAGE=https://rathio12.github.io/LuwanTerm/assets/images/icon.png

# Links shown in Settings, and as buttons on the Discord presence card.
# Any left empty is simply not rendered.
LINK_GITHUB=https://github.com/Rathio12/LuwanTerm
LINK_ISSUES=https://github.com/Rathio12/LuwanTerm/issues/new
LINK_WEBSITE=https://rathio12.github.io/LuwanTerm/
LINK_DISCORD=
```

`LINK_DISCORD` starts empty. Until you set it, the Discord button is absent
from both Settings and the presence card.

`DISCORD_LARGE_IMAGE` is a url rather than an asset name on purpose. An asset
name only works once you have uploaded an image under **Rich Presence → Art
Assets** for your own application; a url works immediately, because Discord
fetches it through its own proxy.

Real environment variables win over the file, so CI can override one without
committing anything:

```bash
DISCORD_CLIENT_ID=... npm run dist
```

## Where the values come from

`bake-config.js` takes the first value it finds, in this order:

1. a real environment variable
2. `.env`
3. [`.env.example`](../.env.example)

The last step matters more than it looks. `.env` is git-ignored, so a fresh
clone — and every CI build — has none. Without the fallback those builds bake an
empty config and ship with Rich Presence silently disabled and no About links.
`.env.example` holds this project's own public values, which is why it is
committed. Anything private belongs in a real environment variable instead.

## How it gets into the build

[`build/bake-config.js`](../build/bake-config.js) reads `.env` and writes
`src/main/config.generated.json`, which ships inside the app.
[`src/main/config.js`](../src/main/config.js) reads that, falling back to empty
values when it is missing.

Every script that runs or packages the app bakes first, so you never have to
remember:

```json
"start": "npm run bake && electron .",
"dist":  "npm run bake && npm run make-icon && electron-builder --win --publish never"
```

This is a build step rather than a runtime read on purpose. If the app read
`.env` at runtime, anyone could drop one beside the executable and repoint it.

## Adding a value

1. Add the key to `.env.example` (and your `.env`).
2. Map it in `KEYS` in `build/bake-config.js`.
3. Add a default in `DEFAULTS` in `src/main/config.js`.

If the renderer needs it, pass it through `app:info` in
`src/main/ipc/app.js` — the renderer has no direct access to config.

## Settings with no control in the app

A few things are deliberately editable only in `settings.json`. They are the
sort of thing you decide once, and two of them record or re-establish
connections on your behalf, which should be a considered choice rather than a
toggle flipped by accident.

Close LuwanTerm before editing the file, or your changes will be overwritten on
exit. It lives in `%APPDATA%\LuwanTerm\settings.json`.

### Session logging

Writes everything a session prints to a file, for audit or for working out what
happened later.

```json
{
  "sessionLogging": true,
  "sessionLogKeepAnsi": false
}
```

Logs go to `%APPDATA%\LuwanTerm\logs\`, one file per session, named after the
host and the time it started. Escape sequences are stripped by default so the
result is readable; set `sessionLogKeepAnsi` to `true` to keep the raw stream
with its colours.

> A transcript contains everything on your screen, which can include secrets you
> typed or files you printed. Treat the log directory as sensitive.

### Reconnecting automatically

Re-dials a session that drops on its own. A session **you** closed is never
reconnected.

```json
{
  "autoReconnect": true,
  "autoReconnectAttempts": 3,
  "autoReconnectDelaySeconds": 5
}
```

The existing disconnected panel reports each attempt. When the attempts run out
it stops and leaves the Reconnect button, rather than retrying forever.

### Jump hosts

Set on a host rather than globally, in `hosts.json`. The value is either the id
of another saved host or an ssh-style address:

```json
{
  "name": "internal-db",
  "host": "10.10.0.4",
  "jumpHost": "gateway.example.com"
}
```

LuwanTerm opens the jump host first, asks it to reach the target, and runs the
real session over that channel. Both connections close together. This is the
same idea as OpenSSH's `ProxyJump`, and importing `~/.ssh/config` fills it in
from any `ProxyJump` lines it finds.

## User settings

Everything in the Settings dialog, stored in `settings.json` under `userData`.
Defaults and validation live in
[`src/main/store/settings.js`](../src/main/store/settings.js): the type of the
default drives coercion, and `CLAMP` bounds the numbers.

Unknown keys are dropped on write, which is what stops a removed setting — like
the Discord application id — from being reintroduced by hand.
