import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NATIVE_Z, classLiteral, configZScale, firstZ, resolveZ } from '../zScale.mjs';
import { readSource } from '../sourceScan.mjs';

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
// THE DOCK, NOT THE BUTTON. ScrollToTopButton used to carry `fixed … z-50 …
// bottom-8` itself; it is now a plain button inside FloatingActionDock, which
// owns the position and the z-index for the whole bottom-right stack. The
// extraction below therefore reads the dock — and NATIVE_Z / configZScale /
// resolveZ / firstZ now come from test/zScale.mjs, shared with
// test/pure/floatingDockStack, rather than being defined twice.
const DOCK = read('src/components/ui/FloatingActionDock.jsx');
const CHAT = read('src/components/chat/ChatPanel.jsx');
const BAR = read('src/app/(public)/[...slug]/_components/CourseStickyCTA.jsx');
const HERO = read('src/app/(public)/[...slug]/_components/CourseHero.jsx');

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
// THE HEADER'S CLASS IS NO LONGER A PLAIN DOUBLE-QUOTED LITERAL. It became a
// cn() call when the header gained its transparent-over-hero mode, and the old
// extraction here — `HEADER.match(/<header className="([^"]*)"/)[1]` — was an
// unguarded index into a null match: the whole FILE would have thrown at module
// load, taking every test in it with it, instead of failing readably. That is
// the exact defect classLiteral() was written for (see test/zScale.mjs), and
// the three extractions below already used it, so the header now joins them
// rather than getting a second mechanism.
//
// The anchor is the FIRST literal inside the cn() call, which is where the
// layout/stacking classes live; the conditional colour branches after it carry
// no z token. If that literal is renamed or reordered, this THROWS naming the
// element instead of yielding '' — an empty string would read as a pass to
// every "does not contain" assertion in this file.
//
// EXTRACTED LAZILY — a function, called inside the tests, NOT a module-level
// const like the four below it. Measured while making this change: with the
// runner's isolation:'none', a throw at module scope does not fail the run at
// all. The file simply stops importing, the tests defined after the throw are
// never registered, and the suite reports GREEN with seven fewer tests — which
// the FLOOR cannot see. classLiteral throwing by name is only useful if the
// throw happens somewhere the reporter is listening.
const HEADER_ANCHOR = {
  label: 'PublicHeaderClient <header>',
  re: /<header\s+className=\{cn\(\s*'sticky[^']*'/,
  file: 'PublicHeaderClient.jsx',
};
const headerTok = () => firstZ(classLiteral(HEADER, HEADER_ANCHOR));
const asideTok = firstZ(PAGE.match(/<aside\s+className="([^"]*)"/)[1]);
const dockTok = firstZ(
  classLiteral(DOCK, {
    label: 'FloatingActionDock container',
    re: /className=\{`fixed[^`]*`\}/,
    file: 'FloatingActionDock.jsx',
  }),
);
const barTok = firstZ(
  classLiteral(BAR, {
    label: 'CourseStickyCTA bar',
    re: /className=\{`fixed inset-x-0[^`]*`\}/,
    file: 'CourseStickyCTA.jsx',
  }),
);
const chatTok = firstZ(
  classLiteral(CHAT, {
    label: 'chat overlay',
    re: /className="fixed inset-0 z-\[\d+\]"/,
    file: 'ChatPanel.jsx',
  }),
);
const popupTok = firstZ(
  classLiteral(read('src/components/notifications/SitePopup.jsx'), {
    label: 'SitePopup overlay',
    re: /className="fixed inset-0 z-\[\d+\][^"]*"/,
    file: 'SitePopup.jsx',
  }),
);
const lightboxTok = firstZ(
  classLiteral(read('src/components/ui/ImageLightbox.jsx'), {
    label: 'ImageLightbox overlay',
    re: /className="fixed inset-0 z-\[\d+\][^"]*"/,
    file: 'ImageLightbox.jsx',
  }),
);
// THE /join-us JOB DIALOG. Extracted the same way as its neighbours rather than
// written down as a number: the point of this file is that a tier is asserted
// against the source, so a literal here would be exactly the "someone nudges
// the number" hole the extraction exists to close.
const jobDialogTok = firstZ(
  classLiteral(read('src/components/join-us/OpenPositionsSection.jsx'), {
    label: 'JobDetailModal overlay',
    re: /className="fixed inset-0 z-\[\d+\][^"]*"/,
    file: 'OpenPositionsSection.jsx',
  }),
);
const drawerTok = 'z-[9999]'; // panel  (PublicHeaderClient.jsx:1179)
const backdropTok = 'z-[9998]'; // backdrop (PublicHeaderClient.jsx:1168)

