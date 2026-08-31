# Changelog

## 1.7.2

**Every build is now marked.** `provenance.generated.json` ships inside the
asar with the version, the commit, the moment it was built and an id unique to
that one run, signed with an Ed25519 key the project holds. The public half is
compiled in, so a copy checks itself with no server and nothing read from the
machine it runs on. `LuwanTerm.exe --provenance` prints the result: *verified*,
*unsigned* (someone else's build of the source, which is honest rather than an
accusation), *forged* (the record was edited after signing) or *absent*.

The signature covers a digest of all 62 shipped source files, so a genuine
signature cannot be lifted onto a build whose code was changed afterwards - the
files then report as CHANGED.

**And a way to recognise the code when the mark is gone.**
`npm run check-copy -- <path>` fingerprints this repository every time it runs,
so there is no marker list committed for anyone to find and strip. It matches
prose where prose survives, and otherwise the *shape*: strings, comments and
numbers thrown away, and what remains is the identifiers in the order they are
used, six at a time. Against a copy renamed throughout, rebranded, recoloured
and stripped of every stamp it matched 2185 markers where the original matched
2188. Unrelated code of the same kind matches one.

**Every comment removed** from the JavaScript, CSS and HTML - line comments,
block comments and JSDoc alike. `build/strip-comments.js` walks the source as a
tokeniser rather than running a regular expression over it, because `//` and
`/*` appear inside strings, template literals and regex literals and a naive
replace corrupts all three. The two HTML comments that mark where the README
badges are written are kept, because they are structure rather than commentary.

**Also:** two duplicate keys removed - `check-copy` appeared twice in
`package.json` and `discord` twice in the `app:info` payload - and the local
app harness no longer fails on a machine where Discord simply is not running.

## 1.7.0

**A licence.** The project was marked `UNLICENSED` while being published as open
source, which meant nobody actually had permission to use, fork or contribute to
it. The [LuwanTerm Licence 1.0](LICENSE) grants what was always intended, and
withholds the two things that were not.

You may use it for **any** purpose - at home, at work, for a client, across a
company - and read, fork, modify and republish it. Contributions need no CLA and
no copyright assignment: you keep the copyright in what you write.

You may not **sell** it: not copies, not a paid product it forms part of, not a
hosted service, not a support contract, not a paywalled feature. Being paid for
your own work is a different thing - a consultant using LuwanTerm on a client's
servers is paid for the setup, not for LuwanTerm.

You may not use it **against people**. Unauthorised access, surveillance,
harassment, discrimination and human rights abuses end the licence immediately,
with no cure period. The standard is named rather than left to interpretation:
the Universal Declaration of Human Rights, the ICCPR, the ILO Declaration on
Fundamental Principles and Rights at Work, and the Convention on the Rights of
the Child. For a remote access tool the line is authorisation - testing a system
you have written permission to test is fine, testing one you do not is not.

This is **source-available, not OSI open source**, and says so plainly wherever
it appears. An OSI-approved licence cannot restrict what software is used for,
and these restrictions are the point. [The licence guide](guides/licence.md) is
honest about what that costs: no recognised licence label on GitHub, no GPL
compatibility, and no distribution packaging. Every runtime dependency is MIT,
so nothing conflicts.

The installer now shows the terms and asks you to accept them.
`build/make-license-txt.js` renders `LICENSE` into plain ASCII for that page at
build time, so the markdown stays the only copy anyone edits.

## 1.6.6

**Discord Rich Presence actually works now.** It never did in a downloaded
build. `.env` is git-ignored, so every release built by CI baked an empty
config - and an empty client id disables presence outright and drops the About
links with it. `.env.example` is now the last fallback, after real environment
variables and `.env`. Separately, the presence image asked for an art asset that
was never uploaded, so nothing was drawn; it is a URL now, which Discord fetches
through its own proxy.

**The Settings font list was empty for the wrong reason.** Its filter had literal
backspace characters where `\b` was meant, so it matched no font family at all
and quietly discarded everything the system reported.

**A View page button**, in Settings and on the presence card, pointing at the
website. `LINK_WEBSITE` joins the baked configuration.

**The website's font list is interactive.** Click any font and the demo terminal
switches to it. Fonts you have not installed are no longer dead rows either: 45
of the 193 families load from Google Fonts, and 13 Nerd Font builds preview in
their unpatched base family, each fetched only when its row scrolls into view.
Rows now name their catalogue group, so a CJK system face in a list of coding
fonts explains itself.

