# Changelog

## 1.9.5

**Says up front that Windows will warn.** Someone downloaded a build and met
*"Windows protected your PC"* while VirusTotal reported it clean, which reads
like a contradiction and is not one.

SmartScreen is not a virus scanner. It never looks inside the file: it asks
whether the app is signed by a publisher Windows trusts and whether many
machines have run it, and warns when both answers are no. A release published an
hour ago, signed by nobody, answers no twice - so sixty-seven scanners finding
nothing tells it nothing, because it was never asking about malware.

The README now says so before the download, every release page carries the note
above its links, and [the guide](guides/antivirus.md) explains why the two
results coexist. What it does not do is pretend the warning can be waved away:
it goes when a code-signing certificate is bought or when enough people have
downloaded a release, and nothing else does it.

The publisher metadata was checked while looking into this and is already
correct - the executable and the Programs and Features entry both name LuwanIO
and link the website. SmartScreen reads the certificate rather than those
fields, which is why it still says unknown.

## 1.9.4

**A Ko-fi link**, in the README, in SUPPORT.md, on the website, on the
repository's Sponsor button, and in Settings under About.

It buys nothing. The [licence](LICENSE) forbids selling LuwanTerm and says
plainly that donations are not selling, which is the only reason such a link can
exist here without contradicting it. Nothing is gated behind it and nothing asks
twice.

## 1.9.3

**The Stats panel said "That session is no longer connected" on a session that
plainly was.** A session is given a temporary key while it connects and its real
one afterwards, and the panel captured whichever it saw when it was built - so
it spent the rest of its life asking about a session the main process had never
heard of. It reads the id when it asks now.

**Checking for updates in Settings reported "Not checked yet" when it had found
one.** The status list had no entry for *available*, so the one case worth
telling you about fell through to the default, and there was no way to start the
download from there either. It names the version now and offers a button.

## 1.9.2

**The Stats panel is live now.** It opened a fresh channel every three seconds
and could never update faster than the round trip took, which is not what live
means. It opens one channel running the probe on a loop and reads the stream, so
readings arrive as fast as the server sends them - once a second - for a
fraction of the cost of asking over and over. The channel closes the moment the
panel does.

A stream splits wherever it likes, so the reader buffers and cuts on the probe's
end marker: half a reading yields nothing, two arriving together are read as
two, and a server sending nothing but noise cannot grow the buffer without
bound.

**The away screen clock was drifting.** It ticked every ten seconds, so it could
sit showing a minute that had already passed. It lands on the minute boundary
now, and shows the date beneath.

Its styling is a lock screen rather than a card resting on a background: a
gradient so the image still reads as an image, one very large light-weight time,
a hairline rule above the session note, and the hint breathing at the foot of
the screen. It honours `prefers-reduced-motion`.

**The away screen woke on mouse movement**, so a nudged desk or a cursor
drifting past counted as someone working - on a machine that gets knocked it
would never appear at all. Input means input: a key, a click, a scroll, a touch.

**Nothing credential-shaped can reach a published file.** `.env` holds real
tokens and is git-ignored, but nothing enforced that they could not reach the
build - `bake-config.js` copies named keys into the config that ships inside the
asar, and `.env.example` is committed. A check now refuses a tracked `.env`, a
credential-shaped key or value in `.env.example`, a bakeable key named like a
secret, and anything token-shaped in the generated config. Token-shaped rather
than merely long, or it would flag the Discord application id, which is twenty
digits and entirely public.

## 1.9.1

**A beta build says so on the way in.** Now that betas are actually published,
running one opens a notice naming the version: it has had the same tests a
release does, but it is the version things break in, and a crash is worth
reporting because a beta nobody reports is just a worse release. One button
goes straight to the issue tracker.

It appears **once per beta build**, not once per launch - being asked every
time teaches people to dismiss it without reading - and never on a stable
version. It also says how to get back to stable builds, which is a setting
rather than a reinstall.

## 1.9.0

**Sessions close after ten minutes of inactivity**, and an away screen appears
after five. Both are settings, and where an administrator's policy also sets a
limit the shorter one wins.

Worth being plain about the disconnect: idle means nothing sent *or* received,
so a command that runs silently for ten minutes is closed along with an
abandoned prompt. The away screen appears first, and says how many sessions are
open and when they will go.

The away screen draws your own background image over everything, blurred, with
the time and how long you have been gone. Any key brings it back. It is a
curtain rather than a lock - it asks for no password, and the note in Settings
does not pretend otherwise.

**Beta builds are published now**, which is what "Include beta builds" needed in
order to mean anything. It never did: no prerelease had ever been published and
no `beta.yml` existed, so turning the setting on pointed update checks at a file
that was not there and they stopped working entirely. A push to the beta branch
now builds, tests and publishes a prerelease, and the job refuses to publish if
the channel file is missing rather than shipping something the updater cannot
read.

**A Stats panel**, beside Files and Tunnels: the server's CPU, memory, swap,
uptime, load average and a live network graph, per session.

