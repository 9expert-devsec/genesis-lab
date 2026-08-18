import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';
import {
  HERO_OVERLAY_SENTINEL_ID,
  OVERLAY_SUBPIXEL_TOLERANCE_PX,
  PUBLIC_HEADER_HEIGHT_PX,
  isHeaderTransparent,
} from '@/lib/heroOverlay';

/**
 * The Home hero's wiring, at source level — the facts no render can show.
 *
 * Three kinds of claim live here rather than in the render tier:
 *
 *  1. NEXT/IMAGE PROPS. test/stub-next-image.mjs renders `{ src, alt }` and
 *     drops the rest, so `priority` / `sizes` / `fill` do not exist in rendered
 *     markup at all. An assertion about them there could not fail.
 *  2. THE OPT-IN BEING AN OPT-IN. "No other route passes overlay" is a claim
 *     about files that do NOT render, so nothing can be rendered to check it.
 *  3. THE TAILWIND LITERALS. The hero's pull-up must be a complete literal
 *     class, and it must equal the header height the observer uses. A markup
 *     assertion sees the class name either way.
 *
 * WHAT THIS FILE CANNOT SEE: whether Tailwind emits CSS for any of these
 * classes (every class here is a stock utility or a bare arbitrary VALUE —
 * none is the `bg-[var(--…)]` shape that needs a compiled-CSS guard), whether
 * the IntersectionObserver's arithmetic is right, and anything about layout.
 */

const PAGE = readSource('src/app/page.jsx');
const HERO = readSource('src/app/_components/home/HeroSection.jsx');
const SHELL = readSource('src/components/layout/PublicHeader.jsx');
const HEADER = readSource('src/components/layout/PublicHeaderClient.jsx');

/** The whole `<Image … />` element whose src is `src`, or null. */
function imageBlock(code, src) {
  // Bounded on `/>`, never on `)` — a bound on a closing paren cannot cross an
  // arrow function's own, which is defect 6 in test/sourceScan.mjs's header.
  const m = code.match(new RegExp(`<Image\\s+src="${src.replace(/[/.]/g, '\\$&')}"[\\s\\S]*?/>`));
  return m ? m[0] : null;
}

// ── Home renders the hero, in the right place, and opts in ──────────────────

test('Home renders <HeroSection /> as the first thing in <main>', () => {
  const code = PAGE.code;
  const hero = code.indexOf('<HeroSection />');
  const h1 = code.indexOf('<h1');
  const carousel = code.indexOf('banners.length > 0');
  assert.ok(hero > 0, 'the home page does not render HeroSection');
  assert.ok(h1 > 0 && carousel > 0, 'the page no longer has the hidden h1 or the banner ternary');
  assert.ok(hero > h1, 'the hero must come AFTER the visually-hidden h1');
  assert.ok(hero < carousel, 'the hero must come BEFORE the banner carousel expression');
});

test('Home still falls back between carousel and static banner, untouched', () => {
  // The hero was added ABOVE this; it did not replace it.
  assert.match(PAGE.code, /banners\.length > 0 \?[\s\S]*?<HeroBannerCarousel/);
  assert.match(PAGE.code, /<HeroBanner \/>/);
});

test('Home passes `overlay` to the header', () => {
  assert.match(PAGE.code, /<PublicHeader\s+overlay\s*\/>/);
});

test('the shell threads it through, defaulting to FALSE', () => {
  assert.match(
    SHELL.code,
    /export async function PublicHeader\(\{\s*overlay = false\s*\}\)/,
    'PublicHeader does not take `overlay` with a false default'
  );
  assert.match(SHELL.code, /overlay=\{overlay\}/, 'the shell does not pass it to the client');
  assert.match(
    HEADER.code,
    /overlay = false,/,
    'PublicHeaderClient does not default `overlay` to false'
  );
});

