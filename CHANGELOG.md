# Changelog

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
