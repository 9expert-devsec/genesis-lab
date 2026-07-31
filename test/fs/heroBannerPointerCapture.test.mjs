import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * THE INVARIANT: nothing in src/ calls `setPointerCapture`.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * HeroBannerCarousel's drag handler called
 * `e.currentTarget.setPointerCapture(e.pointerId)` on every mouse pointerdown.
 * While an element holds pointer capture the browser RETARGETS the compatibility
 * click to the capturing element, so a click on a CTA `<a>` inside a slide was
 * dispatched at the carousel container — an ANCESTOR of the link — and the
 * anchor never saw it. Every image banner and every CTA on the homepage hero
 * was dead on desktop. Touch was unaffected (it goes through useSwipe's native
 * touch listeners, which never capture), so the bug was desktop-only and
 * survived mobile testing.
 *
 * ── WHY A BLANKET BAN, AND WHY THE FS TIER ──────────────────────────────────
 * setPointerCapture has no legitimate use anywhere in this codebase. Nothing
 * here implements a slider, a canvas gesture or a resize handle — the one place
 * that ever called it is the one place it broke. So the guard is a total ban
 * rather than a carve-out for this file: a carve-out invites the next component
 * to copy the pattern, and the failure mode (a link that silently does nothing
 * on one input modality) is invisible to every other check in the repo,
 * including `next build`, which compiles it happily.
 *
 * It cannot live in the render tier: capture is a RUNTIME event-routing
 * behaviour with no rendered output, there is no jsdom in this repo, and
 * renderToStaticMarkup never dispatches a pointer event. A source scan is the
 * only thing that can see this at all. What that means it CANNOT see is
 * enumerated at the bottom of this file.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const CAROUSEL_REL = 'src/app/_components/home/HeroBannerCarousel.jsx';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Comments stripped before matching. This is not hygiene, it is REQUIRED: the
 * fixed carousel carries a long doc block explaining why setPointerCapture must
 * not be called, and that block names it. A raw scan would go red on the very
 * comment that documents the fix, and the obvious "fix" for that would be to
 * delete the explanation — trading the code guard for the prose guard.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

const FILES = walk(SRC).map((full) => ({
  rel: path.relative(ROOT, full).split(path.sep).join('/'),
  raw: readFileSync(full, 'utf8'),
}));
for (const f of FILES) f.code = stripComments(f.raw);

const carousel = FILES.find((f) => f.rel === CAROUSEL_REL);
assert.ok(carousel, `${CAROUSEL_REL} not found — re-point CAROUSEL_REL`);

