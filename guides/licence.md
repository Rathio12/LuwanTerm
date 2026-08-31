# Licence

LuwanTerm is published under the [LuwanTerm Licence 1.0](../LICENSE). This page
explains it in plain English. Where the two disagree, the licence wins — but the
licence was written to be readable, so they should not disagree.

## The one-line version

**Use it for anything, change it, share it. Just don't sell it, and don't use it
to hurt people.**

## Can I ...?

| | |
| --- | --- |
| Use it at my job | **Yes.** Being paid for your work is not selling LuwanTerm. |
| Use it at a company, on 200 machines | **Yes.** No seat count, no licence key, no audit. |
| Use it on a client's servers, on a paid engagement | **Yes.** You are paid for the engagement. |
| Fork it and publish my fork | **Yes**, under the same licence, saying what you changed. |
| Ship it inside my own free tool | **Yes**, under the same licence. |
| Sell copies of it, renamed | **No.** |
| Put it in a product people pay for | **No**, where LuwanTerm is part of what they are paying for. |
| Run it as a paid hosted service | **No.** |
| Charge a client for a LuwanTerm support contract | **No.** |
| Put a feature of it behind a paywall | **No.** |
| Use it to test a system I have written permission to test | **Yes.** That is authorised access. |
| Use it to get into a system I have no permission for | **No**, and your licence ends on the spot. |

## Why "not for sale" and not just MIT

The work is free. It is not free to *resell*. Those are different things, and MIT
only expresses the first. Anyone can take an MIT project, rename it, and sell it
without giving anything back — that is a legitimate choice some projects make,
and it is not the choice here.

The intent is narrow. You should never have to think about this licence to *use*
LuwanTerm, in any setting, for any purpose, at any scale. It only becomes
relevant the moment somebody tries to charge for it.

## Why not "open source"

The Open Source Initiative's definition requires that a licence place **no
restriction on the field of endeavour** — you cannot say "not for business" or
"not for weapons" and still meet it. This licence restricts selling and it
restricts harmful use, so it does not qualify, and calling it open source would
be inaccurate.

The honest word is **source-available**. Everything is here: the full source,
the build, the tests, the history. You can read it, audit it, fork it, and send
patches. What you cannot do is put a price on it.

Practical consequences worth knowing:

- GitHub will not display a recognised licence label, because the licence is
  bespoke.
- Some companies have policies that only permit OSI-approved licences. They can
  still *use* LuwanTerm, but their tooling may flag it.
- It cannot be combined with GPL code in one work, because the GPL forbids the
  extra restrictions.
- Linux distributions generally will not package it.

If those matter more to you than the no-selling rule, fork it and negotiate —
the licensor can always grant different terms for a specific case.

## The acceptable use clause

Section 8 of the licence bans using LuwanTerm to break into systems, to surveil
or harass people, to discriminate, or to trample on human rights. It names the
Universal Declaration of Human Rights and three other international instruments
as the standard, rather than leaving "harm" to mean whatever anyone wants it to.

This is not decoration. LuwanTerm is a remote access tool, and the realistic
abuse of a remote access tool is getting into machines that are not yours.

The line is **authorisation**. Penetration testing, red teaming and security
research are all fine — expected, even — when you have permission from whoever
is entitled to give it. The same commands against a system you have no
permission for are not, and breaching section 8 ends your licence immediately,
with no chance to fix it.

## Contributing

Contributions are welcome and are the reason the source is public.

- **You keep your copyright.** No copyright assignment, no CLA to sign.
- **Your contribution goes out under the same licence**, so everyone downstream
  gets it on the same terms you did.
- **You confirm it is yours to give** — that you wrote it, or otherwise have the
  right to submit it.

That is the whole arrangement, and it is in section 10 of the licence. See
[CONTRIBUTING](../CONTRIBUTING.md) for how to actually get set up and what the
checks expect.

## What the licence does not cover

LuwanTerm depends on other people's work — [Electron](https://electronjs.org),
[ssh2](https://github.com/mscdex/ssh2), [xterm.js](https://xtermjs.org) and
their dependencies. Every one of those is MIT licensed and stays under its own
terms; this licence covers LuwanTerm's own code and assets and changes nothing
about them.

The font catalogue in [`fonts/`](../fonts/README.md) ships **no font binaries**,
only names. The fonts themselves stay under whatever licence their foundries
chose.

## Wanting different terms

The licensor can grant them. If you have a use that the no-selling rule blocks
and you think it should be allowed, open an issue and ask. A licence is a
starting position, not a wall.
