# Releasing

A release is a version number and a push. Everything else is automatic.

```bash
npm version 1.8.0 --no-git-tag-version
git commit -am "1.8.0"
git push
```

On every push to `main` the workflow reads the version from `package.json` and
asks GitHub whether a release for it already exists. If not, it builds, tags,
and publishes. If it does, the run stops immediately and costs nothing — so an
ordinary push is never at risk of republishing anything.

## Which number to move

`1.MINOR.FIX`, and the major stays at 1.

- **`1.8` is the feature line.** Anything new - a capability, a setting, a
  guide's worth of behaviour - moves the middle number and resets the last to
  zero. 1.8.0, then 1.9.0.
- **The last number counts fixes to that line.** A bug found in 1.8.0 is fixed
  in 1.8.1, the next in 1.8.2. It is a tally of what went wrong with 1.8, which
  is exactly what it should read as.

**Every merge to main gets a number.** Not every push - a merge. If what landed
is a fix, move the last digit; if it is a feature, move the middle one. Nothing
reaches main and sits there unversioned, because then a bug report naming a
version cannot be tied to code.

## Write the changelog first

The release body **is** the changelog section for that version. `CHANGELOG.md`
is the only place it is written:

```markdown
## 1.8.0

**What changed.** In prose, not bullet points of commit subjects. Somebody
deciding whether to update should be able to tell from this whether it affects
them.
```

[`build/release-notes.js`](../build/release-notes.js) lifts that section out,
appends direct download links and a comparison against the previous tag, and the
workflow publishes it with `--notes-file`. No second changelog to keep in step,
and nothing generated from commit subjects.

Preview exactly what the release page will say, before pushing:

```bash
node build/release-notes.js 1.8.0
```

A version with no changelog section still releases — the body says so plainly
rather than the run failing at the last step.

## What gets attached

| Asset | What it is |
| --- | --- |
| `LuwanTerm-<version>-setup.exe` | The installer. Start Menu entry, licence page, updates itself. |
| `LuwanTerm-<version>-portable.exe` | One file, nothing installed. |
| `latest.yml` | What electron-updater reads to find the newest version. |

**No `.blockmap`.** An NSIS installer embeds its own block map inside the exe,
which is the one electron-updater reads for differential downloads, and
`latest.yml` never referenced the separate file. Publishing it added a download
nobody used. The publish step also removes stale ones from older releases.

## Fixing a release after the fact

Re-running the workflow against an existing tag replaces its assets, rewrites
its notes from the current changelog, and clears any stale blockmap:

```bash
gh workflow run release.yml -f tag=v1.7.2
```

Useful when the changelog was wrong, or an asset failed to upload. It does not
rebuild from the tagged commit — it builds from `main`, so only do this when
`main` is where you want that release to come from.

## The secrets a release reads

All three are optional, and the build says which it had.

| Secret | Without it |
| --- | --- |
| `PROVENANCE_KEY` | The build stamps itself `unsigned` and cannot be told apart from one a fork made. See [provenance](provenance.md). |
| `WINDOWS_CERT_BASE64` | The binaries are unsigned and Windows warns harder. See [signing](signing.md). |
| `WINDOWS_CERT_PASSWORD` | As above — both are needed together. |

```bash
gh secret set PROVENANCE_KEY --repo Rathio12/LuwanTerm < .provenance-key
```

Build-time configuration is not a secret and does not need one: `.env` is
git-ignored, so CI falls back to the committed `.env.example`, which holds the
project's own public values. See [configuration](configuration.md).

## The Sponsor button

Two things, and the file is only one of them:

1. [`.github/FUNDING.yml`](../.github/FUNDING.yml) with at least one platform
   filled in. Every supported platform is listed there, commented, with the
   syntax GitHub expects.
2. **Settings → General → Features → tick "Sponsorships"**, then *Set up sponsor
   button*. Without that the button never appears, however correct the file is.

`github:` also needs the account enrolled at
[github.com/sponsors](https://github.com/sponsors); until then that entry links
to a page that does not exist yet. The other platforms work as soon as you have
an account there.

This is consistent with the [licence](licence.md), which forbids selling
LuwanTerm but says plainly that voluntary donations are not selling.

## Why the tag is made by the release

The tag is created by the release rather than pushed first. A tag pushed with
the built-in token does not trigger another workflow, so tagging first would
have meant chaining two workflows through a personal access token — a
credential the project would then have to hold.

Pushing a `v*` tag by hand still works if you prefer it that way.

## Before you push a version

```bash
npm run check        # project checks, then the suites
npm run check-site   # drives the published page in a real window
```

CI runs both, plus the tests, and a release that fails its own suites never
reaches anyone. Running them first just saves you the round trip.

There is also [`build/check-app.js`](../build/check-app.js), which boots the app
and inspects the running UI over the DevTools protocol. It stays out of CI
because its results depend on which fonts the machine has and whether Discord is
running, but it is worth a run before a release you care about.
