# Plugins

A plugin is a **description of a panel, not code**. It says what to run on the
server you are connected to and what shape the answer comes back in. LuwanTerm
runs the command, parses the output into a table, and shows it beside Files,
Tunnels and Stats.

That is the whole idea, and the limit is deliberate. See
[Why they are not code](#why-they-are-not-code).

```json
{
  "name": "Recent logins",
  "description": "Who has been on this box",
  "icon": "server",
  "command": "last -n 20",
  "columns": ["user", "from", "when"],
  "every": 60
}
```

Drop that in the plugins folder, switch it on in Settings, and the Plugins
panel has a table of the last twenty logins that refreshes every minute.

## Installing one

Settings has a **Plugins** section with three buttons:

| Button | What it does |
| --- | --- |
| **Add from file** | Pick a `.json` manifest. It is checked before it is copied in, so a file that could never load is refused while you can still see which one you picked. |
| **Open folder** | Opens `%APPDATA%\LuwanTerm\plugins\`. Copying files in by hand works exactly as well. |
| **Reload** | Reads the folder again, for when you have just edited a file. |

Every installed plugin is listed with **the command it runs printed next to
it**, before you switch it on. A plugin runs things on your servers; the only
honest way to offer that is to show what it runs.

Nothing runs until you tick it. A plugin that is present but not switched on is
listed and does nothing.

## The manifest

| Field | Required | What it does |
| --- | --- | --- |
| `name` | **Yes** | Up to 60 characters. Shown on the chip and above the table. |
| `command` | **Yes** | Up to 2000 characters. Run on the server exactly as written. |
| `description` | No | Up to 200 characters, shown under the name. |
| `icon` | No | One of the names below. Anything else falls back to `activity`. |
| `columns` | No | Up to 8 column headings. Declaring them also picks the default split. |
| `split` | No | `whitespace`, `columns` or `lines`. See below. |
| `every` | No | Seconds between runs while the panel is open, 2 to 3600. Also accepted as `refreshSeconds`. Leave it out and it runs when you open the panel and when you press refresh. |
| `skipLines` | No | Drop this many lines from the top, for a command that prints its own header. Up to 20. |

Anything else in the file is dropped rather than carried along.

**Icons:** `server`, `terminal`, `folder`, `file`, `link`, `code`, `activity`,
`cog`, `search`, `key`, `shield`, `globe`, `chat`, `bug`, `refresh`,
`download`.

The file name becomes the plugin's id, so `recent-logins.json` is
`recent-logins`. That is what the enabled list in your settings remembers.

## Turning output into a table

Three ways to cut a line up, because server output comes in three shapes.

**`whitespace`** splits on any run of spaces. The default when you declare
columns, and right for output where no field contains a space:

```
alice  10.0.0.4  Mon Sep  1 09:12
```

**`columns`** splits on two or more spaces, or a tab. Right for output that is
laid out in aligned columns, where a field can hold a single space and
splitting on every space would shred it - `docker ps`, `df -h`, `systemctl`:

```
web server   Up 3 days
```

**`lines`** keeps each line whole in a single column. The default when you
declare no columns.

Two rules make the common cases behave:

- **The last declared column keeps the rest of the line.** `last -n 20` ends in
  a date with spaces in it; folding it into the last column is better than
  losing it.
- **Short lines are padded, not left ragged**, so every row is the same width
  and the table stays a table.

## Worked examples

Four that cover most of what people want. Each is a file in
[guides/plugins](plugins/) you can add straight away.

**[Containers](plugins/docker.json)** - `docker ps`, minus its own header:

```json
{
  "name": "Containers",
  "icon": "server",
  "command": "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}'",
  "columns": ["name", "status", "image"],
  "split": "columns",
  "skipLines": 1,
  "every": 15
}
```

**[Failed units](plugins/failed-units.json)** - the one that matters at three in
the morning:

```json
{
  "name": "Failed units",
  "icon": "bug",
  "command": "systemctl --failed --no-legend --plain",
  "columns": ["unit", "load", "active", "sub", "description"],
  "split": "whitespace",
  "every": 30
}
```

**[Disk use](plugins/disk-use.json)** - `df -h` without the header line:

```json
{
  "name": "Disk use",
  "icon": "folder",
  "command": "df -h -x tmpfs -x devtmpfs",
  "columns": ["filesystem", "size", "used", "free", "use%", "mounted on"],
  "split": "whitespace",
  "skipLines": 1,
  "every": 60
}
```

**[Who is on](plugins/who.json)** - the shortest useful one there is:

```json
{
  "name": "Who is on",
  "icon": "chat",
  "command": "who",
  "columns": ["user", "tty", "since"],
  "every": 30
}
```

Others worth a minute: `ss -tulpn` for listening ports, `ps aux --sort=-%mem |
head -n 15` for what is eating the memory, `journalctl -p err -n 20 --no-pager`
for recent errors, `git -C /srv/app log -n 10 --format='%h %an %s'` for what is
deployed.

## Why they are not code

LuwanTerm holds private keys, passphrases and live connections to production
machines. Third-party JavaScript inside that process would be a supply chain
problem that undoes the policy files, the audit log and every check in the
attack suite in one step. Every ecosystem that has allowed it has eventually
shipped something malicious.

So a plugin cannot execute anything. It is data, and this is what falls out of
that:

- **A plugin can do nothing you could not do by typing the command yourself.**
  It runs as you, on the machine you are already on, in a channel that is
  already open.
- **The command is shown in full before you switch it on**, and printed under
  the table every time the panel is open.
- **One small file.** You can read it, checksum it, mail it to a colleague, put
  it in your team's repository.
- **An administrator can forbid the whole class of thing.** See
  [policy](#policy-and-the-audit-log).

What it costs you: no plugin can add a button, draw a chart, talk to an API or
change how the app behaves. That is the trade, and it is the right way round.

## What is bounded

Everything that comes back is written by the server, so the panel treats it as
hostile. Nothing here is configurable, on purpose.

| Limit | Value |
| --- | --- |
| Manifest size | 64 KB |
| Plugins in the folder | 50 |
| Output read from one run | 256 KB |
| Rows drawn | 500, then the panel says it was longer |
| Characters in one cell | 300 |
| Time one run may take | 20 seconds |
| Refresh interval | 2 to 3600 seconds |

Escape sequences and control characters are stripped before anything is drawn,
so a server cannot repaint the panel, forge a row with a carriage return, or
smuggle a colour code into a cell. A run only happens while the panel is open:
close it, or switch to another panel, and the refresh stops.

## Policy and the audit log

Plugins run commands on servers, which is the same capability the Stats panel
has, so they answer to the same switch:

```json
{ "allowMonitoring": false }
```

With that in a [policy file](enterprise.md), the Plugins panel says it is
disabled and every run is refused in the main process - not hidden in the
interface and still reachable underneath.

Three events reach the [audit log](enterprise.md#the-audit-log):

| Event | When |
| --- | --- |
| `plugin.install` | A manifest was added, with the command it carries. |
| `plugin.run` | A plugin ran on a session, with the command and the interval. |
| `plugin.remove` | A plugin was deleted. |

`plugin.run` is written **once per plugin per session**, not once per refresh. A
panel set to reload every two seconds would otherwise be the only thing in the
log, and the fact worth recording - this command ran on this server - does not
change when it runs again. The interval is recorded alongside it, so the log
says how often it repeated.

## When one does not work

Broken manifests are not silently ignored. They appear in the Settings list in
red, with the reason:

| It says | It means |
| --- | --- |
| `it needs a "name"` | Missing, empty, or longer than 60 characters. |
| `it needs a "command"` | Same, at 2000 characters. |
| `it could not be read` | The JSON does not parse. The message is the parser's. |
| `it is not a JSON object` | The file is an array, a string or a number. |
| `it is larger than 64 KB` | Refused before it is parsed. |

One broken file never stops the others loading, and never stops the app
starting.

If a plugin loads but the table looks wrong, it is almost always the split.
Output that lines up in columns needs `"split": "columns"`; output separated by
single spaces needs `whitespace`. If the first row is the server's own header,
add `"skipLines": 1`.

If the panel says the command exited with a status, run the same command in the
terminal beside it - the plugin runs it exactly as written, with no shell
profile and no interactive terminal, so `command not found` usually means a
full path is needed.