**Checks:** 196, up from 174. `test/config.test.js` covers the build config
precedence so an unconfigured release cannot ship again, and two Electron
harnesses drive the real UI - `build/check-site.js` runs the website in CI,
`build/check-app.js` boots the app and inspects it over the DevTools protocol.

## 1.6.5

- Guides moved into `guides/`, leaving `docs/` to hold only the published
  website. GitHub Pages can serve it either straight from the branch or through
  the workflow, since the assets are committed.
- The website carries the app's titlebar and reuses its tokens directly, so the
  page and the program read as one thing rather than two.

## 1.6.0

**A test suite.** 11 suites, 172 checks, run by `npm test` and by CI. They cover
what had only ever been checked by hand: the PuTTY parser against fixtures ssh2
itself accepts, the SSH wire codec, key generation and discovery, settings
migration, the SOCKS5 proxy including requests split across packets, the diff
engine and the log scrubber. The badge in the README comes from the real run.

**Premium features, driven by config rather than new controls:**

- Session logging writes a readable transcript per session, with escape
  sequences stripped by a scanner rather than a regex.
- Auto-reconnect re-dials a session that dropped on its own, a bounded number of
  times. A session you closed is never reconnected.
- Jump hosts reach machines with no direct route, the same idea as `ProxyJump`.
- `~/.ssh/config` can be read into host profiles, `ProxyJump` included.
- A file diff engine, for comparing a remote file with a local one or with the
  same path on another server.

All of them live in `settings.json` and `hosts.json`; see
[configuration](guides/configuration.md).

**Also:** the website moved to `site/` and builds from the app's own
`tokens.css`, published by a Pages workflow. Fixed a `.gitignore` entry of
`test` that excluded the whole suite - the tests would have been committed
nowhere while a badge claimed they passed.

## 1.5.0

Housekeeping. **No functional change since 1.3.0** - this release exists to
exercise the build pipeline after `actions/upload-artifact` was bumped from v4
to v7, which nothing had run until now.

- Personal scratch files (`TODO.md`, `NOTES.md`, `scratch/`) are git-ignored, so
  working notes stop ending up in the repository.

## 1.3.0

**A loading screen that does something.** Startup now runs a real sequence
behind the splash — settings migration, stored hosts and keys, Discord, and an
update check — reporting each step with a progress bar instead of pretending
for a fixed 700 ms.

- **Update prompts are their own window.** If a newer release exists, a popup
  asks before anything is downloaded, and boot waits for the answer. Closing it
  counts as "not now", so it cannot wait forever without somebody acting.
- Nothing downloads unattended any more: `autoDownload` is off and the check
  has a 7 second timeout, so a slow or unreachable network delays launch by
  seconds rather than blocking it.
- Accepting an update runs the release's own installer visibly and relaunches
  afterwards. There is no separate updater binary.
- Fixed the splash status text never updating. `var status` at global scope
  binds to `window.status`, a legacy string property, which silently swallowed
  every write.

Repository housekeeping: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
issue and pull request templates, and Dependabot.

## 1.2.0

**Background images actually work.** They were applying all along, but two
things made them look broken:

- Saving Settings wiped the image. The dialog read a cached copy of settings, so
  the background field submitted empty and cleared it.
- The image only showed at the window edges, because the panels and the terminal
  painted over it. Setting one now makes the chrome see-through, and a terminal
  opacity control lets the image through the terminal itself.
- Panel blur no longer softens the picture when the blur slider is at zero.

Added a font picker listing every installed monospace family, each rendered in
its own face, backed by a 193-family catalogue in `fonts/`. Added an accent
colour with live preview. Every slider now shows its value.

The default look is unchanged: none of this engages until you change something.

## 1.1.1

Dialogs scroll instead of running off screen. Settings had grown to 961 px in an
800 px window — cut off, with the Save button below the bottom edge, so it could
be read but not used.

## 1.1.0

- Discord Rich Presence gained its buttons, which were never being sent, and
  stopped repeating the application name.
- Releases now publish automatically when `package.json` names a version that
  has no release yet.

## 1.0.0

First release.

- Tabbed terminals on xterm.js with GPU rendering, a find bar and copy-on-select
- Host profiles with groups, accents, keepalive and a command to run on connect
- Password, private key and SSH agent authentication, plus keyboard-interactive
- Host key pinning, with a loud warning when a fingerprint changes
- Secrets encrypted by the OS keychain
- SFTP browser with recursive folder download and cancellable transfers
- Local, remote and dynamic SOCKS5 port forwarding
- Key management: generate, add existing, install a public key on a server
- Native PuTTY `.ppk` support, versions 2 and 3, read in place and never rewritten
- NSIS installer and portable builds
