# `test/browser` — the browser tier

Six scripts that drive a real headless Chrome over the DevTools Protocol
against a **running dev server**, and assert the things the node suite cannot
see: computed layout, effects, events, network, and pixels.

```bash
npm run dev                       # in one terminal (defaults to :3000)
npm run test:browser              # in another

FC_PORT=3010 npm run test:browser         # a dev server on another port
FC_ORIGIN=https://preview.example npm run test:browser
CHROME_PATH=/path/to/chrome npm run test:browser
npm run test:browser strip click          # just those two
```

---

## It is not part of `npm test`, and must not become part of it

`npm test` has to pass on a laptop with no dev server, no Chrome and no
network. That is what makes it worth running before every commit. This tier
needs all three, so it is enumerated only in `run.mjs`:

* `test/run.mjs` walks the tiers `pure`, `fs` and `render`. `browser` is not
  one of them.
* Its discovery guard — the one that catches a test file nothing runs — looks
  for `*.test.mjs`. Nothing in this directory is named that, deliberately.
* So neither the suite's file count nor its FLOOR moves when a script is added
  here.

If you add a script, add it to `SCRIPTS` in `run.mjs`. Do not name it
`*.test.mjs`.

---

## Why it lives in the repo

It was rebuilt from scratch three sessions running, because it lived in a temp
directory that gets wiped. The rebuild was the smaller half of the cost: the
assertion **counts** changed each time (13→21, 12→15, 46→63), so "no regression
since last round" could not be compared against anything.

The load-bearing reason is coupling. Every script here asserts on `data-fc-*`
hooks, class names and layout numbers that the components own. When a component
changes, its guard must change **in the same commit** — otherwise the two drift
and you eventually get a green run against code that is broken. Living in the
repo is what makes that possible.

---

## What each script guards

| script | guards |
| --- | --- |
| `strip.mjs` | The carousel's geometry against the two Figma mockups, at 1440 and 375: control row between stage and strip, 12:5 stage, 16:9 thumbnails, four cards visible plus a peek, the fades, the counter and the track agreeing, the controls clear of the fixed dock, the mobile hint. |
| `autoslide.mjs` | The timer and every one of its pause conditions by name (`data-fc-paused`): hover and focus pause transiently and resume themselves; off-screen pauses; Stop, an arrow and a strip click take control permanently and only Play gives it back; the index wraps. |
| `click.mjs` | The image card is **one** anchor — no nested anchor, no `<button>`, no focusable descendant — and one tap opens exactly one tab. 375 only, because that is where the copy block exists. |
| `youtube.mjs` | The facade: **zero** requests to `youtube.com` / `youtube-nocookie.com` before the first click, inactive slides render no `<img>` at all, pressing play mounts the nocookie player, and leaving the slide unmounts it. |
| `seam.mjs` | The hero→section seam: the section is inert so it cannot eat the hero's clicks, the aurora spills rather than clips, no gradient stop is CSS `transparent`, and — measured in pixels across five columns — there is no band. Ends by injecting a band to prove the detector fires. |
| `scrolly.mjs` | `window.scrollY` is constant across a **full** auto-slide cycle at 1440 and 375, with the strip proven to have scrolled. Slow: ~2 minutes. |

`shot.mjs` is a **tool**, not a guard — it captures screenshots and asserts
nothing, so `run.mjs` does not call it and it reports no count. It writes to the
OS temp directory unless `FC_SHOT_DIR` says otherwise; it must never write into
the repo.

`cdp.mjs` is the driver: Chrome discovery, the protocol client, `openPage`, and
the assertion tape.

---

## Environment

| variable | meaning | default |
| --- | --- | --- |
| `FC_ORIGIN` | full origin, wins over everything | — |
| `FC_PORT` | port on `127.0.0.1` | — |
| `PORT` | the variable `next dev` itself reads | — |
| *(none of the above)* | | `http://127.0.0.1:3000` |
| `CHROME_PATH` | browser executable | discovered per platform |
| `FC_SHOT_DIR` | where `shot.mjs` writes | OS temp dir |

`127.0.0.1`, not `localhost`: on a machine where `localhost` resolves to `::1`
first, the dev server may only be listening on IPv4 and every request fails in a
way that looks like the page is broken.

Chrome is discovered via `CHROME_PATH` first — the same variable puppeteer,
playwright and lighthouse read — then the usual install locations for the
platform, then Edge on Windows, which is Chromium and speaks the same protocol.

---

## Five traps, each paid for once

