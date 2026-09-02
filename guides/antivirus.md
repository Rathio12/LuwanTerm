# Antivirus and SmartScreen

If a scanner flags LuwanTerm, this page explains what is happening and what is
actually being done about it. It does not ask you to take anything on trust.

## The blue box on first run

Most people meet this before they meet any scanner:

> **Windows protected your PC.** Microsoft Defender SmartScreen prevented an
> unrecognised app from starting.

**SmartScreen is not a virus scanner.** It does not look inside the file at all.
It asks two questions - is this signed by a publisher Windows trusts, and have
many machines run it already - and warns when the answer to both is no. A
release published an hour ago, signed by nobody, answers no twice.

That is why a clean VirusTotal result and a SmartScreen warning are not a
contradiction: they are unrelated systems answering unrelated questions. Sixty
seven scanners saying "no malware here" tells SmartScreen nothing, because
SmartScreen was never asking about malware.

To run it anyway: **More info**, then **Run anyway**. Before you do, it is
reasonable to check the download is the one that was published - see
[Check it yourself](#check-it-yourself) below.

## The current picture

A recent build on VirusTotal: **1 of 67 engines**, Trapmine, reporting
`Malicious.moderate.ml.score`. Every other engine - Bitdefender, CrowdStrike,
Avast, AVG, Emsisoft, DrWeb, ClamAV, Kaspersky and the rest - returns clean.

`Malicious.moderate.ml.score` is not a detection of anything. It is a machine
learning model's confidence score, and "moderate" is the model saying it is not
sure. One ML engine out of sixty-seven is the background noise of shipping an
unsigned desktop application, not evidence of a problem.

## Why it happens

Three things, none of which are about the code:

**It is a large self-extracting executable.** An Electron app is a browser
engine, a Node runtime and the application, packed into one file that unpacks
itself at startup. Structurally that is what a dropper looks like, and ML
models are trained on structure. This is why the **portable** build attracts
more attention than the installer - it is a self-extracting archive with a
compressed overlay, which is the more suspicious shape of the two.

**It is not signed by a certificate anyone trusts.** See below.

**It has no reputation.** Reputation systems count how many machines have seen
a file and for how long. A release published an hour ago has been seen by
almost nobody, and new plus unsigned plus self-extracting is enough for a
cautious model to raise its score.

## What would actually fix it

**An OV or EV code-signing certificate**, from a certificate authority Windows
already trusts, costing a few hundred a year and requiring identity
verification. That is the only reliable answer. An EV certificate additionally
gets SmartScreen reputation immediately rather than earning it.

The self-signed certificate this project can generate does **not** help here.
It makes Windows say "unknown publisher" instead of "unknown publisher", and no
scanner treats an untrusted signature as better than none. It exists so that a
build can be checked for tampering by someone who has the certificate, not to
satisfy SmartScreen. See [code signing](signing.md).

**Downloads over time** do the rest. Reputation accrues per publisher and per
file, so each release starts a little behind and catches up.

Every release so far is unsigned, and honestly so: `Get-AuthenticodeSignature`
on the published installer returns `NotSigned`. The build reports that in its
own log rather than implying otherwise.

Anything else on offer - obfuscating the binary, padding it, splitting it - is
what actual malware does to dodge detection, and doing it would deserve the
flag.

## Check it yourself

Do not take "it is a false positive" from the person who wrote it. Three ways
to check, in ascending order of how convinced you should be:

**1. The checksum.** Every release lists the SHA-256 of each file. Compare:

```powershell
Get-FileHash .\LuwanTerm-1.8.3-setup.exe -Algorithm SHA256
```

If it matches the release notes, the file is the one that was published. That
rules out tampering in transit, not much else.

**2. The build record.** Run `LuwanTerm.exe --provenance`. It prints the exact
commit the binary was built from, the moment it was built, a digest of every
source file inside it, and whether that record is signed by the project's key.
If the files do not match the digest, it says so.

**3. The source.** All of it is [here](https://github.com/Rathio12/LuwanTerm),
the build is a GitHub Actions workflow you can read, and every release names the
commit it came from. Build it yourself and compare - `npm install && npm run dist`.

## What it does and does not do

An SSH client legitimately does things that look alarming out of context: it
opens network connections, reads private keys, forwards ports, and starts a
child process for the PuTTY agent helper (`pagent.exe`, shipped by the `ssh2`
library it uses).

It does not: phone home, collect telemetry, send anything anywhere you did not
point it at, or run anything downloaded at runtime. The only network requests it
makes on its own are the update check against the GitHub releases API and, if
you enable it, the local Discord socket. Both are refusable -
[policy files](enterprise.md) can switch features off, and Rich Presence is a
setting.

## Reporting a false positive

If a scanner blocks it and you would like that fixed, the vendor is the one who
can fix it. Most take submissions:

- **Trapmine** - through their contact form
- **Microsoft Defender** - <https://www.microsoft.com/wdsi/filesubmission>
- Most others have a "submit a false positive" page

Include the SHA-256 from the release notes and a link to the release. Reports
from users carry more weight than reports from the person who published the
file.

If you find something that is not a false positive, that is a security issue -
[report it privately](../SECURITY.md), not in a public issue.
