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

# Links shown in Settings, and as buttons on the Discord presence card.
# Any left empty is simply not rendered.
LINK_GITHUB=https://github.com/Rathio12/LuwanTerm
LINK_ISSUES=https://github.com/Rathio12/LuwanTerm/issues/new
LINK_DISCORD=
```

`LINK_DISCORD` starts empty. Until you set it, the Discord button is absent
from both Settings and the presence card.

Real environment variables win over the file, so CI can override one without
committing anything:

```bash
DISCORD_CLIENT_ID=... npm run dist
```

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

## User settings

Everything in the Settings dialog, stored in `settings.json` under `userData`.
Defaults and validation live in
[`src/main/store/settings.js`](../src/main/store/settings.js): the type of the
default drives coercion, and `CLAMP` bounds the numbers.

Unknown keys are dropped on write, which is what stops a removed setting — like
the Discord application id — from being reintroduced by hand.
