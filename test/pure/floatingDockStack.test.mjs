import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DOCK_HIDDEN_PREFIXES,
  LAUNCHER_HIDDEN_ROUTES,
  dockLiftsForBottomBar,
  matchesRoutePattern,
  shouldRenderChatLauncher,
  shouldRenderFloatingDock,
} from '@/lib/floatingDock';
import { configZScale, firstZ, classLiteral, resolveZ } from '../zScale.mjs';
import { readSourceForScanning } from '../sourceScan.mjs';

// FloatingActionDock — the structural guard.
//
// The dock exists so that ONE element owns the bottom-right stack's position,
// z-index and offsets, and the spacing between its slots is done by flexbox
// rather than by two magic numbers in two files that have to agree. This file
// pins the three properties that make that true: the dock's z token really
// generates, the slot order really puts back-to-top above the BOTTOM SLOT, and
// ScrollToTopButton really stopped positioning itself. The dock names the
// position, never the content — so neither does this file.
//
// ── COMMENTS ARE STRIPPED, AND HERE THAT IS NOT A FORMALITY ─────────────────
// ScrollToTopButton's own doc block contains the sentence "No `fixed`, no `z-`,
// no `bottom-`" — it explains the rule by quoting exactly the tokens this file
// forbids. A raw-text matcher would read that prose as a violation and go red
// on a correct file. Same defect this repo has hit repeatedly from the other
// direction (a doc block SATISFYING an assertion); it bites both ways.
//
// z-scale helpers come from test/zScale.mjs, shared with zIndexStack rather
// than re-derived here — "does this z token generate" must have one answer.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const DOCK = src('src/components/ui/FloatingActionDock.jsx');
const BUTTON = src('src/components/ui/ScrollToTopButton.jsx');
const CONFIG = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
const EXTRA = configZScale(CONFIG);