These are not hypotheticals. Every one of them produced a wrong answer that
looked like a product defect before it was understood.

### 1. `Browser.close` is answered by dying, so its reply never arrives

The browser executes the command and terminates, so the response is never
written to the socket. `await browser.send('Browser.close')` therefore never
settles, and the symptom is a run that prints **all of its results, green**, and
then simply does not exit.

Every call in `cdp.mjs` has a 30-second deadline, and `close()` races the command
against a 1.5s timer rather than awaiting it. Put a deadline on every call, not
just on the one you know about — any command whose target dies mid-flight has
the same shape.

### 2. `Emulation.setEmitTouchEventsForMouse` silently swallows `Input.dispatchMouseEvent`

With it enabled, the mouse command is neither executed nor acknowledged. Without
a deadline (trap 1) the run hangs; with one you get `CDP timeout:
Input.dispatchMouseEvent` and no idea why.

`openPage` enables `setTouchEmulationEnabled` for mobile viewports — so the page
still reports a touch device — but **never** `setEmitTouchEventsForMouse`. Taps
go through `page.tap()`, which dispatches a pointer press.

Related: a raw `touchStart`/`touchEnd` pair over CDP does *not* go through the
gesture recogniser, so it never synthesises the click an anchor needs. Measured:
**0** navigations from a touch pair, **1** from a mouse press. `page.swipe()`
exists for the gesture path, where real touch events are the point.

### 3. `Page.captureScreenshot`'s `clip` is in PAGE coordinates, not viewport

Passing a `getBoundingClientRect()` straight in photographs whatever is that far
down the **document**. In `seam.mjs` this produced a confident "126-unit band at
the seam" that was the hero mascot, 3000px above the seam — and it explained why
injecting a real band changed the reading by nothing at all: the injected band
was never inside the window being read.

Always add `scrollX` / `scrollY`:

```js
const r = el.getBoundingClientRect();
const clip = { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
```

And if the subject is taller than the viewport, grow the viewport rather than
using `captureBeyondViewport` — that stitches tiles, and a **fixed** header gets
painted into every tile. See `shoot()` in `shot.mjs`.

### 4. Headless Chrome reports `prefers-reduced-motion: reduce` by default

`--force-prefers-reduced-motion=0` on the command line does **not** change it.

The carousel honours the query, so left alone it correctly refuses to
auto-start, every timing assertion reads `data-fc-paused="reduced-motion"`, and
you spend an hour looking at a component that is behaving perfectly. Worse: a
test written the other way round — "assert it does not advance" — **passes here
for entirely the wrong reason** and would keep passing after auto-slide broke.

`openPage` always sets it explicitly:

```js
await s('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
});
```

Pass `reducedMotion: true` to test the other branch on purpose.

### 5. A tap on an external link opens a new tab and never navigates this page

The mapper resolves external banner links with `target="_blank"`, so activating
one opens a **new browser target**. This page does not navigate, which means
every instrument aimed at *this page* reads zero and looks like a dead link: no
`Network.requestWillBeSent`, no `Page.frameRequestedNavigation`, no
`Page.navigatedWithinDocument`.

Count targets instead:

```js
const { targetInfos } = await browser.send('Target.getTargets');
targetInfos.filter((i) => i.type === 'page' && i.url.startsWith(href)).length;
```

That is also the *right* instrument for `click.mjs`: the defect it guards is a
nested control firing the inner activation **and** the outer one, and two
activations of one `_blank` anchor are two tabs.

---

## Writing a new script

```js
import { launch, openPage, tape } from './cdp.mjs';

const t = tape('my-guard');
const { browser, close } = await launch();
const page = await openPage(browser, { width: 1440, height: 900 });
try {
  await page.goto('/', { waitMs: 5000 });
  t.eq(await page.eval(() => document.title), '…', 'the title');
} finally {
  await close();
}
const r = t.report();
process.exit(r.ok ? 0 : 1);
```

The closing line `[name] passed/total` is the **only** contract between a script
and `run.mjs`. A script that changes that shape still runs but stops
contributing a count, and the runner will say so rather than assume zero
silently.

Prefer `t.ok(cond, label, detail)` with a detail string that prints the measured
number even when it passes — a green run whose numbers are visible is what makes
the next round's comparison possible, which is the whole reason this directory
exists.

**Every script should end with a control** that proves its detector can fire.
`seam.mjs` injects a band; `scrolly.mjs` asserts the strip actually scrolled.
A guard that has never failed is not yet known to be a guard.
