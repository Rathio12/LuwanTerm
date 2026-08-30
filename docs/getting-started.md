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

**Settings → Background image** puts your own image behind the interface, with
sliders for opacity and blur. The terminal itself stays opaque so text remains
readable; the image shows through the sidebar, tabs and panels.

Images are read from wherever they live and inlined into the window, so the file
is never copied. Keep it under 8 MB. If the file later moves or is deleted, the
background quietly falls back to the default.

## Updates

LuwanTerm checks GitHub for a newer release shortly after startup, downloads it
in the background, and offers to restart. **Settings → Updates** shows the
current state and has a manual check.

The automatic check never reports an error, so an offline machine is not nagged;
a check you asked for tells you what happened. Portable builds cannot replace
themselves and will say so rather than pretending to update.

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