test('NO other route passes `overlay` — it is opt-in, not the new default', () => {
  const offenders = [];
  let consumers = 0;
  for (const src of walkSources('src')) {
    // `.code`, so a doc comment quoting <PublicHeader/> is not read as a use —
    // PageBuilderView.jsx has exactly that, see the control below.
    for (const tag of src.code.match(/<PublicHeader\b[^>]*\/?>/g) ?? []) {
      consumers += 1;
      if (/\boverlay\b/.test(tag) && src.rel !== 'src/app/page.jsx') {
        offenders.push(`${src.rel}: ${tag}`);
      }
    }
  }
  assert.ok(consumers >= 3, `only ${consumers} <PublicHeader> call sites found — did the scan run?`);
  assert.deepEqual(offenders, [], 'a route other than Home turned the header transparent');
});

test('CONTROL: the call-site scan really sees the other consumers', () => {
  // Without this, "no offenders" could mean the walk found nothing at all.
  const rels = walkSources('src')
    .filter((s) => /<PublicHeader\b/.test(s.code))
    .map((s) => s.rel);
  assert.ok(rels.includes('src/app/page.jsx'), 'Home is not in the scan');
  assert.ok(rels.includes('src/app/(public)/layout.jsx'), 'the public layout is not in the scan');
  assert.ok(rels.includes('src/app/not-found.jsx'), 'not-found is not in the scan');
});

test('CONTROL: a comment MENTIONING <PublicHeader/> is not a call site', () => {
  // The reason the scan above reads `.code` and not `.raw`.
  const decoy = readSource('src/components/pageBuilder/PageBuilderView.jsx');
  assert.ok(decoy.raw.includes('<PublicHeader'), 'the prose really does quote it');
  assert.ok(!decoy.code.includes('<PublicHeader'), 'and the scrub is what tells them apart');
});

// ── Both header treatments exist in source and are distinguishable ──────────

test('the header keeps BOTH treatments, chosen by the derived value', () => {
  // The render tier proves each one is reachable; this pins that the opaque
  // branch is the FALSE side, so the default cannot silently become the
  // transparent one — and that the branch is keyed on `overlayTransparent`
  // (overlay AND nothing open), not on the raw overlay state.
  const cn = HEADER.code.match(/<header\s+className=\{cn\(([\s\S]*?)\)\}\s*>/);
  assert.ok(cn, 'the <header> class is no longer a cn() call — re-anchor this guard');
  assert.match(cn[1], /overlayTransparent\s*\?/, 'the treatment is not keyed on overlayTransparent');
  const [, ifOverlay, ifNot] = cn[1].match(/overlayTransparent[\s\S]*?\?([\s\S]*?):([\s\S]*)/);
  assert.match(ifOverlay, /bg-transparent/, 'the TRUE branch is not the transparent one');
  assert.match(ifNot, /bg-white/, 'the FALSE branch is not the opaque one');
  assert.match(ifNot, /dark:bg-9e-navy/, 'the FALSE branch lost its dark treatment');
});

// ── Image props the render tier is structurally blind to ────────────────────

test('the background is the LCP element: fill + priority + a real sizes', () => {
  const bg = imageBlock(HERO.code, '/hero-img/background.png');
  assert.ok(bg, 'the background <Image> is gone');
  assert.match(bg, /\bfill\b/, 'the background is not a fill image');
  assert.match(bg, /\bpriority\b/, 'the LCP image is not preloaded');
  // The band is full-bleed at every width now, so there is exactly one width
  // to describe. It was `(min-width: 1537px) 1440px, 100vw` while the artwork
  // capped itself at 1440 — a stale sizes here would have the optimizer
  // choosing a candidate for a box that no longer exists.
  assert.match(bg, /sizes="100vw"/, 'sizes does not describe a full-bleed box');
  assert.match(bg, /object-cover/, 'the background must cover its box');
  assert.match(bg, /object-bottom/, 'the crop must keep the earth, not centre the sky');
});

