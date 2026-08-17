import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The mobile edge inset on the three public list routes.
 *
 * ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
 * /training-course, /promotions and /articles each shipped their content column
 * with NO horizontal padding, so at 360/390/430 the course cards, the promotion
 * grid, the banner carousel and the article cards all ran flush against the
 * viewport edge — measured left 0 / right 360, computed padding-left 0px, with
 * card borders sitting ON x=0 and rounded corners cut off the screen.
 *
 * Nothing in the markup said "flush on purpose". That is the whole reason a
 * guard is worth having: a missing class looks identical to a deliberate one,
 * and the site DOES have deliberate full-bleed elements (the course detail hero
 * and CourseSectionTabs). Distinguishing them is not something a reader can do
 * by looking, so it is written down here instead.
 *
 * ── WHY EVERY 1200px BOX, RATHER THAN THE FIVE LINES THAT WERE FIXED ────────
 * Pinning the exact lines would pass the moment someone adds a SIXTH content
 * section without the inset — which is precisely how three of these shipped.
 * The rule is a class rule: on these routes, a `max-w-[1200px]` box is the page
 * content column, and a content column is inset on mobile. Checked against
 * every such box in the files, including the three that were already correct
 * (HeroSearch, FilterBar, the promotions hero) — those are the ones the value
 * was read off, so if they ever lose it the convention has moved and this guard
 * should be the thing that says so.
 *
 * ── WHY sourceScan AND NOT readFileSync ─────────────────────────────────────
 * Mandatory here, not stylistic, and the banner assertion below PROVES it: the
 * ratio fix left a comment in PromotionBannerCarousel.jsx explaining that
 * `aspect-[4/3]` discards 58.5% of the artwork. A raw-text guard asserting the
 * file does NOT contain `aspect-[4/3]` would therefore go red on completely
 * correct code — defect 2 in the sourceScan header, and the exact failure mode
 * 96668d8 converted three sticky-bar guards to avoid. `readSource(...).code`
 * strips comments, so the guard sees the class list and not the prose about it.
 * There is a control below that demonstrates this on the live file rather than
 * asserting it in a comment.
 *
 * ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
 * It is a SHAPE guard on source text. It does not lay anything out: jsdom has
 * no layout, so no tier here can measure that the inset is 16px, that the cards
 * moved, or that nothing exceeds 100vw. Those were measured in a real browser
 * at 360/390/430 and the numbers live in the commit messages. What this pins is
 * the only thing text can pin — that the classes are still there.
 */

// ── the files, and how many 1200px content boxes each is expected to hold ────
//
// EXACT counts, not floors, for the reason test/run.mjs gives about its own:
// a floor cannot catch the box added this week. Adding a section to one of
// these files should bump the number HERE, in the same commit, which is the
// moment to ask whether the new box carries the inset.
const CONTENT_BOX_FILES = [
  ['src/app/(public)/training-course/_components/CourseListClient.jsx', 1],
  ['src/app/(public)/training-course/_components/FilterBar.jsx',        1],
  ['src/app/(public)/training-course/_components/HeroSearch.jsx',       1],
  ['src/app/(public)/promotions/page.jsx',                              3],
  ['src/app/(public)/articles/page.jsx',                                1],
];

const CONTENT_BOX = 'max-w-[1200px]';

