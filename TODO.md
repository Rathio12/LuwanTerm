# TODO

## Done

- [x] **1 — Remove all `//` comments.** Stripped from all 53 source files;
  112 JSDoc blocks kept. `node build/strip-comments.js` re-runs it (`--dry` to
  preview). It tokenises rather than pattern-matches, so URLs, regex literals
  and template strings survive. The warnings those comments carried now live in
  [docs/customising.md](docs/customising.md#things-worth-knowing-before-you-dig-in).
- [x] **2 — Links for bug reports and collab.** Settings now has an About
  section with *Report a bug*, *Source on GitHub* and *Discord*. URLs come from
  `.env`; an empty one is simply not rendered.
- [x] **3 — Custom background image, global.** Settings, with opacity and blur.
  Applied behind the glass, so panels stay readable.
- [x] **4 — Auto updater.** Checks GitHub releases on startup and on demand,
  downloads in the background, and offers a restart. Silent when it cannot
  reach anything, so an offline machine is never nagged.
- [x] **`.env` for build-time settings.** Discord application id and links live
  in `.env`, baked into the build by `build/bake-config.js`.

## Known limits

- **The updater needs the repository to be public**, or a released build cannot
  read `latest.yml` and every check fails with a 404. The failure is silent by
  design, so it will look like nothing happens.
- **Portable builds cannot update themselves.** They report that a newer version
  exists and stop there; only the installer build can replace itself.
- The background image is inlined as a data URI, capped at 8 MB.

## Worth doing next

- Test against a real SSH server. Everything is verified by construction and by
  automated suites, but no actual login has happened.
- Wire up the three main-process calls that still have no UI: `sftp.chmod`,
  `sftp.reveal` ("show in folder" after a download), and `keys.setPassphrase`.
- Import hosts from `~/.ssh/config`.
- Virtualise the SFTP file list; it builds one row per entry and will stutter on
  a directory with thousands of files.
