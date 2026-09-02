# What is planned

Nothing here is promised. It is what the project intends to do next, written
down so the intent survives being forgotten, and so anyone reading the code can
see where it is going.

## 2.0 - plugins, and a Settings window that can hold them

Two things that belong together. **Plugins are built** - the loader, the panel,
the policy switch and the audit entries are all in, and
[the guide](plugins.md) is the reference. Settings still needs the
restructuring that gives them a proper home.

### Settings, restructured - still to do

Settings is one long scrolling dialog. It has grown terminal appearance, the
background image, idle behaviour, Discord, updates, beta builds, known hosts and
About, and every addition makes it worse. 2.0 splits it into tabs down the side
of the dialog - Terminal, Appearance, Session, Updates, Plugins, About - so a
setting can be found rather than scrolled past.

Moving controls people have learned the position of is worth doing once, at a
version boundary, rather than drifting a little at a time.

### Plugins - built

A plugin is a **description of a panel**, not code:

```json
{
  "name": "Recent logins",
  "icon": "server",
  "command": "last -n 20",
  "columns": ["user", "from", "when"],
  "every": 60
}
```

The app runs the command on the connected server over the exec channel it
already uses for the Stats panel, parses the output into a table, and shows it
beside Files and Tunnels. `docker ps`, `systemctl --failed`, `df -h`, `who` -
the useful ones are all a command and a shape. [The guide](plugins.md) has the
format, four worked examples and what is bounded.

**Plugins will not be executable code, and this is the whole design.** LuwanTerm
holds private keys, passphrases and live connections to production machines.
Third-party JavaScript inside that process is a supply chain problem that would
undo the policy files, the audit log and every check in the attack suite in one
step. Every ecosystem that has allowed it has eventually shipped something
malicious.

A declarative plugin can do nothing its user could not do by typing the command
themselves. That is the point, and it is what makes the rest safe:

- the command is shown before it is switched on, in full, and again under the
  table every time the panel is open
- `allowMonitoring` in [policy](enterprise.md) governs this class of thing, so an
  administrator can forbid plugins outright
- runs reach the audit log as `plugin.run`, with the command and the interval
- a plugin is one small file, so it can be read, checksummed and shared

Installing them lives in Settings: a folder on disk and a file picker. Fetching
published ones from somewhere is still not there, and will only arrive if it can
be done without turning a file you can read into a download you cannot.

**Still to do here:** the Stats panel becoming the first built-in plugin, which
would be the proof the shape is right rather than a claim that it is.

## Given away rather than sold

Things other SSH clients charge for, which this one intends to have for nothing.
The [licence](licence.md) forbids selling LuwanTerm, so none of these will ever
sit behind a payment.

| | Charged for by | State |
| --- | --- | --- |
| File compare, local against remote | WinSCP, Royal TS | **Engine written and tested; no button yet** |
| Multi-execute - type once, send to many sessions | SecureCRT, MobaXterm, Termius | Planned |
| Output triggers - watch for a pattern, then act | SecureCRT | Planned |
| Encrypted host and key sync across machines | Termius | Planned, without a server - push to a git remote or SFTP path the user already owns |
| Session recording with playback | MobaXterm, SecureCRT | Planned; transcripts already exist, needs timing |
| Server stats panel | Termius | **Done** |
| SFTP, tunnels, jump hosts, session logging, auto-reconnect | various | **Done** |
| Unlimited hosts and sessions | Termius caps the free tier | **Done** |

The first of those is the odd one out: `src/main/diff.js` is a finished LCS diff
with tests behind it, and both IPC handlers exist. Nothing in the interface
calls them. That is the cheapest thing on this page.

## Not planned

**A plugin system that runs third-party code.** See above.

**Selling anything.** The licence forbids it, that is deliberate, and the
sponsor link is there for people who like the work rather than as a way to buy
something.

**A telemetry or crash-reporting service.** The app makes two kinds of outbound
connection - to the servers the user asked for, and to GitHub to ask whether
there is a newer release - and a test fails if a third appears.
