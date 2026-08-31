# Fonts

The families LuwanTerm knows about: **193** across
5 groups. Settings shows the ones you actually have installed, each
rendered in its own face so you can judge it before picking.

## No font files are bundled

This folder holds a **catalogue, not binaries**. Shipping the fonts themselves
would mean redistributing work under licences that mostly do not allow it, and
would add hundreds of megabytes to a terminal app. Install the ones you want and
LuwanTerm will find them.

Most of the open source ones are on [Google Fonts](https://fonts.google.com/?classification=Monospace),
[Nerd Fonts](https://www.nerdfonts.com/font-downloads) or the project's own site.

## Seeing them

- **In the app** — Settings lists every installed family with a live preview.
- **In a browser** — open [preview.html](preview.html). Installed families render
  in themselves; the rest are dimmed and marked.

GitHub strips style attributes from Markdown, so the table below cannot show the
actual typefaces. That is what `preview.html` is for.

## Adding one

Any font works, whether or not it is listed here — the box in Settings accepts a
full CSS font stack, so `"My Font", monospace` is fine.

To have it appear in the picker, add it to `fonts.json` and run:

```bash
node build/make-font-preview.js
```

That regenerates this file and `preview.html`. A monospaced font is strongly
recommended; a proportional one will make columns misalign.

## The catalogue

### Open source coding fonts

_85 families_

| Family |
| --- |
| JetBrains Mono |
| Fira Code |
| Fira Mono |
| Source Code Pro |
| IBM Plex Mono |
| Hack |
| Inconsolata |
| Inconsolata Go |
| Iosevka |
| Iosevka Term |
| Victor Mono |
| Cascadia Code |
| Cascadia Mono |
| Cascadia Next |
| Roboto Mono |
| Ubuntu Mono |
| Ubuntu Sans Mono |
| DejaVu Sans Mono |
| Liberation Mono |
| Noto Sans Mono |
| PT Mono |
| Space Mono |
| Anonymous Pro |
| Share Tech Mono |
| Overpass Mono |
| Red Hat Mono |
| Martian Mono |
| Geist Mono |
| Commit Mono |
| Departure Mono |
| Intel One Mono |
| Maple Mono |
| Recursive Mono |
| Lilex |
| Monofur |
| Monoid |
| Mononoki |
| Cousine |
| Cutive Mono |
| Nanum Gothic Coding |
| Oxygen Mono |
| Syne Mono |
| VT323 |
| Xanh Mono |
| B612 Mono |
| Azeret Mono |
| DM Mono |
| Fragment Mono |
| Chivo Mono |
| Sometype Mono |
| Spline Sans Mono |
| Kode Mono |
| Workbench |
| Fantasque Sans Mono |
| Hasklig |
| Go Mono |
| Envy Code R |
| Hermit |
| Camingo Code |
| Luculent |
| ProFont |
| Agave |
| Aurulent Sans Mono |
| Edlo |
| Meslo LG S |
| Meslo LG M |
| Meslo LG L |
| Sudo |
| Verily Serif Mono |
| Bitstream Vera Sans Mono |
| Nimbus Mono PS |
| FreeMono |
| Luxi Mono |
| Sarasa Mono |
| Monaspace Neon |
| Monaspace Argon |
| Monaspace Xenon |
| Monaspace Radon |
| Monaspace Krypton |
| 0xProto |
| Gintronic |
| Reddit Mono |
| Server Mono |
| Zed Mono |
| Adwaita Mono |

### Bitmap and pixel fonts

_20 families_

| Family |
| --- |
| Terminus |
| Tamsyn |
| Gohu GohuFont |
| ProggyClean |
| ProggyCleanTT |
| ProggyVector |
| Scientifica |
| Cozette |
| Creep |
| Curie |
| Spleen |
| Tewi |
| Unifont |
| Zpix |
| Dina |
| Fixedsys Excelsior |
| Peep |
| Siji |
| Lemon |
| Berkelium |

### Nerd Font patched

_50 families_

| Family |
| --- |
| JetBrainsMono Nerd Font |
| FiraCode Nerd Font |
| FiraMono Nerd Font |
| Hack Nerd Font |
| MesloLGS NF |
| MesloLGM NF |
| MesloLGL NF |
| CaskaydiaCove Nerd Font |
| CaskaydiaMono Nerd Font |
| SauceCodePro Nerd Font |
| DroidSansMono Nerd Font |
| UbuntuMono Nerd Font |
| UbuntuSans Nerd Font |
| InconsolataGo Nerd Font |
| Iosevka Nerd Font |
| IosevkaTerm Nerd Font |
| VictorMono Nerd Font |
| RobotoMono Nerd Font |
| SpaceMono Nerd Font |
| DejaVuSansMono Nerd Font |
| BlexMono Nerd Font |
| Terminess Nerd Font |
| ProggyClean Nerd Font |
| Monofur Nerd Font |
| Mononoki Nerd Font |
| Hasklug Nerd Font |
| AnonymicePro Nerd Font |
| GoMono Nerd Font |
| Lilex Nerd Font |
| ComicShannsMono Nerd Font |
| Agave Nerd Font |
| Arimo Nerd Font |
| AurulentSansMono Nerd Font |
| BigBlueTerminal Nerd Font |
| CodeNewRoman Nerd Font |
| Cousine Nerd Font |
| DaddyTimeMono Nerd Font |
| EnvyCodeR Nerd Font |
| Gohu Nerd Font |
| Hermit Nerd Font |
| Inconsolata Nerd Font |
| IntelOneMono Nerd Font |
| Lekton Nerd Font |
| LiberationMono Nerd Font |
| Noto Nerd Font |
| OpenDyslexicM Nerd Font |
| Overpass Nerd Font |
| ShareTechMono Nerd Font |
| Tinos Nerd Font |
| ZedMono Nerd Font |

### System and vendor

_21 families_

| Family |
| --- |
| Consolas |
| Courier New |
| Courier |
| Lucida Console |
| Lucida Sans Typewriter |
| Menlo |
| Monaco |
| SF Mono |
| SFMono-Regular |
| Andale Mono |
| Terminal |
| MS Gothic |
| NSimSun |
| SimSun-ExtB |
| MingLiU |
| MingLiU-ExtB |
| Osaka-Mono |
| Segoe UI Mono |
| Apple SD Gothic Mono |
| Droid Sans Mono |
| Roboto Mono for Powerline |

### Commercial

_17 families_

| Family |
| --- |
| MonoLisa |
| Berkeley Mono |
| Operator Mono |
| Dank Mono |
| PragmataPro |
| Input Mono |
| Triplicate Code |
| Nitti |
| Cartograph CF |
| Comic Code |
| Pitch |
| Söhne Mono |
| Gintronic Pro |
| Rec Mono |
| TX-02 |
| Codelia |
| iA Writer Mono |