test('every layered element ships a z token that generates', () => {
  for (const [name, tok] of [
    ['header', headerTok()],
    ['aside', asideTok],
    ['dock', dockTok],
    ['bar', barTok],
    ['chat overlay', chatTok],
    ['site popup', popupTok],
    ['image lightbox', lightboxTok],
    ['job dialog', jobDialogTok],
  ]) {
    assert.ok(tok, `${name} has a z token in source`);
    assert.notEqual(resolveZ(tok, EXTRA), null, `${name} z (${tok}) generates`);
  }
  // sanity: the tokens are the values the audit expects
  assert.equal(headerTok(), 'z-60');
  assert.equal(asideTok, 'z-50');
  assert.equal(dockTok, 'z-50', 'the dock inherited the back-to-top button’s tier unchanged');
  assert.equal(barTok, 'z-40');
  assert.equal(chatTok, 'z-[9500]', 'chat overlay sits in the arbitrary overlay tier');
  assert.equal(popupTok, 'z-[9000]', 'and SitePopup is where the ladder says it is');
  assert.equal(lightboxTok, 'z-[9600]', 'the image lightbox is on its documented rung');
  assert.equal(jobDialogTok, 'z-[9700]', 'the /join-us job dialog is on its documented rung');
  assert.ok(HEADER.includes('z-[9999]') && HEADER.includes('z-[9998]'), 'drawer tokens present');
});

test('CONTROL: the header extractor fails LOUDLY, by name, if its anchor moves', () => {
  // The header's class stopped being a plain double-quoted literal when it
  // gained the transparent-over-hero mode. If it moves again — a template
  // literal, a renamed helper, a reordered class list — this guard must say so
  // in a failing test, not return '' (which every "does not contain" assertion
  // in this file would read as a pass) and not throw where nothing reports it.
  assert.throws(
    () => classLiteral('<header className={`sticky top-0 z-60`}>', HEADER_ANCHOR),
    /could not locate the className for "PublicHeaderClient <header>"/,
  );
  // …and on the real file it still finds the real thing.
  assert.equal(headerTok(), 'z-60');
});

