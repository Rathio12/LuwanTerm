# Provenance and copy detection

The licence says LuwanTerm is not for sale. This is what backs that up.

Nothing here stops anyone taking the code — nothing can, and a licence that
needed technical enforcement would not be worth publishing. What these do is
make an untouched copy identify itself, and make a disguised one still
recognisable, so there is something to point at.

**None of it watches you.** No identifier is tied to a person, a machine or an
install; nothing is read from your system; nothing is sent anywhere, ever. Every
mark described here is written once, at build time, into the software itself.

## Three layers

| | What it is | What defeats it |
| --- | --- | --- |
| **The stamp** | A record inside the app: version, commit, build time, and an id unique to that one build | Deleting one file |
| **The signature** | An Ed25519 signature over the stamp, plus a digest of every source file that shipped | Nothing — it cannot be forged, only removed |
| **The writing** | The prose of the codebase itself: comments, error wording, distinctive phrasing | Rewriting every comment by hand |

They are meant to be climbed in order. A lazy repackager trips the first. A
careful one who strips the record still trips the third, because the third is
the code itself.

## The stamp

`build/make-provenance.js` writes `src/main/provenance.generated.json` into the
asar at build time:

```json
{
  "name": "luwan-term",
  "version": "1.7.0",
  "origin": "https://github.com/Rathio12/LuwanTerm",
  "licence": "LuwanTerm Licence 1.0 - source-available, not for sale",
  "commit": "7f184e554f15...",
  "clean": true,
  "builtAt": "2026-08-31T16:00:00.000Z",
  "buildId": "aae443be-c777-443b-9573-eb6dd8baf3ba",
  "tree": "sha256:...",
  "files": 62,
  "signature": "..."
}
```

`buildId` is the useful part: two binaries built from the same commit still
differ, so a leaked build traces back to the exact run that produced it.
`clean` records whether anything was uncommitted at build time, which tells you
the binary does not correspond to the commit beside it.

Read it out of any copy with:

```bash
LuwanTerm.exe --provenance > build.txt
```

Windows gives a GUI process no console of its own, hence the redirect.

## The signature

The stamp alone only says what a build *claims* to be. The signature makes the
claim checkable.

`src/main/provenance.js` carries the public half of the project's key and
verifies the record at runtime, giving one of four answers:

- **verified** — a genuine build of this project.
- **unsigned** — stamped, but built without the signing key. A fork's own build
  looks like this, and so does a local `npm run dist`. This is not an
  accusation; it is the honest state of any build the project did not make.
- **forged** — the record has been edited since it was signed. Somebody changed
  the origin, the version or the build id and kept the old signature.
- **absent** — no record at all. A development tree, or somebody removed it.

The signature covers a digest of every `.js`, `.html`, `.css` and `.json` under
`src/`, so a genuine signature cannot be lifted onto a build whose code was
edited afterwards — `--provenance` reports the files as CHANGED.

The private key never enters the repository. It lives in `.provenance-key`
locally (git-ignored) and in the `PROVENANCE_KEY` repository secret for
releases.

**Releases are unsigned until that secret exists.** The workflow passes
`PROVENANCE_KEY` through to the build, and an absent or empty value means the
build stamps itself `unsigned` rather than failing - which is the right
behaviour for a fork, but not what you want for your own releases. Set it once:

```bash
gh secret set PROVENANCE_KEY --repo Rathio12/LuwanTerm < .provenance-key
```

The key is passed from the file so it never appears in your shell history.

**`.provenance-key` is the only copy.** It is git-ignored, so it is not in any
clone, any backup of the repository, or any release. Keep a copy somewhere safe.
Losing it does not break anything already signed - every build that shipped can
still be verified against the public key in `src/main/provenance.js` - but you
cannot sign anything new, and rotating means generating a new pair, replacing
the public key, and accepting that old builds verify against the old one only.

To rotate:

```bash
node -e "const c=require('crypto');const{privateKey,publicKey}=c.generateKeyPairSync('ed25519');require('fs').writeFileSync('.provenance-key',privateKey.export({format:'der',type:'pkcs8'}).toString('base64'));console.log(publicKey.export({format:'der',type:'spki'}).toString('base64'))"
```

That prints the new public key. Put it in `PUBLIC_KEY` in
`src/main/provenance.js`, and update the repository secret.

## The shape of the code

The layer that survives everything else.

```bash
npm run check-copy -- <folder, asar, or app directory>
```

It builds a fingerprint from this repository *every time it runs* — there is no
list of markers committed anywhere for somebody to find and strip — and looks
for it inside whatever you point it at. Two kinds of marker:

**Prose.** Error wording, user-facing copy, and any comment sentences that
remain. Distinctive, but a determined copier can rewrite strings, and this
project strips its own comments.

**Shape.** Every string, comment and number is thrown away, and what is left is
the identifiers in the order the author reached for them, taken six at a time.
This is the durable half. Renaming the product changes a handful of names out of
thousands of sequences; reformatting, reindenting and restyling change none of
them at all, because none of that alters the order in which things are used.

Measured against a copy renamed throughout, rebranded, recoloured and stripped
of every stamp:

| scanned | markers matched |
| --- | --- |
| this repository's `src/` | 2188 |
| that copy | 2185 |
| ssh2, unrelated code of the same kind | 1 |
| electron-updater | 0 |

The disguise cost three markers out of 2188.

**Read the count, not the percentage.** The fingerprint spans the whole project,
so pointing the tool at one folder can never match the markers taken from the
rest of it — a genuine copy of `src/` still shows about 12%. What separates a
copy from a coincidence is thousands of matches against one or two.

It reads binaries as well as source, in UTF-8 and UTF-16, so an unpacked app
folder or an `app.asar` can be scanned directly. An installer cannot: NSIS
stores everything compressed, and the tool says so rather than reporting a
clean bill. Install it first and scan the folder, or scan `resources/app.asar`.

**A match is evidence, not a verdict.** Read what actually matched before
accusing anyone of anything. Two projects solving the same problem in the same
language will share some vocabulary, and a handful of matches means nothing.
What they will not share is thousands of identical six-name sequences.

## If you find a copy being sold

1. Run `npm run check-copy` against it and keep the output.
2. Run its binary with `--provenance`, in case the record is still there.
3. Note the version, where it is sold, and when you found it.
4. The breach is of [section 7 of the licence](../LICENSE). The remedy starts
   with telling them to stop — most repackaging is thoughtless rather than
   deliberate, and a message ends it.

## What this deliberately is not

- **Not DRM.** Nothing phones home, nothing checks a licence server, nothing
  refuses to run. An unsigned build works exactly as well as a signed one.
- **Not telemetry.** The build id identifies the *build*, not the person running
  it. It is the same for everyone who downloaded the same file.
- **Not a secret.** Every mechanism is documented here and every line of it is
  in the repository. Security through obscurity would be a poor foundation, and
  hiding it would contradict the point of publishing the source.