test('the hero band is FULL-BLEED — no cap, no rounding', () => {
  // The user zoomed out and found the hero sitting as a 1440px box in an empty
  // band. Both halves of that cap are pinned gone.
  assert.ok(
    !HERO.code.includes('max-w-[1440px]'),
    'the 1440px cap is back — the artwork stops expanding on a wide screen'
  );
  assert.ok(
    !/rounded-b?-3xl/.test(HERO.code),
    'the hero rounds its corners again — a full-bleed band must not'
  );
  assert.ok(
    !HERO.code.includes('min-[1537px]:pb-'),
    'the 1537px letterbox padding is back'
  );
});

test('…but the CONTENT stays in the centred 1200px container', () => {
  // Full-bleed background, centred copy. Without this the headline walks to the
  // far left edge of a 2560px screen.
  assert.match(
    HERO.code,
    // Matched by TOKEN, not as one ordered string: the container carries height
    // classes that are a design decision and have already changed once
    // (`min-h-[calc(100dvh-81px)]` was added between rounds). What this guard
    // is about is that the content stays in the CENTRED 1200px box.
    /className="[^"]*\bmx-auto\b[^"]*\bmax-w-\[1200px\]/,
    'the content container is no longer the centred 1200px one'
  );
  // `relative` on that container is what makes it the astronaut's offset
  // parent. Whether the astronaut is really INSIDE it is a nesting fact, which
  // no text scan can answer — that assertion lives in the render tier, read
  // through jsdom. This half only pins that the container is positioned at all.
  assert.match(
    HERO.code,
    /className="relative mx-auto flex/,
    'the container stopped being positioned — an absolute child would escape it'
  );
});

