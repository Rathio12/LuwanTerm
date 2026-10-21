# Themes

A theme is **one small JSON file** that sets the whole look of Luwan Shell in
one go: the terminal colour scheme, the accent colour, the corners, and the
animated background with all its tuning. Like [plugins](plugins.md), a theme
is a description, not code — it can only change settings you could change
yourself in the Settings window.

```json
{
  "name": "Midnight Rain",
  "description": "Green glyphs falling behind a dark terminal.",
  "author": "you",
  "settings": {
    "terminalTheme": "luwan",
    "accentColor": "#22c55e",
    "backgroundEffect": "rain",
    "effectSpeed": 45,
    "effectNodeGlow": 55
  }
}
```

Save that as `midnight-rain.json` in your themes folder and it appears under
**Settings → Themes**.

## The quickest way to make one

You do not have to write the file by hand.

1. Open **Settings** and change things until you like what you see. Everything
   previews as you change it.
2. In **Themes**, press **Save current look as a theme** and give it a name.
3. Press **Open folder**. Your theme is there as a `.json` file, ready to edit
   or share.

If you had a background image, it is copied into the themes folder next to the
theme, so the two travel together.

## Where themes live

| Kind | Folder |
| --- | --- |
| Yours | `%APPDATA%\luwan-term\themes\` on Windows — **Open folder** takes you there |
| Built in | `src/themes/` in the app — read these as examples |

Built-in themes cannot be deleted. Yours can, with the bin icon on their card.

## Trying one

Click a theme card. The Settings window reopens with that theme's values filled
in and the whole app previewing it. **Save** keeps it; **Cancel** puts back what
you had. A theme never changes anything until you press Save.

## The file

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | Shown on the card. Up to 40 characters. |
| `description` | no | Shown when you hover the card. Up to 140 characters. |
| `author` | no | Up to 40 characters. |
| `settings` | yes | The look, as described below. |

A file must be under 32 KB. Up to 60 themes are read from the folder.

### What a theme sets, and what it leaves alone

Every look setting you **leave out goes back to its default** when the theme is
applied. That way a theme always looks the same, whatever you had before.

Three things are the exception, because they are personal rather than part of a
look. A theme only changes them if it names them:

- `fontFamily` and `fontSize`, your terminal font
- `uiFontFamily`, the interface font
- `backgroundImage`, your background picture

### Terminal

| Setting | Values | Default |
| --- | --- | --- |
| `terminalTheme` | `luwan`, `dracula`, `nord`, `gruvbox`, `one-dark`, `tokyo-night`, `catppuccin`, `solarized-dark`, `solarized-light`, `github-light` | `luwan` |
| `fontFamily` | any font stack, e.g. `"Cascadia Code, monospace"` | your font |
| `fontSize` | 9 – 28 | your size |
| `fontWeight` | `300`, `normal`, `500`, `600`, `bold` | `normal` |
| `lineHeight` | 100 – 200 (percent) | 100 |
| `letterSpacing` | 0 – 6 (pixels) | 0 |
| `terminalPadding` | 0 – 40 (pixels) | 12 |
| `terminalOpacity` | 20 – 100 (percent; lower shows the background through) | 100 |
| `cursorStyle` | `bar`, `block`, `underline` | `bar` |
| `cursorBlink` | `true` or `false` | `true` |

### Interface

| Setting | Values | Default |
| --- | --- | --- |
| `accentColor` | a colour as `#rrggbb` | `#7c5cff` |
| `uiCorners` | `square`, `subtle`, `default`, `round` | `default` |
| `uiFontFamily` | any font stack, or `""` for the built-in one | your font |

### Background image

| Setting | Values | Default |
| --- | --- | --- |
| `backgroundImage` | a file name in the themes folder, e.g. `"night.jpg"`, or `""` for none | your image |
| `backgroundOpacity` | 0 – 100 | 60 |
| `backgroundBlur` | 0 – 40 (pixels) | 0 |

The image must sit in the themes folder itself: `night.jpg` works,
`pictures/night.jpg` and `C:\night.jpg` do not. That keeps a theme from reading
files anywhere else on your disk. PNG, JPEG, WebP, GIF and BMP are accepted.

When you **Add from file**, an image named in the theme is copied in with it if
it sits next to the `.json` you picked.

### Animated background

`backgroundEffect` picks one of five, or `none`:

| Effect | What it looks like |
| --- | --- |
| `constellation` | Drifting nodes that link up with thin lines when they come close |
| `flow` | Thousands of particles drifting on a smooth current, leaving silky trails |
| `rain` | Columns of glyphs falling down the window |
| `dots` | A grid of dots rippling like a slow wave, swelling and glowing at the crests |
| `horizon` | A neon perspective grid rolling toward you under a striped, glowing sun |

Older names still work: `starfield` becomes `flow`, `waves` becomes `dots`
and `aurora` becomes `horizon`.

These tune it. Not every setting matters for every effect — the last column
says which use it.

| Setting | Values | Default | Used by |
| --- | --- | --- | --- |
| `effectDensity` | 10 – 220 | 90 | all — how many nodes, particles, columns or dots, or how many grid lines |
| `effectSpeed` | 0 – 100 (0 holds still) | 30 | all |
| `effectNodeGlow` | 0 – 100 (0 turns the glow off) | 60 | all |
| `effectNodeSize` | 50 – 250 (percent) — nodes, trails, glyphs, dots, or the sun | 100 | all |
| `effectOpacity` | 10 – 100 (the whole effect) | 100 | all |
| `effectAccent` | `true` uses `accentColor`, `false` uses `effectColor` | `true` | all |
| `effectColor` | a colour as `#rrggbb` | `#4a7cff` | all, when `effectAccent` is `false` |
| `effectGrid` | `true` or `false` — a faint grid in the top-right corner | `true` | all |
| `effectGridSize` | 24 – 160 (pixels) | 64 | all, when the grid is on |
| `effectGlow` | `true` or `false` — a soft glow in the bottom-left corner | `true` | all |
| `effectPulse` | `true` or `false` — twinkling, or a shimmer across the dots | `true` | constellation, dots |
| `effectMouse` | `true` or `false` — the effect answers the pointer: lines to it, a swirl in the flow, a ripple in the dots, the horizon leaning | `true` | constellation, flow, dots, horizon |
| `effectMouseForce` | `none`, `repel`, `attract` | `none` | constellation |
| `effectLinks` | 60 – 240 (pixels) — how close two nodes must be to link | 130 | constellation |
| `effectLineWidth` | 3 – 20 (tenths of a pixel) | 7 | constellation, flow, horizon |
| `effectLineOpacity` | 0 – 100 — for the flow, how long the trails linger | 70 | constellation, flow |

Flow and horizon take a few shades either side of your colour on their own, so
one colour is enough to get a range.

## When a theme is wrong

A file with a mistake is still listed, in red, with what is wrong in plain
words — for example:

- `"webgl" is not a setting a theme can change`
- `"backgroundEffect" has a value it cannot take: "fireworks"`
- `backgroundImage "night.jpg" is not in the themes folder`

Numbers outside their range are not errors; they are pulled to the nearest
allowed value. A colour that is not `#rrggbb` is an error.

## What a theme can never do

- Run anything. It is read as data and every value is checked against the same
  rules the Settings window uses.
- Touch your hosts, keys, snippets, plugins, Discord settings or update channel.
- Read a file outside the themes folder.

## Sharing one

Send the `.json` file — and the image, if it uses one. The other person presses
**Add from file** in Settings → Themes and picks it. If you would like yours to
ship with the app, open a pull request that adds it to `src/themes/`; the test
suite checks every file there.