/** Every double-quoted className literal in a scrubbed source file. */
function classNames(code) {
  return [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
}

/**
 * Does this class list carry `cls` as a class of its own?
 *
 * Whitespace-bounded on purpose: a bare `includes('px-4')` is satisfied by
 * `lg:px-4` and by `sm:px-40`, so a box that is inset ONLY from the large
 * breakpoint up — which is the defect, since these routes were broken on
 * mobile specifically — would read as correct.
 */
function hasClass(list, cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(list);
}

/**
 * THE CHECK, as a pure function so a control can feed it a doctored string.
 *
 * Returns a reason per way the box can be wrong; empty means correct. A boolean
 * would collapse "no inset at all" and "inset only from lg up" into one answer,
 * and the second is the sneakier failure — it looks like padding in a desktop
 * screenshot and is absent on every phone.
 */
export function insetProblems(list) {
  const problems = [];
  if (!list.includes(CONTENT_BOX)) return problems; // not a content column

  if (!hasClass(list, 'px-4')) {
    problems.push(
      `a ${CONTENT_BOX} content column carries no unprefixed px-4, so it runs ` +
        `flush to the viewport edge on mobile: "${list}"`,
    );
    if (/(?:^|\s)(?:sm|md|lg|xl):px-/.test(list)) {
      problems.push(
        'it does carry a breakpoint-scoped horizontal inset — that insets the ' +
          'desktop view and leaves 360/390/430 flush, which is the defect, not the fix',
      );
    }
  }
  return problems;
}

for (const [file, expected] of CONTENT_BOX_FILES) {
  test(`${file}: every max-w-[1200px] content column is inset on mobile`, () => {
    const boxes = classNames(readSource(file).code).filter((c) => c.includes(CONTENT_BOX));

    // Non-vacuity first. Without this, a renamed class or a switch to cn()
    // would empty the list and the loop below would pass over nothing.
    assert.equal(
      boxes.length,
      expected,
      `expected ${expected} ${CONTENT_BOX} box(es) in ${file}, found ${boxes.length} — ` +
        'if a section was added or removed, bump the count in CONTENT_BOX_FILES ' +
        'deliberately rather than widening this assertion',
    );

    for (const box of boxes) {
      assert.deepEqual(insetProblems(box), [], `${file}: ${insetProblems(box).join('; ')}`);
    }
  });
}

test('the /articles white shell is inset on mobile too, not only from sm up', () => {
  // This one is NOT a 1200px box, so the rule above cannot reach it — and it is
  // the primary cause on that route. Its padding was `sm:p-6` alone, which
  // starts at 640px, so below that a rounded-2xl card with a shadow had no
  // horizontal padding and its side corners fell off screen. The section around
  // it contributes the other 16px; both layers are needed and both are pinned.
  const code = readSource('src/app/(public)/articles/_components/ArticlesPageClient.jsx').code;
  const shells = classNames(code).filter((c) => c.includes('sm:p-6'));

  assert.equal(shells.length, 1, 'exactly one sm:p-6 shell in ArticlesPageClient');
  const [shell] = shells;

  assert.ok(
    hasClass(shell, 'px-4'),
    'the white list shell carries an unprefixed px-4 — sm:p-6 alone leaves every ' +
      `phone width with zero horizontal padding: "${shell}"`,
  );
  assert.ok(
    hasClass(shell, 'pt-10'),
    'and it keeps pt-10 — the extra space above the toolbar is deliberate at ' +
      'every width, so px-4 was added beside it rather than folded into a shorthand',
  );
});

test('CONTROL: insetProblems reddens on a box with no inset', () => {
  // The whole guard rests on this function reporting a problem. If it silently
  // returned [] for everything, all five tests above would be decoration.
  const bare = 'mx-auto max-w-[1200px] py-8 lg:py-10'; // the pre-fix CourseListClient
  assert.notDeepEqual(insetProblems(bare), []);
  assert.match(insetProblems(bare)[0], /flush to the viewport edge/);
});

test('CONTROL: a desktop-only inset does NOT satisfy the mobile rule', () => {
  // The sneaky shape: padding that exists, but not at 360.
  const desktopOnly = 'mx-auto max-w-[1200px] py-8 lg:px-6';
  const problems = insetProblems(desktopOnly);
  assert.notDeepEqual(problems, [], 'lg:px-6 alone is not a mobile inset');
  assert.equal(problems.length, 2, 'and it is named as its own distinct failure');
  assert.match(problems[1], /leaves 360\/390\/430 flush/);

  // ... and the near-miss that a bare includes() would wave through.
  assert.notDeepEqual(insetProblems('mx-auto max-w-[1200px] sm:px-40'), []);
});

test('CONTROL: a box that is not a content column is not policed', () => {
  // insetProblems must be silent on everything else, or it would demand px-4 on
  // every div in the file and the real assertions would drown.
  assert.deepEqual(insetProblems('grid grid-cols-1 gap-6'), []);
  assert.deepEqual(insetProblems('mx-auto max-w-6xl px-4'), []);
});

// ── R2: the promotion banner ratio ──────────────────────────────────────────

const BANNER = readSource('src/components/promotions/PromotionBannerCarousel.jsx');

/**
 * THE BANNER CHECK, pure for the same reason as insetProblems.
 *
 * The measurement behind it, so a future tidy-up reddens with the cause
 * attached rather than with "expected true to be false": the artwork admins
 * upload is 360x112, ratio 3.214. `aspect-[16/5]` is 3.200 — a 0.4% mismatch.
 * The `aspect-[4/3]` this replaced is 1.333, and object-cover resolves that by
 * scaling 270/112 = 2.411x, putting an 868px-wide image in a 360px box and
 * DISCARDING 58.5% OF THE ARTWORK, 254px off each side.
 */
export function ratioProblems(list) {
  const problems = [];

  if (!hasClass(list, 'aspect-[16/5]')) {
    problems.push(
      'the banner band is not aspect-[16/5] unconditionally — 16/5 (3.200) is ' +
        "the ratio the uploaded artwork actually has (360x112, 3.214), and it is " +
        'the only ratio at which object-cover discards nothing',
    );
  }

  const scoped = list.match(/(?:^|\s)(?:sm|md|lg|xl|2xl|max-[a-z]+):aspect-\[[^\]]+\]/g) ?? [];
  if (scoped.length) {
    problems.push(
      `a breakpoint-scoped aspect override is back (${scoped.map((s) => s.trim()).join(', ')}). ` +
        'The mobile override was aspect-[4/3]: against a 3.214 asset, object-cover ' +
        'then scales 2.411x and DISCARDS 58.5% OF THE ARTWORK — 254px off each ' +
        'side, taking the banner logo with one and the call to action with the ' +
        'other. A taller mobile band needs a separate mobile ASSET, not a ratio ' +
        'the artwork does not have.',
    );
  }
  return problems;
}

