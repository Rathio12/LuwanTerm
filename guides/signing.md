# Code signing

## Why Windows complains

Two separate reasons, and it helps to know which one you're hitting.

**1. Mark of the Web.** Anything downloaded through a browser or chat app is
tagged as internet-sourced, and SmartScreen reacts to that tag. This happens to
signed apps too.

**2. No trusted signature.** The app isn't signed by a certificate Windows
already trusts, so the publisher shows as unknown.

## Clearing the download mark

Usually all you need, and it needs nothing installed:

```powershell
Unblock-File .\LuwanTerm-1.0.0-setup.exe
```

Or right-click the file → Properties → tick **Unblock** → Apply.

Files you build yourself never carry this mark, so a local `npm run dist` is
unaffected.

## Signing with your own certificate

```powershell
npm run make-cert     # once, creates build/certs/ (git-ignored)
npm run dist:signed   # signed installer + portable
npm run trust-cert    # once per machine, in an ADMIN PowerShell
```

`make-cert` creates a self-signed code signing certificate with a random
password, storing the key, the public certificate and the password under
`build/certs/`. **That folder is git-ignored and must stay that way** — it holds
a private key.

`trust-cert` adds the certificate to the machine's Trusted Root and Trusted
Publishers stores. That is a real change to what the machine trusts, so only run
it for a certificate you generated yourself. To undo it:

```powershell
powershell -File build/trust-cert.ps1 -Remove
```

### Be clear about what this achieves

On machines that have run `trust-cert`, the signature validates and the
publisher reads as your name instead of "Unknown". **On any other machine the
certificate isn't trusted, so SmartScreen behaves exactly as it does for an
unsigned build.** A self-signed certificate cannot change that. It is the right
answer for your own machines and a handful of people you can walk through one
command — nothing more.

You can check where you stand:

```powershell
Get-AuthenticodeSignature .\dist\LuwanTerm-1.0.0-setup.exe
```

`UnknownError` means signed but not trusted here. `Valid` means trusted.

## If it needs to be clean for everyone

There is **no free publicly-trusted code signing certificate**. Since 2023 the
CA/Browser Forum has required code signing keys to live on certified hardware or
a cloud signing service, which killed the cheap options. Sigstore is free but
Windows doesn't trust it for `.exe` files.

The real routes:

| Route | Cost | Catch |
| --- | --- | --- |
| **Certum open source** | ~€30/yr | Works for individuals including in the EU. Requires ID verification |
| **Azure Trusted Signing** | cheap, monthly | Individual accounts are US/Canada only; elsewhere needs a registered company |
| **SignPath Foundation** | free | Open-source projects only, certificate issued to SignPath |
| **Microsoft Store (MSIX)** | free | Microsoft signs it. Requires Store onboarding and review |

Even with a real OV certificate, SmartScreen may warn until that certificate
builds up reputation across enough downloads.

## Dropping in a real certificate

[`build/dist-signed.js`](../build/dist-signed.js) reads `CSC_LINK` (path to a
`.pfx`) and `CSC_KEY_PASSWORD`. Set those and it uses the real certificate
instead of the self-signed one — no other changes:

```powershell
$env:CSC_LINK = "C:\path\to\real.pfx"
$env:CSC_KEY_PASSWORD = "..."
npm run dist:signed
```

## When a scanner flags a build

That has its own page: **[Antivirus and SmartScreen](antivirus.md)** covers what
the verdict means, why an unsigned Electron application attracts one, and how
somebody can verify a download for themselves.

The short version, because it belongs here too: signing is the largest lever you
have over it, and the section below is why that lever was not connected.

## Releases were going out unsigned

Until 1.8.4 every published build was **completely unsigned**, and the build log
said otherwise. electron-builder prints `signing with signtool.exe` for each
artifact whether or not a certificate exists, and when `CSC_LINK` is empty it
produces an unsigned binary and reports success.

Two repository secrets fix it, and the workflow already reads them:

```bash
gh secret set WINDOWS_CERT_BASE64 --repo Rathio12/LuwanTerm < cert.b64
gh secret set WINDOWS_CERT_PASSWORD --repo Rathio12/LuwanTerm
```

Where `cert.b64` comes from the `.pfx` you already have:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("build\certs\luwanterm.pfx")) |
  Set-Content cert.b64 -NoNewline
```

Delete `cert.b64` afterwards. Never commit it, and never paste the password
anywhere but the secret.

`build/check-signature.js` now runs after every release build. It reads the
Authenticode status of every executable produced, and **fails the release** if a
certificate was supplied but the output came out unsigned. Without a certificate
it reports the situation plainly and carries on, so a fork can still build.

Check any binary yourself:

```powershell
Get-AuthenticodeSignature "C:\path\to\LuwanTerm.exe" | Format-List Status, StatusMessage
```
