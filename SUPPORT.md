# Getting help

Four places, depending on what you need. Picking the right one gets you an
answer faster than picking the loudest one.

## "How do I…?"

**[Ask in Discussions → Q&A](https://github.com/Rathio12/LuwanTerm/discussions/categories/q-a).**

Questions about using LuwanTerm — connecting, keys, tunnels, SFTP, settings —
belong there rather than in the issue tracker. Answers stay searchable for the
next person with the same question, and nothing gets closed as "not a bug".

Before you ask, the answer may already be written down:

| Guide | Covers |
| --- | --- |
| [Getting started](guides/getting-started.md) | First connection, host profiles, tabs, shortcuts |
| [SSH keys](guides/keys.md) | Generating keys, using existing ones, `.ppk` files, installing a key on a server |
| [SFTP](guides/sftp.md) | Browsing, transfers, cancelling |
| [Tunnels](guides/tunnels.md) | Local, remote and SOCKS5 forwarding |
| [Configuration](guides/configuration.md) | Settings, and the build-time `.env` |
| [Customising](guides/customising.md) | Fonts, colours, background image |
| [Discord presence](guides/discord.md) | Turning it on, and what it reveals |

## "It's broken"

**[Open an issue](https://github.com/Rathio12/LuwanTerm/issues/new/choose).**

Something crashes, misbehaves, or does not do what it says. The template asks
for what it needs; the two things that save the most time are:

- **The build.** Run `LuwanTerm.exe --provenance` and paste the first line. It
  names the exact version, commit and build, which removes any guessing about
  which code you are running.
- **What you did, and what happened instead.** A session that drops after ten
  minutes and a session that never connects are different bugs.

Do not paste host names, usernames or key material. None of it is needed, and
an issue is public forever.

## "My antivirus flagged it"

**[Read this first](guides/antivirus.md).** It covers what the flag usually is,
why an unsigned Electron app attracts one, and three ways to verify the download
yourself rather than taking anyone's word for it.

## "It should also…"

**[Start a discussion in Ideas](https://github.com/Rathio12/LuwanTerm/discussions/categories/ideas)**
first, then open an issue once it has taken shape.

An idea with agreement behind it turns into a good issue. An idea straight into
the tracker tends to sit there.

## "I found a security problem"

**[Report it privately](https://github.com/Rathio12/LuwanTerm/security/advisories/new).**

Never in a public issue, and never in a discussion. This is an SSH client — a
vulnerability here reaches other people's servers. [SECURITY.md](SECURITY.md)
sets out what is in scope and what to expect.

## If you want to say thanks

**[ko-fi.com/derechtealec](https://ko-fi.com/derechtealec)**

Only if you like the work. It buys no features, no priority and no support -
there is nothing to buy, which is rather the point. The
[licence](guides/licence.md) forbids selling LuwanTerm and says plainly that
donations are not selling, which is the only reason the link can be here at all
without contradicting it.

## What this is not

LuwanTerm is one person's project, published under a
[licence](guides/licence.md) that forbids selling it — including selling support
for it. There is no support contract, no response-time commitment and no
guarantee anything gets fixed. Questions are answered when they are answered.

That cuts both ways: nobody is paying, so nobody is owed. Be patient, be
specific, and read [the code of conduct](CODE_OF_CONDUCT.md).