test('the promotion banner is 16:5 at every width, with no mobile override', () => {
  // `bg-9e-ice` identifies the band box, and identifies it even if the aspect
  // class is deleted outright — keying on `aspect-` would make a removed ratio
  // look like "no band found" and pass.
  const bands = classNames(BANNER.code).filter((c) => c.includes('bg-9e-ice'));
  assert.equal(bands.length, 1, 'exactly one banner band box in PromotionBannerCarousel');

  const problems = ratioProblems(bands[0]);
  assert.deepEqual(problems, [], problems.join(' | '));
});

test('CONTROL: ratioProblems reddens on the pre-fix band, naming the 58.5%', () => {
  const preFix =
    'relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-9e-ice md:aspect-[16/5] dark:bg-[#0D1B2A]';
  const problems = ratioProblems(preFix);
  assert.notDeepEqual(problems, [], 'the shape this commit removed must be rejected');
  assert.match(problems.join(' '), /58\.5%/, 'and the reason travels with the failure');

  // Deleting the ratio altogether is a different wrong, and reported as one.
  assert.match(
    ratioProblems('relative w-full overflow-hidden rounded-2xl bg-9e-ice').join(' '),
    /not aspect-\[16\/5\] unconditionally/,
  );
});

test('CONTROL: this guard would false-RED if it read raw source', () => {
  // Not hypothetical and not a comment — measured on the live file. The ratio
  // fix explains itself in prose that necessarily names the class it removed,
  // so a raw-text guard sees `aspect-[4/3]` in a file that no longer applies it.
  // This is why every read above goes through readSource(...).code.
  assert.ok(
    BANNER.raw.includes('aspect-[4/3]'),
    'the file still explains the ratio it removed, in a comment',
  );
  assert.ok(
    !BANNER.code.includes('aspect-[4/3]'),
    'but the scrubbed code does not apply it — the two differ, which is the point',
  );
});