const DOCK_CLASS = classLiteral(DOCK, {
  label: 'FloatingActionDock container',
  re: /className=\{`fixed[^`]*`\}/,
  file: 'FloatingActionDock.jsx',
});

// ── The dock's z actually generates ─────────────────────────────────────────

test('the dock ships a z token that Tailwind really emits under this config', () => {
  const tok = firstZ(DOCK_CLASS);
  assert.ok(tok, 'dock has a z token in source');
  assert.equal(tok, 'z-50', 'the dock holds the elevated tier the button used to');
  assert.equal(resolveZ(tok, EXTRA), 50, 'and it resolves to a real z-index, not auto');
  // Non-vacuity: resolveZ must be capable of returning null, or "it generates"
  // is a claim about nothing. z-90 is in neither the native scale nor the config.
  assert.equal(resolveZ('z-90', EXTRA), null, 'an unconfigured bare token would NOT generate');
});

// ── Slot order ──────────────────────────────────────────────────────────────

test('slot order puts back-to-top ABOVE the bottom slot', () => {
  const upper = DOCK.indexOf('<ScrollToTopButton');
  const lower = DOCK.indexOf('{bottomSlot}');
  assert.ok(upper !== -1, 'the back-to-top slot is present in the dock');
  assert.ok(lower !== -1, 'the bottom slot is present in the dock');
  assert.ok(
    upper < lower,
    'back-to-top must come FIRST in source so it renders above the bottom slot. ' +
    'Whatever occupies that slot is bottom-most; reversing these swaps which ' +
    'control sits under the user’s thumb.',
  );
});

test('CONTROL: the ordering assertion is a real comparison, not a presence check', () => {
  // Reversing the two children in the source must flip this and nothing else.
  // Demonstrated on the predicate, because the assertion above is an index
  // compare and a "both are present" check would pass in EITHER order.
  const order = (a, b) => a < b;
  assert.equal(order(10, 20), true, 'correct order passes');
  assert.equal(order(20, 10), false, 'reversed order fails — the compare is live');
  // and presence alone genuinely does not decide it
  assert.ok(DOCK.includes('<ScrollToTopButton') && DOCK.includes('{bottomSlot}'));
});

// ── The dock is anchored at the BOTTOM ──────────────────────────────────────

test('the dock is bottom-anchored, which is what keeps the bottom slot still', () => {
  assert.ok(/\bbottom-/.test(DOCK_CLASS), 'dock is pinned by a bottom-* offset');
  assert.ok(
    !/\btop-/.test(DOCK_CLASS),
    'dock must NOT be top-anchored: the container grows upward from its bottom edge, ' +
    'which is the only reason the bottom slot does not move when ScrollToTopButton ' +
    'appears and disappears on scroll.',
  );
  assert.ok(/\bitems-end\b/.test(DOCK_CLASS), 'children align to the right edge');
  assert.ok(/\bflex-col\b/.test(DOCK_CLASS), 'slots stack vertically');
  assert.ok(/\bgap-\d/.test(DOCK_CLASS), 'spacing is structural (a gap), not a per-child offset');
});

// ── Pointer events ──────────────────────────────────────────────────────────

test('the container is click-through and re-enables its direct children', () => {
  assert.ok(
    /\bpointer-events-none\b/.test(DOCK_CLASS),
    'the fixed box must not eat clicks in its empty region',
  );
  assert.ok(
    /\[&>\*\]:pointer-events-auto/.test(DOCK_CLASS),
    'children must get pointer events back — stated ON THE CONTAINER so a new slot ' +
    'cannot forget it, which is the failure a per-child class invites',
  );
});

// ── ScrollToTopButton gave up positioning ───────────────────────────────────

test('ScrollToTopButton no longer positions itself', () => {
  // The whole point of the dock. Each of these is a token that, if it came back,
  // would recreate a second fixed element whose offsets must agree with the
  // dock's — with nothing checking that they do.
  for (const [token, re] of [
    ['fixed', /\bfixed\b/],
    ['z-*', /\bz-\d/],
    ['bottom-*', /\bbottom-\d/],
    ['right-*', /\bright-\d/],
    ['usePathname', /usePathname/],
  ]) {
    assert.equal(
      re.test(BUTTON),
      false,
      `ScrollToTopButton.jsx still contains "${token}". Positioning and the ` +
      '/register lift belong to FloatingActionDock; a button that positions ' +
      'itself is the coupling the dock was created to remove.',
    );
  }
  // …and it is still a button that knows when to show itself.
  assert.ok(/scrollY > 400/.test(BUTTON), 'the 400px reveal threshold is unchanged');
  assert.ok(/return null/.test(BUTTON), 'it renders nothing when hidden, so it takes no space');
});

// ── The /admin exclusion ────────────────────────────────────────────────────

test('the dock is hidden on /admin and rendered everywhere else', () => {
  assert.equal(shouldRenderFloatingDock('/admin'), false, 'the admin root itself');
  assert.equal(shouldRenderFloatingDock('/admin/articles'), false, 'and everything under it');
  assert.equal(shouldRenderFloatingDock('/'), true, 'home');
  assert.equal(shouldRenderFloatingDock('/promotions'), true, 'a public page');
  assert.equal(shouldRenderFloatingDock('/power-bi/register'), true, 'a register flow');
});

test('prefix matching is segment-aware, not a bare startsWith', () => {
  // The trap: `startsWith('/admin')` also matches these, and would silently kill
  // the dock on a public URL nobody has yet — so the bug ships unnoticed.
  assert.equal(shouldRenderFloatingDock('/administrators'), true);
  assert.equal(shouldRenderFloatingDock('/admin-guide'), true);
});

test('CONTROL: an empty exclusion list would make the admin assertion vacuous', () => {
  // Without this, "hidden on /admin" could pass because the predicate returns
  // false for everything, or fail to be a claim at all because the list is empty.
  assert.ok(DOCK_HIDDEN_PREFIXES.length > 0, 'the list is not empty');
  assert.deepEqual(DOCK_HIDDEN_PREFIXES, ['/admin'], 'and it is exactly this, not a superset');
  // Replicate the predicate over an EMPTY list: /admin would then render, which
  // is precisely the assertion above going green for the wrong reason.
  const withList = (prefixes, pathname) =>
    !prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  assert.equal(withList([], '/admin'), true, 'empty list → /admin renders (the vacuous state)');
  assert.equal(withList(DOCK_HIDDEN_PREFIXES, '/admin'), false, 'real list → /admin is hidden');
});

// ── The lift ────────────────────────────────────────────────────────────────

test('the /register lift moved to the dock and still keys on the same rule', () => {
  assert.equal(dockLiftsForBottomBar('/power-bi/register'), true);
  assert.equal(dockLiftsForBottomBar('/masterclass/x/register'), true, 'at any depth');
  assert.equal(dockLiftsForBottomBar('/promotions'), false);
  assert.equal(dockLiftsForBottomBar(undefined), false, 'an absent path does not lift');
  // and the dock is what consumes it — both offsets live in one class string
  assert.ok(/'bottom-24'/.test(DOCK_CLASS) && /'bottom-8'/.test(DOCK_CLASS));
});

// ── The seam ────────────────────────────────────────────────────────────────

test('the exported dock feeds the real router pathname into the view', () => {
  // The render tier drives FloatingActionDockView with an explicit pathname, so
  // nothing there would notice if the wrapper stopped reading usePathname or
  // passed it a constant. That one line is checked here.
  assert.ok(/const pathname = usePathname\(\)/.test(DOCK), 'the wrapper reads the router');
  assert.ok(/pathname=\{pathname\}/.test(DOCK), 'and hands it to the view');
  assert.ok(
    /shouldRenderFloatingDock\(pathname\)/.test(DOCK),
    'the view asks the shared rule rather than testing the path inline',
  );
});

// ── THE SECOND LIST ─────────────────────────────────────────────────────────
// "the dock is hidden" and "the launcher is hidden" are DIFFERENT questions
// with different answers, and the tests below exist mostly to keep them that
// way. Back-to-top is welcome on a payment page; a full-screen chat overlay
// with a body-scroll lock is not.

test('the launcher is hidden wherever the user is completing a purchase', () => {
  for (const p of [
    '/registration/public/step-1',
    '/registration/public/step-2',
    '/registration/in-house/step-1',
    '/masterclass/excel-101/register',
    '/masterclass/payment/complete',
    '/career-path-register/data-analyst',
  ]) {
    assert.equal(shouldRenderChatLauncher(p), false, `launcher must be hidden on ${p}`);
  }
});

test('the launcher is NOT hidden on the pages chat exists for', () => {
  // /contact-us is the load-bearing one: it is a form, but chat is a
  // SUBSTITUTE for filling it in, so hiding the launcher there inverts the
  // intent. If the rule ever becomes "any form", this goes red first.
  for (const p of ['/', '/contact-us', '/faq', '/promotions', '/articles/x', '/preview/some-page']) {
    assert.equal(shouldRenderChatLauncher(p), true, `launcher must render on ${p}`);
  }
});

test('the wildcard stands for exactly ONE segment', () => {
  assert.equal(shouldRenderChatLauncher('/masterclass/excel-101/register'), false, 'the real shape');
  assert.equal(shouldRenderChatLauncher('/masterclass/excel-101'), true, 'the detail page is not a checkout');
  assert.equal(shouldRenderChatLauncher('/masterclass'), true, 'nor is the catalogue');
  // A wildcard is not "any depth": /masterclass/register has one segment too
  // few and must not be swallowed by the pattern.
  assert.equal(matchesRoutePattern('/masterclass/register', '/masterclass/*/register'), false);
});

test('CONTROL: the wildcard is a live segment, not a wildcard that matches anything', () => {
  // Without this, `*` could be implemented as "skip the rest of the pattern"
  // and every /masterclass/... URL would lose its launcher.
  assert.equal(matchesRoutePattern('/masterclass/a/register', '/masterclass/*/register'), true);
  assert.equal(matchesRoutePattern('/masterclass/a/enrol', '/masterclass/*/register'), false, 'the tail still has to match');
  assert.equal(matchesRoutePattern('/course/a/register', '/masterclass/*/register'), false, 'and so does the head');
});

test('both lists go through the SAME segment-aware matcher', () => {
  // The property that must hold for both, from one implementation: a prefix
  // matches on segment boundaries and never mid-word.
  assert.equal(shouldRenderFloatingDock('/administrators'), true, 'dock list: no mid-word match');
  assert.equal(shouldRenderChatLauncher('/registration-policy'), true, 'launcher list: no mid-word match');
  assert.equal(shouldRenderChatLauncher('/career-path-register-info'), true);
  // …and the matcher itself answers both the same way.
  assert.equal(matchesRoutePattern('/administrators', '/admin'), false);
  assert.equal(matchesRoutePattern('/admin/x', '/admin'), true);
});

test('/admin is absent from the launcher list — composition, not duplication', () => {
  // The launcher renders INSIDE the dock, so the dock returning null already
  // removes it. Listing /admin in both places would be one rule written twice —
  // the shape of defect that let the rate limiter release its window in two
  // places and hid a broken guard behind the other copy.
  assert.ok(
    !LAUNCHER_HIDDEN_ROUTES.some((r) => r === '/admin' || r.startsWith('/admin/')),
    'the launcher list must not restate what the dock list already decides',
  );
  // The composition itself: the dock is gone there, so nothing inside it exists.
  assert.equal(shouldRenderFloatingDock('/admin/articles'), false);
});

test('CONTROL A: emptying the LAUNCHER list leaves every dock claim untouched', () => {
  const dockWith = (prefixes, pathname) =>
    !prefixes.some((p) => matchesRoutePattern(pathname, p));
  const launcherWith = (routes, pathname) =>
    !routes.some((p) => matchesRoutePattern(pathname, p));

  // Emptying the launcher list changes the launcher's answer…
  assert.equal(launcherWith(LAUNCHER_HIDDEN_ROUTES, '/registration/public/step-2'), false);
  assert.equal(launcherWith([], '/registration/public/step-2'), true, 'launcher claim goes red');
  // …and changes NOTHING about the dock's.
  assert.equal(dockWith(DOCK_HIDDEN_PREFIXES, '/admin'), false, 'dock claim unaffected');
  assert.equal(dockWith(DOCK_HIDDEN_PREFIXES, '/'), true);
});

test('CONTROL B: emptying the DOCK list leaves every launcher claim untouched', () => {
  const dockWith = (prefixes, pathname) =>
    !prefixes.some((p) => matchesRoutePattern(pathname, p));
  const launcherWith = (routes, pathname) =>
    !routes.some((p) => matchesRoutePattern(pathname, p));

  assert.equal(dockWith(DOCK_HIDDEN_PREFIXES, '/admin'), false);
  assert.equal(dockWith([], '/admin'), true, 'dock claim goes red');
  // The launcher's answers are computed from its own list and do not move.
  assert.equal(launcherWith(LAUNCHER_HIDDEN_ROUTES, '/masterclass/x/register'), false, 'launcher claim unaffected');
  assert.equal(launcherWith(LAUNCHER_HIDDEN_ROUTES, '/contact-us'), true);
});
