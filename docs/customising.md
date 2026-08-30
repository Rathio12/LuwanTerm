# Make it your own

There's no build step and no framework. Edit a file, restart with `npm start`,
see the change. This guide walks through the things people usually want to
change first.

## Rename and rebrand it

Four places carry the name:

| What | Where |
| --- | --- |
| Product name, app id, installer name | `package.json` → `build.productName`, `build.appId`, `build.nsis.shortcutName` |
| Window title and titlebar text | `src/renderer/index.html` → `<title>` and `.brand-name` |
| Splash screen | `src/renderer/splash.html` → `.name` |
| Icon | `build/make-icon.js` |

Changing `build.appId` or `productName` changes the `userData` folder name, so
the app will start with empty settings — that's usually what you want when
forking, but be aware of it.

### The icon

It's drawn in code, not loaded from an asset. In
[`build/make-icon.js`](../build/make-icon.js):

```js
const ACCENT_A = [124, 92, 255];   // gradient start
const ACCENT_B = [75, 124, 255];   // gradient end
const RADIUS = 56;                 // corner rounding
```

The mark itself is three round-capped strokes:

```js
coverage(segmentDistance(px, py, 84, 82, 138, 128, 22)),   // top of the >
coverage(segmentDistance(px, py, 138, 128, 84, 174, 22)),  // bottom of the >
coverage(segmentDistance(px, py, 150, 174, 196, 174, 22))  // the _
```

Change the numbers, run `npm run make-icon`, open `build/icon.png` to check it.

## Retheme the UI

Every colour, radius, shadow and timing lives in
[`src/renderer/styles/tokens.css`](../src/renderer/styles/tokens.css). Change a
token and it propagates everywhere.

```css
:root {
  --accent: #7c5cff;      /* primary accent, buttons, active states */
  --cyan: #3ea8ff;        /* secondary accent */
  --bg-base: #0a0b12;     /* window background */
  --glass: rgba(255,255,255,0.045);  /* panel fill */
  --stroke: rgba(255,255,255,0.09);  /* panel borders */
  --r-lg: 16px;           /* panel corner radius */
}
```

For a green build, change `--accent`, `--accent-soft`, `--accent-line` and
`--bg-wash-a` together — they're tinted variants of the same hue.

The three stylesheets load in order and each has a job:
`tokens.css` (values) → `base.css` (resets, scrollbars, the ambient background) →
`app.css` (components).

## Terminal colours

Separate from the UI, because xterm needs a palette object. In
[`src/renderer/js/terminal.js`](../src/renderer/js/terminal.js):

```js
const THEME = {
  background: '#0a0b12',
  foreground: '#e9ecf8',
  cursor: '#7c5cff',
  red: '#ff5c72',
  green: '#22c58b',
  // ...the full 16-colour ANSI palette
};
```

Drop any standard terminal theme in here — the key names match what xterm.js
expects.

## Add a sidebar panel

Say you want a "Notes" tab beside Hosts, Keys and Snippets.

**1. Markup** — `src/renderer/index.html`, add the tab and its panel:

```html
<button class="stab" data-panel="notes"><svg><use href="#i-code"/></svg>Notes</button>
```

```html
<section class="spanel" data-panel="notes">
  <div class="note-list" id="note-list"></div>
</section>
```

**2. Module** — create `src/renderer/js/notes.js` following the shape every
other module uses:

```js
(function (App) {
  'use strict';
  const { h, qs } = App.dom;

  function render() {
    qs('#note-list').replaceChildren(h('div', { class: 'hint', text: 'Nothing yet.' }));
  }

  App.notes = { render };
})(window.App);
```

**3. Load it** — add a `<script src="js/notes.js"></script>` in `index.html`
*before* `app.js`.

**4. Wire the button label** — in `src/renderer/js/app.js`:

```js
const NEW_LABELS = { hosts: 'New host', keys: 'New key', snippets: 'New snippet', notes: 'New note' };
const SEARCH_HINTS = { /* ...same shape... */ };
```

Panel switching is generic — it works off `data-panel`, so nothing else needs
touching.

## Add something the main process does

The renderer can't touch the filesystem or the network directly — it goes
through the preload bridge. Adding a capability is three small edits.

**1. Handler** — in the right `src/main/ipc/*.js`:

```js
handle('notes:list', () => notes.list());
```

`handle` wraps the result in `{ ok, data, error }` and logs failures, so throwing
a plain `Error` with a readable message is the correct way to fail.

**2. Expose it** — `src/main/preload.js`:

```js
notes: {
  list: () => call('notes:list'),
},
```

`call` unwraps the envelope and throws a real `Error`, so renderer code just
uses `try/catch`.

**3. Use it** — anywhere in the renderer:

```js
const items = await window.term.notes.list();
```

Push events the other way with `manager.send('notes:changed', payload)` from
main, and subscribe in preload with `subscribe('notes:changed', cb)`.

## Change what Discord shows

In [`src/main/main.js`](../src/main/main.js), `updatePresence()` builds the
text:

```js
discord.setPresence({ details: 'LuwanTerm', state });
```

`details` is the top line, `state` the second. Keep the host-name guard unless
you have a reason to drop it — see [Discord presence](discord.md).

## Change the splash

[`src/renderer/splash.html`](../src/renderer/splash.html) is a single
self-contained page. Timing is in `src/main/main.js`:

```js
const SPLASH_MIN_MS = 700;      // never flash by too fast
const SPLASH_TIMEOUT_MS = 8000; // show the window anyway if the renderer never reports in
```

The window appears once the renderer calls `window.term.app.ready()` at the end
of `boot()` — not on first paint, so you never see a half-built UI.

## Add a setting

**1.** Add it to `DEFAULTS` in
[`src/main/store/settings.js`](../src/main/store/settings.js). The type of the
default drives validation — booleans get coerced, numbers get clamped by
`CLAMP`.

**2.** Add a control in `src/renderer/js/settings.js`, both to the `fields`
object and to the `onSubmit` payload.

That's it — persistence, validation and the settings dialog are generic.

## House style

Worth matching if you want the codebase to stay readable:

- **No bundler, no framework.** Renderer modules are plain scripts in an IIFE
  attaching to `window.App`.
- **Comments explain *why*, not *what*.** If a line needs a comment to say what
  it does, rename something instead.
- **Errors are for humans.** `throw new Error('Port must be between 1 and 65535.')`,
  not an error code.
- **Fail safe on optional things.** Discord, WebGL and the OS keychain all
  degrade quietly rather than breaking the app.
- **Never touch a user's files.** The app deletes only what it created. See
  [keys](keys.md).

## Things worth knowing before you dig in

- Shell output can arrive *before* the terminal exists (the connect promise
  resolves after the shell opens). `sessions.js` buffers it in `pending` and
  flushes on mount. Don't remove that.
- `ssh2` 1.17 generates an unusable Ed25519 key roughly once in 256 — it strips
  a leading zero byte from the public key. `keygen.js` verifies every generated
  pair and discards bad ones. Don't remove that loop either.
- Each SFTP transfer opens its own channel so cancelling one can't disturb the
  file listing or another transfer.