/** Any call, on any receiver, however the element was obtained. */
const CAPTURE_CALL = /\bsetPointerCapture\s*\(/;

test('NO file in src/ calls setPointerCapture', () => {
  const offenders = FILES.filter((f) => CAPTURE_CALL.test(f.code)).map((f) => f.rel);
  assert.deepEqual(
    offenders,
    [],
    `setPointerCapture is back in: ${offenders.join(', ')}. It retargets the ` +
      `subsequent click to the capturing element, which kills every link inside it.`
  );
});

test('CONTROL: the walker actually walked src/', () => {
  // Without this, a broken walk (wrong root, an exception swallowed into an
  // empty list) makes the ban above pass over ZERO files — the runner-level
  // false-green, scoped to one test.
  assert.ok(FILES.length > 100, `only ${FILES.length} source files scanned — the walk is broken`);
  assert.ok(FILES.some((f) => f.rel === CAROUSEL_REL));
});

test('CONTROL: comment stripping is live, proven on the real file', () => {
  // Not a synthetic fixture: the shipped carousel names setPointerCapture in
  // its doc block and nowhere else. So this asserts, on real content, both that
  // the stripper removes comments AND that the ban above is reading stripped
  // text. If stripComments silently became the identity function, the ban would
  // go red on prose; if it became over-eager and blanked whole files, the ban
  // would go green on anything.
  assert.match(carousel.raw, /setPointerCapture/, 'the explanatory comment is gone — did someone delete the note?');
  assert.doesNotMatch(carousel.code, /setPointerCapture/);
  assert.ok(carousel.code.includes('handlePointerDown'), 'stripping ate the code as well as the comments');
});

test('CONTROL: the matcher finds a call when one is present', () => {
  const injected = stripComments('function f(e) { e.currentTarget.setPointerCapture(e.pointerId); }');
  assert.equal(CAPTURE_CALL.test(injected), true, 'the matcher is dead — the ban proves nothing');
  // And it is a CALL matcher, not a word matcher: the string alone is not enough.
  assert.equal(CAPTURE_CALL.test('const note = "setPointerCapture";'), false);
});

test('the carousel container carries no pointer move/up/leave handlers', () => {
  // The replacement design tracks the drag on WINDOW listeners. React handlers
  // on the container were part of the captured-pointer design and reintroducing
  // one is how the old shape comes back.
  for (const prop of ['onPointerMove', 'onPointerUp', 'onPointerLeave']) {
    assert.doesNotMatch(
      carousel.code,
      new RegExp(`${prop}\\s*=\\s*\\{`),
      `${prop} is back on the carousel container — drag tracking belongs on window`
    );
  }
  assert.match(carousel.code, /onPointerDown\s*=\s*\{/, 'the drag must still START somewhere');
});

test('drag tracking is registered on window, and cleaned up', () => {
  for (const evt of ['pointermove', 'pointerup', 'pointercancel']) {
    assert.match(
      carousel.code,
      new RegExp(`window\\.addEventListener\\("${evt}"`),
      `no window listener for ${evt} — the drag cannot be tracked without capture`
    );
    assert.match(
      carousel.code,
      new RegExp(`window\\.removeEventListener\\("${evt}"`),
      `${evt} is added but never removed`
    );
  }
});

test('the iframe gate reads the THRESHOLD flag, not the pointer-down flag', () => {
  // Gating the video card's pointer-events on `isPointerDown` would disable the
  // iframe on mousedown, before any movement — so a plain click-to-play would
  // resolve against an ancestor and the video would not play. That is the same
  // click-lands-on-an-ancestor defect this whole change exists to remove, moved
  // to a new place, and no test in this repo could observe it.
  assert.match(carousel.code, /isDragging=\{isActivelyDragging\}/, 'the video card must be gated on the threshold flag');
  assert.doesNotMatch(carousel.code, /isDragging=\{isPointerDown\}/, 'the iframe gate is back on pointer-down');
});

test('the threshold flag is raised in exactly one place', () => {
  // One setter, inside the movement handler. A second one elsewhere is how it
  // drifts back to meaning "pointer is down".
  const raises = carousel.code.match(/setIsActivelyDragging\(true\)/g) ?? [];
  assert.equal(raises.length, 1, `expected exactly one setIsActivelyDragging(true), found ${raises.length}`);
  // And it is guarded by the distance test rather than standing alone.
  assert.match(carousel.code, /Math\.abs\([^)]*startX\)\s*>\s*5[\s\S]{0,220}setIsActivelyDragging\(true\)/);
});

/**
 * ── WHAT THIS FILE CANNOT SEE ───────────────────────────────────────────────
 * Stated rather than left to be discovered. There is no jsdom in this repo and
 * the render tier does not dispatch events, so every item below is verified by
 * a human in a browser and by nothing else:
 *
 *   · that a click on a CTA actually navigates — this file proves only that the
 *     mechanism which broke it is absent, never that the link works
 *   · the window-listener LIFECYCLE: that they are registered on pointerdown,
 *     removed on pointerup/pointercancel, and removed again on unmount. The
 *     assertions above see the strings `addEventListener`/`removeEventListener`
 *     in the file; they cannot see whether the removal ever runs, whether it
 *     passes the same function reference, or whether a drag leaks a listener
 *   · the `moved` reset on the touch branch of handlePointerDown, and the
 *     decision NOT to reset it in onUp — pure event-ordering behaviour
 *   · the iframe gating from the last two tests: that the video still PLAYS on
 *     a plain desktop click, that a drag across the video still advances the
 *     carousel, and that a drag released over the video still terminates
 *   · anything about a real cross-origin iframe at all — the one boundary that
 *     produced the residual limitation documented in the component
 *   · NATIVE DRAG. The anchors carry draggable={false}, and the render tier
 *     asserts that ATTRIBUTE is present — but the attribute is not the
 *     behaviour. That no drag ghost appears, that no URL payload is offered to
 *     a drop target, and above all that pointermove KEEPS BEING DELIVERED for
 *     the whole gesture (the browser stops sending it the instant a native drag
 *     begins, which silently kills the carousel drag) are all invisible here.
 *     A regression that leaves the attribute in place while something else
 *     starts a drag — a parent handler, a future dragstart listener — would go
 *     entirely unnoticed by this suite.
 */