It never types into your shell. Sampling opens a **separate exec channel**, the
way the key deployment already does, so nothing lands in your prompt, your
scroll-back or your session log - and it keeps working while you are inside
`vim` or watching a long-running command, which writing to the terminal could
not do.

It only polls while the panel is open, every three seconds, and stops the moment
you switch tabs or close the session. CPU and network are rates, so the first
sample shows the memory and the load and then fills in the rest a tick later
rather than inventing a number. A server without `/proc` - BSD, macOS, Windows -
is told to you plainly instead of being shown as zeros, and a counter that
resets does not read as a burst of traffic.

Because it runs commands you did not type, `allowMonitoring` in
[policy](guides/enterprise.md) can switch it off for a whole fleet.

**The star prompt no longer appears in a development build.** Running from
source counted toward the session tally and could show the prompt to the person
building the thing, which is absurd on its own and also meant a real install
arrived with the counter already spent. Development runs are now ignored
entirely - not counted, not shown.

To be explicit about the rest of that prompt, since it is easy to fear the
worst: it is triggered by a **successful connection**, never by closing a
session or quitting the app. It needs eight connections and three days before it
is even eligible, then appears on a **15% chance** of a qualifying session, and
any of its three buttons settles it permanently.

**The local test harness stopped crying wolf.** It killed only the Electron
process it spawned, orphaning the rest, and the leftovers fought the next run
for the foreground and for Discord's socket - so consecutive runs failed for
reasons that had nothing to do with the app. It takes the whole process tree
down now, and the two checks that genuinely need a visible, focused window skip
with a reason rather than failing when Windows declines to give them one.

## 1.8.6

**Host rules follow the machine, not the string you typed.** A security review
of the policy layer found the allowlist and the blocklist matched only the
literal host written in a profile. Blocking `*.internal` did not stop a
connection to `10.4.0.9`, and it did not stop a second name pointing at the same
server either - so a control described as confining users to a set of hosts
confined them to a set of spellings.

Both lists resolve now. A name is checked, so are its addresses, and each
address is asked what it calls itself so an alias is caught by a rule naming the
canonical host. An address typed in place of a name is resolved backwards the
same way. Patterns may be CIDR ranges - `10.4.0.0/16` - as well as globs, and
trailing dots, capitalisation, whitespace and IPv6 brackets no longer matter.

**A host that will not resolve is refused when an allowlist is set**, rather
than waved through, because that is what routing around an allowlist looks like.
With only a blocklist it still connects - there is nothing to match it against -
and either way the reason reaches the audit log. Resolution is capped at three
seconds so slow DNS cannot hold up a connection.

The guide is blunter about the limit as well: a user who can edit their own
`hosts` file can point a name anywhere, and one who can run a different SSH
client is not constrained by this one at all.

**Rich Presence recovers on its own.** It could stop showing and stay stopped.
If Discord accepted the socket but never answered the handshake, nothing timed
out and nothing reconnected - the connection sat half open forever. And if the
activity was lost while the socket survived, it was only re-sent when a session
opened or closed, so a quiet terminal stayed blank.

There is a ten second handshake timeout now, which tears the socket down so the
reconnect that already existed can do its job; a re-assert every two and a half
minutes while connected; and a failed write is treated as a dead connection
rather than a success. Tested against a fake Discord that drops the connection
mid-session and another that accepts it and says nothing.

## 1.8.5

**The signature check added in 1.8.4 could not read signatures.** On the build
runner `Get-AuthenticodeSignature` failed to load its module under Windows
PowerShell, and the script treated the resulting blank status as "unsigned". It
happened to print the right answer, because the binaries genuinely were
unsigned - but the moment a certificate was supplied it would have failed the
release while reporting the same thing. A check that cannot fail correctly is
not a check.

It now tries PowerShell 7 before Windows PowerShell, imports the module
explicitly, and treats an unreadable signature as a failure in its own right
rather than quietly calling it unsigned. Verified against binaries Windows
itself signed as well as our unsigned ones.

## 1.8.4

**Every release so far went out unsigned.** Not weakly signed - unsigned,
`Get-AuthenticodeSignature` reporting `NotSigned` on the binaries people
downloaded. electron-builder prints `signing with signtool.exe` for each
artifact whether or not a certificate exists, so the build logs looked correct
while the certificate secrets had never been set.

`build/check-signature.js` now runs after every release build, reads the
Authenticode status of everything produced, and **fails the release** if a
certificate was supplied but the output came out unsigned. With no certificate
it says so plainly and carries on, so a fork can still build. The situation that
hid this for eight releases cannot repeat.

This is also the honest answer to a scanner flagging a download. An unsigned
Electron binary that unpacks itself and speaks SSH is heuristic bait; a single
machine-learning verdict out of sixty-seven engines is the expected result, not
evidence of a problem. [The signing guide](guides/signing.md) sets out what
actually reduces it and in what order, and what is not worth doing.

