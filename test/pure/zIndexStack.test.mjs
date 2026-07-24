import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The public-site z-index ladder. jsdom computes no stacking, and we don't run a
// browser here, so paint order itself is inferred — but the INPUTS are checked
// against the real source: the z tokens each element ships AND whether Tailwind
// actually generates them (a bare `z-60` is not in the default scale and needs a
// config entry, or it silently becomes `auto`). The direct CSS-generation
// evidence is the tailwindcss CLI run in the report; here we assert the config
// cause plus the resulting numeric order.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const CONFIG = read('tailwind.config.js');
const HEADER = read('src/components/layout/PublicHeaderClient.jsx');
const PAGE = read('src/app/(public)/[...slug]/page.jsx');
const BUTTON = read('src/components/ui/ScrollToTopButton.jsx');
const BAR = read('src/app/(public)/[...slug]/_components/CourseStickyCTA.jsx');
const HERO = read('src/app/(public)/[...slug]/_components/CourseHero.jsx');

// Tailwind 3 default z-index scale (bare utilities that generate without config).
const NATIVE_Z = new Set([0, 10, 20, 30, 40, 50]);

// Parse the extra z-index values the config adds under theme.extend.zIndex.
function configZScale(cfg) {
  const block = cfg.match(/zIndex\s*:\s*\{([^}]*)\}/s);
  const extra = new Set();
  if (block) for (const m of block[1].matchAll(/(\d+)\s*:/g)) extra.add(Number(m[1]));
  return extra;
}

// Resolve a Tailwind z token to a number, or null if it would NOT generate
// (→ CSS `z-index: auto`). Arbitrary `z-[N]` always generates.
function resolveZ(token, extraScale) {
  const arb = token.match(/^z-\[(\d+)\]$/);
  if (arb) return Number(arb[1]);
  const bare = token.match(/^z-(\d+)$/);
  if (bare) {
    const n = Number(bare[1]);
    return NATIVE_Z.has(n) || extraScale.has(n) ? n : null;
  }
  return null;
}

const firstZ = (cls) => (cls.match(/z-\[?\d+\]?/) || [null])[0];

const EXTRA = configZScale(CONFIG);

// ── The crux: does the header's z-index actually generate? ──────────────────
test('config declares z-index 60/70/80 so the header z-60 generates (not auto)', () => {
  assert.ok(EXTRA.has(60), 'zIndex 60 is declared → z-60 generates');
  assert.ok(EXTRA.has(70) && EXTRA.has(80), 'gaps (70/80) reserved for future chrome');
  assert.equal(resolveZ('z-60', EXTRA), 60, 'z-60 resolves to 60 with the config');
  // …and without that config entry it silently collapses to auto (the bug):
  assert.equal(resolveZ('z-60', new Set()), null, 'bare z-60 is not native → auto');
});

// ── Pull the real z token each element ships ────────────────────────────────
const headerTok = firstZ(HEADER.match(/<header className="([^"]*)"/)[1]);
const asideTok = firstZ(PAGE.match(/<aside\s+className="([^"]*)"/)[1]);
const buttonTok = firstZ(BUTTON.match(/className=\{`fixed[^`]*`\}/)[0]);
const barTok = firstZ(BAR.match(/className=\{`fixed inset-x-0[^`]*`\}/)[0]);
const drawerTok = 'z-[9999]'; // panel  (PublicHeaderClient.jsx:1179)
const backdropTok = 'z-[9998]'; // backdrop (PublicHeaderClient.jsx:1168)

test('every layered element ships a z token that generates', () => {
  for (const [name, tok] of [
    ['header', headerTok],
    ['aside', asideTok],
    ['button', buttonTok],
    ['bar', barTok],
  ]) {
    assert.ok(tok, `${name} has a z token in source`);
    assert.notEqual(resolveZ(tok, EXTRA), null, `${name} z (${tok}) generates`);
  }
  // sanity: the tokens are the values the audit expects
  assert.equal(headerTok, 'z-60');
  assert.equal(asideTok, 'z-50');
  assert.equal(buttonTok, 'z-50');
  assert.equal(barTok, 'z-40');
  assert.ok(HEADER.includes('z-[9999]') && HEADER.includes('z-[9998]'), 'drawer tokens present');
});

// ── The intended numeric order ──────────────────────────────────────────────
test('resolved z-order matches the intended stack (top → bottom)', () => {
  const z = {
    content: 0, // ordinary flow (hero cover slider, accordions, related)
    bar: resolveZ(barTok, EXTRA),
    aside: resolveZ(asideTok, EXTRA),
    button: resolveZ(buttonTok, EXTRA),
    header: resolveZ(headerTok, EXTRA),
    backdrop: resolveZ(backdropTok, EXTRA),
    drawer: resolveZ(drawerTok, EXTRA),
  };
  // 1. drawer above everything
  assert.ok(z.drawer > z.header, 'drawer above header');
  assert.ok(z.backdrop > z.header, 'drawer backdrop above header');
  // 2. header above the raised tier
  assert.ok(z.header > z.button, 'header above back-to-top button');
  assert.ok(z.header > z.aside, 'header above sidebar');
  // header above ordinary content — this is the hero-cover overlap fix
  assert.ok(z.header > z.content, 'header above ordinary content (hero cover)');
  // 3. raised tier above the sticky bar (keeps TH/EN + button clickable)
  assert.ok(z.button > z.bar, 'back-to-top button above the sticky bar');
  assert.ok(z.aside > z.bar, 'sidebar above the sticky bar');
  // 4. sticky bar above ordinary content
  assert.ok(z.bar > z.content, 'sticky bar above ordinary content');
});

// ── The hero cover is not promoted above the header by a stacking context ────
test('hero cover slider is not promoted above the header', () => {
  // The cover zone wrapper is `relative` with NO z-index → it does not form a
  // stacking context that could lift the cover above the header.
  const coverZone = HERO.match(/RIGHT — cover zone[\s\S]*?<div className="([^"]*)"/)[1];
  assert.ok(/\brelative\b/.test(coverZone), 'cover zone is relative');
  assert.ok(!/\bz-\d/.test(coverZone) && !/\bz-\[/.test(coverZone), 'cover zone has no z-index');
  // The one stacking context inside is the transformed slide track. It must NOT
  // carry a z-index, so it stays z-auto — below the header's z-60 in the root.
  const track = HERO.match(/className="flex h-full transition-transform[^"]*"/)[0];
  assert.ok(track, 'slide track uses a transform (forms a context)');
  assert.ok(!/\bz-/.test(track), 'transformed track has no z-index → z-auto, below the header');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
// Prove the order assertion measures the bug. With the header's z NOT generated
// (the pre-fix state: bare z-60, no config entry), the header collapses to auto
// and can no longer sit above the hero cover — the header-above-content
// assertion FLIPS to false.
test('CONTROL: without the config entry the header falls to auto and loses to the cover', () => {
  const preFixHeaderZ = resolveZ('z-60', new Set()); // no config scale
  assert.equal(preFixHeaderZ, null, 'pre-fix header z is auto');
  const headerRankPre = preFixHeaderZ ?? 0; // auto sits in the content tier
  assert.equal(
    headerRankPre > 0,
    false,
    'pre-fix: header does NOT beat ordinary content (the reported cover-over-header bug)',
  );
  // the fix flips it
  assert.ok(resolveZ('z-60', EXTRA) > 0, 'post-fix: header sits above content');
});
