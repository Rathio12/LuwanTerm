# Deploying to a fleet

Two files, no screens. Both are read at startup; neither is editable from inside
the app.

- **`policy.json`** decides what the app is allowed to do.
- **`logs/audit.jsonl`** records what it did.

## policy.json

Two locations, and where both exist the machine copy wins:

| Location | Who writes it | Purpose |
| --- | --- | --- |
| Beside `LuwanTerm.exe` | An administrator, at deploy time | The floor. A user cannot get underneath it. |
| `%APPDATA%\LuwanTerm\policy.json` | The user | Their own tightening, on top. |

**The machine copy can only tighten.** A capability is permitted when *both*
allow it; a requirement applies when *either* demands it; where both set a
timeout, the shorter one wins; a machine allowlist replaces a user allowlist,
and blocklists are added together. There is no arrangement of a user policy that
loosens a machine one, which is the point of shipping it beside the executable.

```json
{
  "requireKnownHost": true,
  "allowPasswordAuth": false,
  "allowSftp": true,
  "allowTunnels": false,
  "requireSessionLogging": true,
  "allowedHosts": ["*.prod.example.com", "bastion.example.com"],
  "blockedHosts": ["*.lab.example.com"],
  "allowedKeyTypes": ["ed25519"],
  "auditRetentionDays": 365
}
```

Every key is optional; anything absent keeps its default.

| Key | Default | Effect |
| --- | --- | --- |
| `requireKnownHost` | `false` | An unrecognised or changed host key is refused outright instead of prompting. |
| `allowPasswordAuth` | `true` | `false` refuses password authentication before a password is ever collected. |
| `allowKeyboardInteractive` | `true` | Covers the challenge-response path, which is how many MFA prompts arrive. |
| `allowAgentAuth` | `true` | `false` refuses the SSH agent. |
| `allowSftp` | `true` | `false` disables file transfer entirely. |
| `allowTunnels` | `true` | `false` disables local, remote and SOCKS forwarding. |
| `allowMonitoring` | `true` | `false` disables the Stats panel, which runs `/proc` reads on the server. |
| `requireSessionLogging` | `false` | `true` forces transcripts on and keeps them on. |
| `idleTimeoutMinutes` | `0` | Minutes before an idle session is dropped. `0` is no limit. |
| `allowedHosts` | `[]` | Glob patterns or CIDR ranges. Empty means anywhere. |
| `blockedHosts` | `[]` | Same, applied after the allowlist and winning over it. |
| `allowedKeyTypes` | `[]` | e.g. `["ed25519"]`. Empty means any type. |
| `auditEnabled` | `true` | `false` stops the audit log. |
| `auditRetentionDays` | `90` | How long rotated audit files are kept. `0` keeps them. |

Patterns use `*` and `?` and are matched case-insensitively.
`*.prod.example.com` matches `web1.prod.example.com` and not `prod.example.com`.
A pattern may also be a CIDR range - `10.4.0.0/16`, or an IPv6 prefix - which is
matched against addresses rather than names.

**Matching follows the machine, not the string.** A name is resolved and its
addresses are matched too, and each address is asked what it calls itself so a
second name for the same host is caught by a rule naming the first. An address
typed in place of a name is resolved backwards the same way. Blocking
`*.internal` therefore also refuses `10.4.0.9` and `shadow.example.net` when both
lead to `db.internal`.

Resolution is capped at three seconds and failure is not treated as consent:
**if an allowlist is set and the host cannot be resolved, the connection is
refused**, because a name that will not resolve is what routing around an
allowlist looks like. With only a blocklist, an unresolvable host is allowed -
there is nothing to match it against - and the refusal reason is recorded either
way.

None of this is a substitute for network controls. A user who can edit their own
`hosts` file can point any name anywhere, and a user who can run another SSH
client is not constrained by this one at all. It stops mistakes and casual
circumvention; it does not stop someone determined.

A policy file that will not parse is ignored rather than fatal — a typo locks
nobody out of their own machine, but it also means a policy you rely on should
be verified rather than assumed. `LuwanTerm.exe --provenance` reports which
policy files were read.

## The audit log

`%APPDATA%\LuwanTerm\logs\audit.jsonl`, one JSON object per line:

```json
{"at":"2026-09-01T02:14:07.881Z","event":"session.open","sessionId":"sess_9f2c","host":"db.prod.example.com","port":22,"username":"ops","auth":"key","jumpHost":""}
{"at":"2026-09-01T02:14:09.402Z","event":"host-key.trusted","host":"db.prod.example.com","port":22,"keyType":"ssh-ed25519","fingerprint":"SHA256:..."}
{"at":"2026-09-01T02:16:31.117Z","event":"sftp.download","sessionId":"sess_9f2c","host":"db.prod.example.com","name":"pg_hba.conf"}
{"at":"2026-09-01T02:19:55.006Z","event":"session.close","sessionId":"sess_9f2c","host":"db.prod.example.com"}
```

| Event | When |
| --- | --- |
| `session.open` / `session.close` | A session starts or ends, with host, user and auth method. |
| `connect.refused` | Policy turned a connection away before it was attempted. |
| `host-key.trusted` | The key was already known. |
| `host-key.accepted` / `host-key.rejected` | Somebody was asked and answered. |
| `host-key.refused` | `requireKnownHost` refused without asking. |
| `sftp.upload` / `sftp.download` | A transfer finished, with the file name. |
| `sftp.*.failed` / `sftp.*.cancelled` | It did not. |
| `tunnel.open` / `tunnel.close` | A forward was opened or closed. |

**Nothing secret is written.** Every entry passes through a redactor that
replaces anything named like a password, passphrase, key, token, secret or
signature with `[redacted]`, at any depth, before it reaches the file. Values
over 512 characters are truncated and long arrays are capped, so a stray blob
cannot bloat the log.

**Entries are appended synchronously.** A buffered write is faster, but a log
that loses its last lines in a crash is not much of an audit trail, and these
events are far too infrequent for the cost to matter.

The file rotates at 8 MB, keeping five generations (`audit.jsonl.1` through
`.4`). Rotated files older than `auditRetentionDays` are deleted.

### Collecting it

It is a plain file. Point whatever you already use at it:

```powershell
Get-Content "$env:APPDATA\LuwanTerm\logs\audit.jsonl" -Wait |
  ForEach-Object { $_ | ConvertFrom-Json }
```

Nothing is sent anywhere by the app. There is no telemetry, no callback and no
account — if the log is going to reach a collector, you have to move it.

## What this does not do

Be clear-eyed about the boundary. Policy constrains **this application**, on a
machine where the user may well be an administrator. Somebody determined can
edit the file, replace the executable, or use a different SSH client entirely.

It is a way to configure a fleet and to have a defensible record of what the
tool did — not a way to stop a hostile user. Controls that survive a hostile
user live on the server: `sshd_config`, certificate authorities, bastion hosts
and their own logs.

Pair it with [provenance](provenance.md), which tells you whether the binary
running under that policy is the one you shipped.
