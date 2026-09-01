# Antivirus and SmartScreen

If a scanner flags LuwanTerm, this page explains what is happening and what is
actually being done about it. It does not ask you to take anything on trust.

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

**Downloads over time** do the rest. Reputation accrues.

Anything else on offer - obfuscating the binary, padding it, splitting it - is
what actual malware does to dodge detection, and doing it would deserve the
flag.