Also fills in the product metadata the installer embeds - homepage, repository
and copyright were all absent.

## 1.8.3

**A guard against the mistake 1.8.2 fixed.** Three policy settings had shipped
doing nothing, and the tests they had proved only that they parsed. A new suite
walks every key the policy declares and fails unless something outside
`policy.js` actually consults it, checking specifically that the idle timeout
reaches the session manager, that the retention reaches something which deletes,
and that both are started at boot.

Verified the way a guard should be: delete the call it is watching for and the
suite fails; put it back and it passes. No behaviour changes in this release -
the binary is the same program 1.8.2 was.

## 1.8.2

**Three policy settings did nothing at all.** They were defined, validated,
clamped and documented, and no code ever read them - which is the worst way for
a security control to fail, because an administrator sets it, the guide agrees
it exists, and nothing happens.

- `idleTimeoutMinutes` never disconnected anything. Sessions now record when
  they last saw input or output, a sweep runs every thirty seconds while a
  timeout is set, and a session past its limit is closed and recorded as
  `session.idle-timeout` with how long it had been sitting.
- `allowKeyboardInteractive` was never consulted. Setting it to false now turns
  the challenge-response method off before it is offered, rather than letting it
  through, and refusals are recorded.
- `auditRetentionDays` never deleted anything, because the function that does
  the deleting was written and then never called. It runs at startup now.

Each one has tests that fail against the old behaviour, which is what was
missing the first time: the settings had tests proving they parsed correctly,
and none proving they did anything.

## 1.8.1

**The app could not be opened once an update existed.** On boot it checks for a
newer version and, finding one, opens a prompt asking whether to install it -
and waits for the answer before carrying on. That prompt was drawn *underneath*
the splash screen. Both windows are always-on-top and the splash won, covering
the prompt almost exactly: 448x294 of prompt at one position, 388x264 of splash
sitting over the middle of it, hiding both buttons.

So there was nothing to click, the promise never settled, and the app sat on
"Starting LuwanTerm" indefinitely. It only began happening when 1.8.0 was
published and there was finally an update to be offered.

Three changes, because one of them should have been there from the start:

- The splash hides while the question is on screen, and comes back afterwards.
  They can no longer overlap at all.
- The prompt raises itself above every other window and takes focus, and shows
  itself after three seconds even if the event it normally waits for never
  arrives.
- **Ninety seconds and boot carries on regardless.** A prompt nobody answers now
  means "not now" rather than an application that never starts. A prompt that
  fails to load settles the same way, immediately.

The download that follows a yes is also guarded now: if it stops making progress
for two minutes, the update is abandoned and the app starts normally instead of
sitting on a stalled progress bar.

## 1.8.0

**Policy files, for deploying to a fleet.** `policy.json` decides what the app
may do, and is read both from the user's data directory and from beside the
executable. Where both exist the machine copy can only *tighten* the user one: a
capability is permitted when both allow it, a requirement applies when either
demands it, and the shorter of two timeouts wins. There is no arrangement of a
user policy that loosens a machine one.

It can withdraw password, agent or keyboard-interactive authentication, switch
off SFTP or port forwarding, force session logging on, restrict which key types
authenticate, hold hosts to an allowlist or a blocklist, and require that a host
key already be known - which turns an unrecognised key from a prompt into a
refusal. Nothing is editable from inside the app.

**An audit trail.** `logs/audit.jsonl` records sessions opening and closing,
host keys trusted, accepted, rejected or refused, transfers, tunnels, and
connections policy turned away. One JSON object per line, appended synchronously
so a crash cannot lose the tail, rotated at 8 MB and kept for five generations.
Everything passes through a redactor first: passwords, passphrases, key material
and tokens never reach the file at any nesting depth. Nothing is sent anywhere -
it is a file, and moving it somewhere is up to you.

[The guide](guides/enterprise.md) is honest about the boundary. Policy
configures this application on a machine its user may own; controls that survive
a hostile user live on the server.

**Agent authentication works on Windows.** It never has. The OpenSSH agent was
looked for at a path written `'\\.\pipe\openssh-ssh-agent'`, and because the two
characters after a backslash there are not escape sequences, JavaScript dropped
those backslashes outright. Every agent authentication fell through to Pageant,
so anyone running the built-in Windows agent rather than PuTTY's was told no
agent existed.

**A prompt asking for a star**, once. It waits for at least eight sessions and
three days, then appears with a small chance on a qualifying session, well after
the session settles so it never lands mid-keystroke. Two buttons and an X in the
corner; whichever you pick, it never returns.

**Beta builds, if you want them.** Settings now offers a toggle beside the
update controls that points the updater at prereleases as well as releases. It
says plainly what that means: beta builds get the same tests a release does, but
they are the version things break in, and going back means installing an older
build by hand. Off unless you turn it on.

**Also:** Dependabot no longer opens pull requests for minor and patch bumps of
GitHub Actions, where the noise trains you to merge without looking. npm is
deliberately untouched - patch releases are where security fixes arrive.

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
