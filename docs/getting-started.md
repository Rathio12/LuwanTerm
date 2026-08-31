# Getting started

## Running it

```bash
npm install
npm start
```

`npm run dev` does the same but prints renderer console output to your terminal
and opens devtools — useful when something misbehaves.

## Your first connection

1. Click **New host** (or press `Ctrl+Shift+N`).
2. Fill in the address, port and username.
3. Pick how to authenticate:
   - **Password** — you'll be asked on connect, with the option to remember it.
   - **Private key** — choose a key from the Keys tab, or point at a file.
   - **SSH agent** — uses Pageant or the Windows OpenSSH agent automatically.
4. Save, then click the host in the sidebar.

The first time you connect to a machine you'll see an **unknown host key**
prompt showing the server's fingerprint. Compare it with the server, then
accept. From then on the fingerprint is checked on every connection, and you'll
get a much louder warning if it ever changes.

## Host profile options

| Field | What it does |
| --- | --- |
| Display name | What shows in the sidebar and on the tab |
| Group | Optional heading to file the host under |
| Keepalive | Seconds between keepalive probes. `0` turns it off |
| Accent | Colour of the dot on the host row and its tab |
| Default SFTP path | Where the file browser opens for this host |
| Run on connect | A command sent as soon as the shell opens, e.g. `tmux attach` |

## Tabs and panels

Every connection opens a tab. With a session focused, the two buttons top-right
open side panels:

- **Files** — the SFTP browser, see [SFTP](sftp.md)
- **Tunnels** — port forwarding, see [Tunnels](tunnels.md)

Drag the divider between the terminal and the panel to resize.

## Snippets

The **Snippets** tab holds commands you type often. Click one and it goes to the
focused session. Tick "Press Enter after inserting" if it should run
immediately rather than just being typed.

## Appearance

Nothing here changes the default look until you change it.

**Font.** Settings lists every monospace family you have installed, each rendered
in its own face so you can judge it before committing. Click one to use it, or
type any CSS font stack into the box. The catalogue behind the list is
[`fonts/`](../fonts/README.md) - 193 families, no binaries bundled.

**Accent colour.** Seven presets plus a colour picker. It repaints the whole
interface live as you drag, including the terminal cursor and selection, and
reverts if you cancel.

**Background image.** Your own image behind the interface, with opacity and blur
sliders that show their value. Setting one also makes the panels more
see-through, otherwise they cover the picture almost completely.

**Terminal opacity.** The terminal paints its own background, so it stays opaque
even with an image behind the app. Lower this to see through it. It applies to
sessions opened after saving, not existing ones.

Images are read from wherever they live and inlined into the window, so the file
is never copied. Keep it under 8 MB. If the file later moves or is deleted, the
background quietly falls back to the default.

## Starting up

The loading screen is doing real work, not counting to three. It migrates your
settings, reads your hosts and keys, connects to Discord if that is on, and asks
GitHub whether there is a newer release — reporting each step as it goes.

If there is an update, **a window asks before anything is downloaded** and
startup waits for your answer. Closing that window counts as "not now", so it
can never sit waiting forever without somebody acting.

The check gives up after seven seconds. A slow or unreachable network delays
launch by a few seconds rather than blocking it, and failure is silent —
being offline is not something worth interrupting you about.

## Updates

Accepting an update downloads it and restarts. Your hosts, keys, snippets and
settings are kept; see [building](../docs/building.md#installing-over-an-existing-copy).

**Settings → Updates** shows the current state and has a manual check, which
does report errors, unlike the one at startup. Portable builds cannot replace
themselves and say so rather than pretending to update.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle sessions |
| `Alt+1` … `Alt+9` | Jump to a session |
| `Ctrl+Shift+W` | Close the current session |
| `Ctrl+Shift+N` | New host |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copy / paste |
| `Ctrl+Shift+F` | Find in the terminal |
| Right click | Paste |

These deliberately avoid plain `Ctrl+C`, `Ctrl+W` and `Ctrl+1`, which belong to
the shell.

## When a session drops

The terminal is replaced by a **Disconnected** panel with a **Reconnect**
button. Any tunnels on that session are closed with it.