// ── The intended numeric order ──────────────────────────────────────────────
test('resolved z-order matches the intended stack (top → bottom)', () => {
  const z = {
    content: 0, // ordinary flow (hero cover slider, accordions, related)
    bar: resolveZ(barTok, EXTRA),
    aside: resolveZ(asideTok, EXTRA),
    dock: resolveZ(dockTok, EXTRA),
    header: resolveZ(headerTok(), EXTRA),
    popup: resolveZ(popupTok, EXTRA),
    chat: resolveZ(chatTok, EXTRA),
    lightbox: resolveZ(lightboxTok, EXTRA),
    jobDialog: resolveZ(jobDialogTok, EXTRA),
    backdrop: resolveZ(backdropTok, EXTRA),
    drawer: resolveZ(drawerTok, EXTRA),
  };
  // 1. drawer above everything
  assert.ok(z.drawer > z.header, 'drawer above header');
  assert.ok(z.backdrop > z.header, 'drawer backdrop above header');
  // 2. header above the raised tier
  assert.ok(z.header > z.dock, 'header above the floating dock');
  assert.ok(z.header > z.aside, 'header above sidebar');
  // header above ordinary content — this is the hero-cover overlap fix
  assert.ok(z.header > z.content, 'header above ordinary content (hero cover)');
  // 3. raised tier above the sticky bar (keeps TH/EN + dock clickable)
  assert.ok(z.dock > z.bar, 'floating dock above the sticky bar');
  assert.ok(z.aside > z.bar, 'sidebar above the sticky bar');
  // 4. sticky bar above ordinary content
  assert.ok(z.bar > z.content, 'sticky bar above ordinary content');

  // 5. THE OVERLAY TIER, in order. The chat panel is deliberately sandwiched:
  // above SitePopup, because a promotional image must not cover a conversation
  // the user opened on purpose; below the mobile drawer, because primary
  // navigation always wins. Both halves are asserted — either alone would stay
  // green with the panel at the wrong end of the tier.
  assert.ok(z.chat > z.popup, 'chat overlay above SitePopup');
  assert.ok(z.chat > z.header, 'chat overlay above the header');
  assert.ok(z.backdrop > z.chat, 'drawer backdrop above the chat overlay');
  assert.ok(z.drawer > z.chat, 'mobile drawer above the chat overlay');

  // 6. THE TWO DELIBERATE MODALS. Both follow the same rule — the visitor
  // opened them on purpose, so a promo and a chat window must not cover them,
  // and primary navigation still wins. Each relation is asserted for BOTH,
  // because a single "above the chat" check would stay green with either one
  // sitting at the wrong end of the tier.
  for (const [name, value] of [['image lightbox', z.lightbox], ['job dialog', z.jobDialog]]) {
    assert.ok(value > z.chat, `${name} above the chat overlay`);
    assert.ok(value > z.popup, `${name} above SitePopup`);
    assert.ok(value > z.header, `${name} above the header`);
    assert.ok(value > z.dock, `${name} above the floating dock`);
    assert.ok(z.backdrop > value, `drawer backdrop above the ${name}`);
    assert.ok(z.drawer > value, `mobile drawer above the ${name}`);
  }
  // …and they are on rungs of their own, so their order is defined rather than
  // decided by which one happens to be later in the DOM.
  assert.notEqual(z.lightbox, z.jobDialog, 'two modals sharing one rung tie on paint order');
});

test('the ladder in tailwind.config.js names every overlay-tier occupant', () => {
  // The z-30 lesson one tier up: a rung documented as having fewer users than
  // it has is prose pretending to be measurement. These are arbitrary values,
  // so they need no config ENTRY — which is exactly why the comment is the only
  // record of them, and why it has to be checked rather than trusted.
  for (const [component, rung] of [
    ['SitePopup', 9000],
    ['ChatPanel', 9500],
    ['ImageLightbox', 9600],
    ['JobDetailModal', 9700],
  ]) {
    assert.ok(
      CONFIG.includes(component),
      `${component} occupies the overlay tier but the ladder in tailwind.config.js `
      + 'does not name it',
    );
    assert.ok(
      CONFIG.includes(String(rung)),
      `the ladder does not mention rung ${rung}, which ${component} occupies`,
    );
  }
});

test('CONTROL: the job dialog extractor fails LOUDLY if its anchor moves', () => {
  // Same defect class as the header's: an unguarded match returning null, or
  // returning '' for a renamed class, would make every assertion above pass
  // over nothing. classLiteral throws by name instead.
  assert.throws(
    () => classLiteral('<div className="fixed inset-0 flex">', {
      label: 'JobDetailModal overlay',
      re: /className="fixed inset-0 z-\[\d+\][^"]*"/,
      file: 'OpenPositionsSection.jsx',
    }),
    /could not locate the className for "JobDetailModal overlay"/,
  );
  assert.equal(jobDialogTok, 'z-[9700]');
});