test('the height is content-driven, not the image aspect ratio', () => {
  // A full-bleed 16:9 band would be 1600px tall at 2560 wide. Measured in
  // Chrome: 601px at 1024, 1440 AND 2560 — identical, because the height comes
  // from the copy plus this min-height and the background just crops wider.
  assert.match(HERO.code, /lg:min-h-\[520px\]/, 'the min-height that sets the band height is gone');
  assert.ok(
    !/aspect-\[/.test(HERO.code) && !/aspect-video/.test(HERO.code),
    'an aspect-ratio class would tie the height to the width again'
  );
});

test('the headline column is wide enough for two lines', () => {
  // MEASURED, not preferred: at the previous 560px cap Chrome broke the
  // headline as `…สู่ความเป็นมือ / อาชีพ` at 1024 and 1440. 600/760 renders it
  // as two lines with the phrase intact at 768, 1024, 1440 and 2560.
  assert.match(HERO.code, /lg:max-w-\[600px\]/, 'the lg cap moved');
  assert.match(HERO.code, /xl:max-w-\[760px\]/, 'the xl cap moved');
  assert.ok(
    !HERO.code.includes('"max-w-[560px]"'),
    'the 560px cap is back — that is the three-line, mid-word-break state'
  );
});

test('the astronaut is NOT priority, and is never object-cover', () => {
  const art = imageBlock(HERO.code, '/hero-img/nongnai.png');
  assert.ok(art, 'the astronaut <Image> is gone');
  assert.ok(
    !/\bpriority\b/.test(art),
    'the astronaut is marked priority — it competes with the real LCP image'
  );
  assert.match(art, /object-contain/, 'a transparent PNG must not be cropped');
  assert.ok(!/object-cover/.test(art), 'object-cover would slice the moon');
});

test('CONTROL: the image-block extractor isolates ONE element', () => {
  // Otherwise "the astronaut block has no priority" could be reading a block
  // that is empty, or the background's.
  const bg = imageBlock(HERO.code, '/hero-img/background.png');
  const art = imageBlock(HERO.code, '/hero-img/nongnai.png');
  assert.ok(!bg.includes('nongnai'), 'the background block swallowed the astronaut');
  assert.ok(!art.includes('background.png'), 'the astronaut block swallowed the background');
  assert.ok(art.includes('sizes='), 'the astronaut block is too short to contain its own props');
  assert.equal(imageBlock(HERO.code, '/hero-img/does-not-exist.png'), null);
});

// ── The pull-up, and the number it has to agree with ────────────────────────

test('the hero pulls itself up by the header height, as complete literals', () => {
  // Tailwind scans raw text: these MUST be literal classes. A class built by
  // interpolating PUBLIC_HEADER_HEIGHT_PX would emit perfect markup and no CSS.
  assert.ok(
    HERO.code.includes(`-mt-[${PUBLIC_HEADER_HEIGHT_PX}px]`),
    `the hero does not pull up by ${PUBLIC_HEADER_HEIGHT_PX}px — the header would ` +
    'sit over the page background instead of the artwork'
  );
  assert.ok(
    HERO.code.includes(`pt-[${PUBLIC_HEADER_HEIGHT_PX}px]`),
    'the hero does not give the header height back as padding — the headline ' +
    'would render underneath the header'
  );
  // …and no interpolated shape sneaked in beside them.
  assert.ok(
    !/-mt-\[\$\{/.test(HERO.code) && !/pt-\[\$\{/.test(HERO.code),
    'an interpolated arbitrary class emits markup and zero CSS'
  );
});

test('the header is still 80px tall plus its 1px border', () => {
  // The number above is derived from these two facts. If either moves, the
  // hero is silently out of register by the difference — so this reddens here
  // rather than being noticed by eye.
  assert.match(
    HEADER.code,
    /className="mx-auto flex h-20 max-w-\[1200px\]/,
    'the header row is no longer h-20 — update PUBLIC_HEADER_HEIGHT_PX with it'
  );
  assert.match(HEADER.code, /border-b/, 'the header lost its border-b');
  assert.equal(PUBLIC_HEADER_HEIGHT_PX, 81, 'h-20 (80px) + 1px border-b');
});

// ── The sentinel is single-sourced, and the hero stays a server component ───

test('both sides import the sentinel id — neither hardcodes the string', () => {
  // Read through `withImports`: the default view STRIPS import statements, so
  // an "imports X" guard on `.code` passes vacuously.
  assert.match(HERO.withImports, /import \{ HERO_OVERLAY_SENTINEL_ID \} from '@\/lib\/heroOverlay'/);
  assert.match(
    HEADER.withImports,
    // `[\s\S]` and not `[^}]`: the import list is long enough to be wrapped
    // across lines by the formatter, and a single-line-only matcher made this
    // guard red on a purely cosmetic reflow.
    /import \{[\s\S]*?HERO_OVERLAY_SENTINEL_ID[\s\S]*?\} from '@\/lib\/heroOverlay'/,
    'the header no longer imports the sentinel id from the shared module'
  );
  // The header no longer needs the height: with the sentinel at the hero's TOP
  // the two cancel out of the comparison (see the effect's comment). Importing
  // it anyway would be a dead binding.
  assert.ok(
    !HEADER.withImports.includes('PUBLIC_HEADER_HEIGHT_PX'),
    'the header imports a constant it no longer uses'
  );
  // The literal appears in the module that defines it and nowhere else.
  assert.ok(
    !HERO.code.includes(`'${HERO_OVERLAY_SENTINEL_ID}'`),
    'the hero hardcodes the sentinel id instead of importing it'
  );
  assert.ok(
    !HEADER.code.includes(`'${HERO_OVERLAY_SENTINEL_ID}'`),
    'the header hardcodes the sentinel id instead of importing it'
  );
});

test('the header observes that sentinel — no scrollY threshold', () => {
  assert.match(HEADER.code, /new IntersectionObserver\(/, 'the switch-back is not an observer');
  assert.match(HEADER.code, /getElementById\(HERO_OVERLAY_SENTINEL_ID\)/);
  assert.ok(
    !/scrollY/.test(HEADER.code),
    'a scroll constant is wrong whenever TopNotificationBar renders (or does not)'
  );
});

// ── An open panel beats the overlay ─────────────────────────────────────────

test('THE RULE: transparent needs overlay AND nothing hanging off the bar', () => {
  // Both halves, because either alone is satisfied by the other path having
  // been deleted. A transparent bar with a solid mega panel under it reads as
  // two unrelated surfaces with hero artwork in the seam.
  assert.equal(isHeaderTransparent({ overlayActive: true, openPanelCount: 0 }), true);
  assert.equal(isHeaderTransparent({ overlayActive: true, openPanelCount: 1 }), false);
  assert.equal(isHeaderTransparent({ overlayActive: true, openPanelCount: 3 }), false);
  assert.equal(isHeaderTransparent({ overlayActive: false, openPanelCount: 0 }), false);
  assert.equal(isHeaderTransparent({ overlayActive: false, openPanelCount: 2 }), false);
});

test('EVERY consumer reads the derived value, not the raw overlay state', () => {
  // The failure mode this prevents is specific: the bar goes opaque because a
  // panel opened, the nav links keep their forced-white treatment, and the nav
  // is white-on-white. The links and the bar must read the SAME value.
  const code = HEADER.code;
  assert.equal(
    (code.match(/overlay=\{overlayTransparent\}/g) ?? []).length,
    3,
    'the three nav triggers do not all read the derived value'
  );
  assert.ok(
    !/overlay=\{overlayActive\}/.test(code),
    'a nav trigger still reads the raw overlay state — white-on-white when a panel opens'
  );
  // The bar itself, and the two icon buttons beside it.
  assert.equal(
    (code.match(/\boverlayTransparent\b/g) ?? []).length >= 6,
    true,
    'not every treatment site reads the derived value'
  );
  // …and the derivation happens ONCE, through the shared rule.
  assert.match(
    code,
    /isHeaderTransparent\(\{\s*overlayActive,\s*openPanelCount: openPanels\.size,\s*\}\)/,
    'the header no longer derives transparency through the shared rule'
  );
  assert.match(
    HEADER.withImports,
    /import \{[\s\S]*?isHeaderTransparent[\s\S]*?\} from '@\/lib\/heroOverlay'/
  );
});

test('every panel that drops out of the bar reports through the ONE hook', () => {
  const code = HEADER.code;
  // Defined once…
  assert.equal(
    (code.match(/function useReportPanelOpen\(/g) ?? []).length,
    1,
    'the reporting hook is defined more than once'
  );
  // …and used by both panel kinds.
  assert.match(code, /useReportPanelOpen\(`dropdown:\$\{item\.label\}`, isOpen, onPanelOpenChange\)/);
  assert.match(code, /useReportPanelOpen\('mega', isOpen, onPanelOpenChange\)/);
  // Both are wired from the nav map.
  assert.equal(
    (code.match(/onPanelOpenChange=\{setPanelOpen\}/g) ?? []).length,
    2,
    'a panel is rendered without the reporter — it cannot make the bar opaque'
  );
  // The cleanup is what stops an unmounting-while-open panel from pinning the
  // bar opaque for ever.
  assert.match(code, /return \(\) => report\(key, false\)/);
});

test('REGRESSION: a hover-opened panel is dismissed on scroll and on Escape', () => {
  // THE DEFECT: `onMouseLeave` was the only thing that closed these panels, and
  // a scroll dispatches none. Measured in Chrome — hover a nav trigger, then
  // scroll: the panel stayed `opacity-100 pointer-events-auto` through 600 and
  // back to 0, so `openPanels` kept its key and the header never returned to
  // its transparent treatment over the hero. The IntersectionObserver was
  // innocent: it fired on the way up with top:0 and derived `true` every time.
  const code = HEADER.code;
  assert.equal(
    (code.match(/function useDismissOnScrollOrEscape\(/g) ?? []).length,
    1,
    'the dismiss hook is missing or defined more than once'
  );
  // BOTH hover-opened panel kinds use it. The mega menu is the one that was
  // reported, but the plain dropdowns open on hover through the same path.
  assert.equal(
    (code.match(/useDismissOnScrollOrEscape\(isOpen, setIsOpen\)/g) ?? []).length,
    2,
    'a hover-opened panel does not dismiss on scroll — it will pin the header opaque'
  );
  // The two events, and the listener being torn down again.
  assert.match(code, /window\.addEventListener\('scroll', dismiss, \{ passive: true \}\)/);
  assert.match(code, /event\.key === 'Escape'/);
  assert.match(code, /window\.removeEventListener\('scroll', dismiss\)/);
  assert.match(code, /window\.removeEventListener\('keydown', onKey\)/);
  // Only while open — a page with no menu open must not carry a scroll listener.
  assert.match(
    code,
    /if \(!isOpen\) return undefined;\s*\n\s*const dismiss/,
    'the scroll listener is attached even when no panel is open'
  );
});

test('the fix did NOT reach for a scroll threshold', () => {
  // The notification bar renders or does not, so the header's distance from the
  // top of the document is not a constant. That reasoning did not change when
  // this defect was fixed: the dismiss hook reacts to the scroll EVENT, and
  // reads no scroll position at all.
  assert.ok(!/scrollY/.test(HEADER.code), 'a scroll constant crept in');
  assert.ok(!/window\.pageYOffset/.test(HEADER.code), 'a scroll constant crept in');
  // …and the transparency decision still comes from the observer + the panel
  // set, through the one shared rule.
  assert.match(HEADER.code, /isHeaderTransparent\(\{/);
});

test('CONTROL: the consumer probes can tell the two identifiers apart', () => {
  // `overlayTransparent` CONTAINS neither `overlayActive` nor vice versa, but a
  // sloppy substring probe would still pass on the wrong one — show the
  // matchers discriminate, and that the file really was read.
  assert.equal(/overlay=\{overlayActive\}/.test('overlay={overlayTransparent}'), false);
  assert.equal(/overlay=\{overlayActive\}/.test('overlay={overlayActive}'), true);
  assert.ok(HEADER.code.length > 20000, 'the header source came back short — nothing was checked');
});

test('the rule is "the hero top has not passed the viewport top"', () => {
  // The comparison that goes with a TOP-anchored sentinel. Verified in Chrome
  // at 390/768/1024/1440/1900/2560, with the notification bar present and
  // removed: transparent at rest, opaque once the hero starts sliding under the
  // header, transparent again on the way back up.
  assert.match(
    HEADER.code,
    /setOverlayActive\(\s*entry\.boundingClientRect\.top >= -OVERLAY_SUBPIXEL_TOLERANCE_PX\s*\)/,
    'the switch rule changed — is the sentinel still at the hero TOP?'
  );
  // The old rule offset the comparison by the header height to meet a
  // BOTTOM-anchored sentinel. Both halves of that are gone.
  assert.ok(
    !/rootMargin/.test(HEADER.code),
    'a rootMargin offset belongs to the old bottom-anchored rule'
  );
});

test('REGRESSION: the rule tolerates a sub-pixel negative, never a bare >= 0', () => {
  // THE DEFECT, measured in Chrome at scroll 0 with the page at rest on the
  // hero: the sentinel's `boundingClientRect.top` is NOT 0 at a fractional
  // device pixel ratio, because the hero's 81px pull-up snaps to whole device
  // pixels. It read -0.2546 at 135% zoom (the user's setting), -0.4286 at 175%,
  // -0.2000 at 125%, -0.0852 at 110%. A bare `>= 0` is false at every one of
  // them, so the header never returns to transparent at the top of the page —
  // and no further callback arrives to correct it, because a 1px sentinel that
  // never stops intersecting never crosses the threshold again.
  //
  // 100% and 200% land on exactly 0, which is why it looked width-dependent:
  // the "working" 2560 and the "failing" ~1900 were one monitor at two zooms.
  assert.ok(
    !/boundingClientRect\.top >= 0/.test(HEADER.code),
    'the bare >= 0 comparison is back — this breaks at 110/125/135/150/175% zoom'
  );
  assert.match(
    HEADER.code,
    /top >= -OVERLAY_SUBPIXEL_TOLERANCE_PX/,
    'the comparison no longer goes through the shared tolerance'
  );
  assert.match(
    HEADER.withImports,
    /OVERLAY_SUBPIXEL_TOLERANCE_PX/,
    'the tolerance is not imported from the shared module'
  );
});

test('the tolerance covers the measured residue, with margin', () => {
  // The number is derived from a measurement, so it is pinned to the worst case
  // that measurement found rather than left to taste. The residue is bounded by
  // one device pixel (1/dpr CSS px) and the worst observed was 0.4286 at 175%.
  assert.equal(typeof OVERLAY_SUBPIXEL_TOLERANCE_PX, 'number');
  assert.ok(
    OVERLAY_SUBPIXEL_TOLERANCE_PX >= 0.5,
    `tolerance ${OVERLAY_SUBPIXEL_TOLERANCE_PX} is below the 0.4286 residue measured at 175% zoom`
  );
  assert.ok(
    OVERLAY_SUBPIXEL_TOLERANCE_PX <= 4,
    'a large tolerance stops being sub-pixel forgiveness and starts hiding real scroll'
  );
  // Every measured resting value must pass the rule, and a real scroll must not.
  const RESTING = [1.0, 0.4897, 0.3333, 0.2539, 0.1215, 0, -0.0852, -0.2, -0.2546, -0.3333, -0.4286];
  for (const top of RESTING) {
    assert.ok(
      top >= -OVERLAY_SUBPIXEL_TOLERANCE_PX,
      `a resting sentinel at ${top} would read as scrolled`
    );
  }
  for (const top of [-50, -150, -400, -600]) {
    assert.ok(
      !(top >= -OVERLAY_SUBPIXEL_TOLERANCE_PX),
      `a sentinel scrolled to ${top} would read as at rest`
    );
  }
});

test('CONTROL: the tolerance probes fail on a bare zero and on a huge value', () => {
  // Without this, "every resting value passes" could be true of any rule at all.
  const bare = 0;
  assert.equal(-0.2546 >= -bare, false, 'the bare rule really does reject the measured value');
  assert.equal(-0.2546 >= -OVERLAY_SUBPIXEL_TOLERANCE_PX, true);
  // …and a tolerance big enough to swallow a real scroll would fail the bound.
  const absurd = 500;
  assert.equal(absurd <= 4, false, 'the upper bound does not discriminate');
});

test('the hero ships no client JavaScript', () => {
  assert.ok(!HERO.raw.includes("'use client'"), 'the hero became a client component');
  assert.ok(!/\buseState\b|\buseEffect\b/.test(HERO.code), 'the hero grew client state');
  assert.ok(
    !/localStorage|sessionStorage/.test(HERO.code),
    'the hero touches web storage'
  );
});

test('CONTROL: these source probes can tell present from absent', () => {
  // Each matcher above answers NO for a near-miss, so a green run is a fact
  // about the file rather than about a matcher that matches anything.
  assert.ok(!HERO.code.includes('-mt-[80px]'), 'the pull-up probe matches the wrong number');
  assert.ok(!HERO.code.includes("'use client'"));
  assert.ok(!SHELL.code.includes('overlay = true'), 'the default-false probe is not reading a default');
  assert.ok(HEADER.code.includes('IntersectionObserver'));
  // …and the raw view of the hero really was read (non-trivial file).
  assert.ok(HERO.raw.length > 1000, 'the hero source came back empty — nothing was checked');
});