// ── The dialog is PORTALLED to <body> ───────────────────────────────────────
test('the job dialog is portalled, like every other overlay-tier surface', () => {
  // Not because the tier needs it today — the section it renders from creates
  // no stacking context, which is why raising the z-index alone was enough to
  // fix the reported paint order. It is here because `position: fixed` is
  // defeated outright by a transformed ancestor and a high z-index is confined
  // by any ancestor that forms a stacking context, and this subtree is one
  // `will-change` away from either. The chat panel is the case that actually
  // bit this repo: rendered from inside the `fixed z-50` dock, its z-[9500]
  // was trapped below SitePopup's 9000 while the source read correctly.
  // TWO FORMS, AND EACH ASSERTION SAYS WHICH — test/sourceScan.mjs's rule.
  // `code` strips imports, so the import check has to read `withImports`; the
  // CALL check reads `code`, because an import line alone would satisfy it
  // (defect 5 in that file's header) and a portal that is imported but never
  // used is exactly the bug this guard is about.
  const { code, withImports } = readSource('src/components/join-us/OpenPositionsSection.jsx');
  assert.match(withImports, /import \{ createPortal \} from "react-dom"/,
    'createPortal is not imported');
  assert.match(code, /createPortal\(\s*overlay\s*,\s*document\.body\s*\)/,
    'the dialog is not portalled to <body>');
  const src = code;
  // The SSR branch, which is what makes the portal safe in a client component
  // Next still renders on the server — createPortal throws there.
  assert.match(src, /typeof document === "undefined"/,
    'the portal has no server-render fallback; createPortal throws on the server');
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

// ── The ladder must DESCRIBE the tree, not a snapshot of it ─────────────────
// z-30 was documented as belonging to CourseSectionTabs alone at the moment
// that component was added — while the rung already had three other users. A
// rung documented as singly owned when it has four is prose that reads as
// measured fact while being wrong: the same defect as the
// dockLiftsForBottomBar docstring corrected in 1c4b348, and the reason that one
// was only caught by reading the tree rather than the comment.
//
// This guard reads the config RAW, and that is the documented EXCEPTION rather
// than an oversight: the subject under test IS a comment. Scrubbing would
// delete it and the assertion would fail on a perfectly correct file.

const Z30_OCCUPANTS = [
  'src/app/(public)/[...slug]/_components/CourseSectionTabs.jsx',
  'src/components/payment/Step2MobileBar.jsx',
  'src/app/admin/masterclass/_components/MasterclassCourseFormClient.jsx',
  'src/components/promotions/PromotionBannerCarousel.jsx',
];

test('every z-30 occupant in the tree is named in the documented ladder', () => {
  for (const rel of Z30_OCCUPANTS) {
    const component = rel.split('/').pop().replace(/\.jsx$/, '');
    // The occupant files are read as CODE: the subject there is a className,
    // and prose can quote a class without using it — see the control below.
    assert.ok(
      readSource(rel).code.includes('z-30'),
      `${rel} is listed as a z-30 occupant but no longer carries z-30 — remove it ` +
        `from this list AND from the ladder comment`,
    );
    assert.ok(
      CONFIG.includes(component),
      `${component} uses z-30 but the ladder in tailwind.config.js does not name it. ` +
        `A rung documented as having fewer users than it has is prose pretending ` +
        `to be measurement.`,
    );
  }
});

test('the ladder does not still call z-30 a single-occupant rung', () => {
  // The specific wrong shape: one component named on the 30 line and nothing
  // else. Asserting the plural marker is present is cheaper and more robust
  // than trying to parse the block.
  assert.match(
    CONFIG,
    /SHARED LOW RUNG/,
    'the 30 entry states that the rung is shared',
  );
});

test('CONTROL: the occupant probes can both fail', () => {
  // Without this, "CONFIG includes the name" could be passing because the
  // config mentions every word, and "the file has z-30" because the probe
  // matches anything.
  assert.equal(CONFIG.includes('SomeComponentThatDoesNotExist'), false);

  // floatingDock.js is the ideal negative, and it was found by getting this
  // control wrong first: it MENTIONS z-30 in prose — the corrected
  // dockLiftsForBottomBar docstring quotes Step2MobileBar's class string — while
  // using it nowhere. Raw, it looks like a fifth occupant; as code it is not one.
  const decoy = readSource('src/lib/floatingDock.js');
  assert.equal(decoy.raw.includes('z-30'), true, 'the prose really does quote it');
  assert.equal(decoy.code.includes('z-30'), false, 'and the scrub is what tells them apart');

  // ...and a real occupant still reads as one, so the probe is not just strict.
  assert.ok(readSource(Z30_OCCUPANTS[0]).code.includes('z-30'));
});
