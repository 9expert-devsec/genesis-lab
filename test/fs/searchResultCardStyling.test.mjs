import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE FIVE RESULT CARDS: shared STYLING, separate COMPONENTS.
 *
 * The five cards look like one object and are five components on purpose —
 * their metadata differs in ways that do not generalise, and a shared
 * `<ResultCard>` would end up branching on `isPromotion` / `isCourse` inside
 * itself. What IS shared is the class strings, and those must exist once.
 *
 * This is an fs guard because a duplicated class string renders IDENTICALLY to
 * a shared one — the divergence only appears the next time someone tunes one
 * card and the other four silently stay behind. It is also where the
 * next/image-vs-<img> decision is pinned, because test/stub-next-image.mjs
 * flattens `next/image` to a bare `<img>` and the render tier cannot tell them
 * apart at all.
 */

const CLIENT = readSource('src/app/(public)/search/_components/SearchClient.jsx');

const countOf = (code, re) => (code.match(re) ?? []).length;

/** The body of a top-level function declaration, as text. */
function functionSlice(code, name) {
  const start = code.search(new RegExp(String.raw`^(export\s+)?function\s+${name}\s*\(`, 'm'));
  assert.notEqual(start, -1, `${name} not found — this guard has lost its subject`);
  const rest = code.slice(start + 1);
  const end = rest.search(/^(export\s+)?(function|const)\s/m);
  return end === -1 ? rest : rest.slice(0, end);
}

const CARDS = [
  'CourseResultCard',
  'OnlineCourseResultCard',
  'CareerPathResultCard',
  'PromotionResultCard',
  'ArticleResultCard',
];

// ── One declaration, five readers ───────────────────────────────────────────

test('the cover TRACK width is declared once, and is a fixed length', () => {
  /**
   * The root cause this replaced: `grid-cols-[auto_1fr]` took the track width
   * from the cover, whose width came from the ratio times its height, whose
   * height came from the row, whose height came from the TEXT. `auto` anywhere
   * in a cover track restores the circularity.
   *
   * fs rather than render because the numbers must exist ONCE — the render tier
   * can see that a card has a fixed track, but not that the two cards next to
   * it are reading the same declaration rather than three copies of it.
   */
  for (const name of ['RESULT_COVER_TRACK', 'RESULT_COVER_TRACK_SQUARE']) {
    assert.equal(
      countOf(CLIENT.code, new RegExp(String.raw`^const ${name}\s*=`, 'gm')), 1,
      `${name} must have exactly one declaration`,
    );
  }
  assert.equal(
    /grid-cols-\[auto/.test(CLIENT.code), false,
    'an `auto` cover track makes the cover width depend on the text',
  );
  // Every track literal in the file is a fixed px length.
  const tracks = CLIENT.code.match(/grid-cols-\[[^\]]+\]/g) ?? [];
  assert.ok(tracks.length >= 4, `expected base + sm for two tracks, got ${tracks}`);
  for (const track of tracks) {
    assert.match(track, /grid-cols-\[\d+px_1fr\]/, `"${track}" is not a fixed length`);
  }
  // …and the two wrappers are COMPOSED from one base plus one track, never
  // written out as two independent class strings.
  assert.match(CLIENT.code, /const RESULT_CARD = RESULT_CARD_BASE \+ ' ' \+ RESULT_COVER_TRACK;/);
  assert.match(CLIENT.code, /const RESULT_CARD_SQUARE = RESULT_CARD_BASE \+ ' ' \+ RESULT_COVER_TRACK_SQUARE;/);
});

/** Any breakpoint variant that cancels `align-self: stretch`. */
const CANCELS_STRETCH = /(^|\s)(sm|md|lg|xl|2xl):self-(start|end|center|baseline|auto)(\s|$)/;

test('the cover stretches at every width, with no breakpoint taking it back', () => {
  /**
   * ONE constant, ONE state. It used to be `self-stretch sm:self-start`, on the
   * theory that a 256px 16:9 cover (144px tall) matched the desktop text column.
   * The course card's text column is ~154px, and grid items in one row share
   * that row's height — so the strip of background the stretch removed on a
   * phone came back on desktop, smaller. The qualifier is gone.
   *
   * `h-full` stays banned and is NOT the same declaration: it is `height: 100%`
   * against a parent whose height is content-derived, which is the circular half
   * of the original bug. `align-self: stretch` is resolved by the grid, which
   * has already sized the row from a DECLARED track width.
   *
   * Matched with `(^|\s)…(\s|$)` throughout because an unprefixed Tailwind
   * utility is a substring of its own breakpoint variant: `self-start` occurs
   * inside `sm:self-start`, and a bare `includes` could not tell the two apart.
   */
  const base = CLIENT.code.match(/^const RESULT_COVER_BASE = '([^']*)'/m)?.[1];
  assert.ok(base, 'RESULT_COVER_BASE is gone');
  assert.match(base, /(^|\s)self-stretch(\s|$)/, 'the cover must fill the card at every width');
  assert.equal(/(^|\s)h-full(\s|$)/.test(base), false, '`h-full` is the circular half');
  assert.equal(
    CANCELS_STRETCH.test(base), false,
    'a breakpoint override puts the dead strip back above that width',
  );
  assert.equal(
    /(^|\s)self-start(\s|$)/.test(base), false,
    'an UNPREFIXED self-start would pin every cover to 144px and the dead space with it',
  );
  assert.equal(/min-h-36/.test(CLIENT.code), false, 'the floor the cover height now provides');
});

test('the ONLY edit to the cover slot was dropping the sm: qualifier', () => {
  /**
   * Mobile is settled and must not move. Stated as an equality against the
   * previous value rather than as clauses, because every clause above could hold
   * while some other token — `relative`, the placeholder fill, the clipping —
   * changed underneath them and quietly moved the phone rendering.
   */
  const previous = 'relative w-full self-stretch sm:self-start overflow-hidden bg-gray-100';
  const base = CLIENT.code.match(/^const RESULT_COVER_BASE = '([^']*)'/m)?.[1];
  assert.equal(base, previous.replace(' sm:self-start', ''));
});

test('CONTROL: the stretch probes DO fire on every shape they exclude', () => {
  // Absence assertions need a positive run against the strings they forbid.
  const old = 'group grid min-h-36 grid-cols-[auto_1fr] overflow-hidden rounded-xl';
  assert.ok(/grid-cols-\[auto/.test(old), 'the probe sees the old track');
  assert.ok(/min-h-36/.test(old), 'and the old floor');
  assert.ok(/(^|\s)h-full(\s|$)/.test('relative aspect-video h-full shrink-0'), 'and the old cover');

  // The breakpoint family, run against the literal that was removed AND against
  // the same defect one breakpoint later — the reason the clause is a family
  // rather than the one string this change happened to delete.
  assert.ok(
    CANCELS_STRETCH.test('relative w-full self-stretch sm:self-start overflow-hidden'),
    'the qualifier this change removed is detectable',
  );
  assert.ok(
    CANCELS_STRETCH.test('relative w-full self-stretch lg:self-start'),
    'and so is the same defect at lg',
  );
  assert.equal(
    CANCELS_STRETCH.test('relative w-full self-stretch overflow-hidden bg-gray-100'), false,
    'and the shipped string does not trip it',
  );

  // The substring trap, both directions.
  assert.ok(
    /(^|\s)self-start(\s|$)/.test('relative w-full self-start overflow-hidden'),
    'a base self-start is detectable…',
  );
  assert.equal(
    /(^|\s)self-start(\s|$)/.test('relative w-full sm:self-start overflow-hidden'), false,
    '…and the sm: variant does not count as one',
  );
  assert.equal(
    /(^|\s)self-start(\s|$)/.test('relative w-full self-stretch'), false,
    'nor does self-stretch, which merely begins the same way',
  );
});

test('the optimised covers ask for the size they are DECODED at, not the box width', () => {
  /**
   * fs, not render: test/stub-next-image.mjs drops every next-only prop, so
   * `sizes` is invisible to that tier by construction.
   *
   * `object-cover` scales the source until it COVERS the box, and the limiting
   * dimension is the HEIGHT — so a 16:9 cover in a 154px-tall card is decoded at
   * ~274px wide whether its track is 128px or 256px. The value was a media query
   * (304px below `sm`, 256px above) while the desktop cover was pinned to its
   * 144px ratio height; dropping the `sm:` qualifier from the slot converged
   * both halves on one worst case and left the desktop half under-requesting.
   *
   * One flat value now, and it must NOT be a media query — a breakpoint here
   * would be describing a distinction the layout no longer has.
   */
  assert.equal(
    countOf(CLIENT.code, /^const RESULT_COVER_SIZES =/gm), 1,
    'one declaration, read by every optimised cover',
  );
  assert.match(
    CLIENT.code, /^const RESULT_COVER_SIZES = '304px';$/m,
    'one value, covering the ~274px worst case at both tracks',
  );
  assert.equal(
    /const RESULT_COVER_SIZES = '[^']*max-width/.test(CLIENT.code), false,
    'no breakpoint — the two halves decode at the same width now',
  );
  assert.equal(
    countOf(CLIENT.code, /sizes="256px"/g), 0,
    'no card may keep the flat track width',
  );
  for (const name of ['CourseResultCard', 'OnlineCourseResultCard', 'ArticleResultCard']) {
    assert.match(
      functionSlice(CLIENT.code, name), /sizes=\{RESULT_COVER_SIZES\}/,
      `${name} must read the shared sizes value`,
    );
  }
});

test('CONTROL: the sizes probes distinguish the value from the ones it replaced', () => {
  /**
   * `304px` is a SUBSTRING of the media query it replaced, so a containment
   * check would pass against the exact string being excluded. The assertion
   * above is anchored on the whole declaration for that reason; here it is
   * demonstrated, against both superseded values.
   */
  const shipped = "const RESULT_COVER_SIZES = '304px';";
  const mediaQuery = "const RESULT_COVER_SIZES = '(max-width: 639px) 304px, 256px';";
  assert.ok(mediaQuery.includes('304px'), 'the new value really is inside the old one…');
  assert.equal(
    /^const RESULT_COVER_SIZES = '304px';$/m.test(mediaQuery), false,
    '…and the anchored probe rejects it',
  );
  assert.ok(/^const RESULT_COVER_SIZES = '304px';$/m.test(shipped), 'while accepting the shipped one');
  assert.ok(
    /const RESULT_COVER_SIZES = '[^']*max-width/.test(mediaQuery),
    'the media-query probe sees a real media query',
  );
  assert.equal(countOf('<Image sizes="256px" />', /sizes="256px"/g), 1, 'and the flat form IS found where it is');
});

test('the shared card classes are declared exactly once', () => {
  for (const name of [
    'RESULT_CARD_BASE',
    'RESULT_CARD',
    'RESULT_CARD_SQUARE',
    'RESULT_COVER_BASE',
    'RESULT_COVER',
    'RESULT_COVER_SQUARE',
    'RESULT_COVER_IMG',
    'RESULT_COVER_FALLBACK',
    'RESULT_BODY',
    'RESULT_TITLE',
    'RESULT_TEASER',
    'RESULT_META',
    'RESULT_META_BOTTOM',
  ]) {
    assert.equal(
      countOf(CLIENT.code, new RegExp(String.raw`^const ${name}\s*=`, 'gm')), 1,
      `${name} must have exactly one declaration`,
    );
  }
  // The two ratio variants are COMPOSED from the base, not written out twice.
  assert.match(CLIENT.code, /const RESULT_COVER = RESULT_COVER_BASE \+ ' aspect-video'/);
  assert.match(CLIENT.code, /const RESULT_COVER_SQUARE = RESULT_COVER_BASE \+ ' aspect-square'/);
});

test('every card reads the shared classes rather than inlining them', () => {
  for (const name of CARDS) {
    const body = functionSlice(CLIENT.code, name);
    // Either wrapper — both are composed from RESULT_CARD_BASE plus one of the
    // two track constants, so neither is a second copy of the styling.
    assert.match(
      body, /className=\{RESULT_CARD(_SQUARE)?\}/,
      `${name} must use a shared wrapper class`,
    );
    assert.match(body, /className=\{RESULT_COVER(_SQUARE)?\}/, `${name} must use a shared cover slot`);
    assert.match(body, /className=\{RESULT_COVER_IMG\}/, `${name} must use the shared cover-image class`);
    assert.match(body, /className=\{RESULT_COVER_FALLBACK\}/, `${name} needs the shared fallback slot`);
    assert.match(body, /className=\{RESULT_BODY\}/, `${name} must use the shared body class`);
    // `RESULT_TITLE` or `RESULT_TITLE + ' …'` — composing a local nudge onto the
    // shared string is still reading it, not copying it.
    assert.match(
      body, /className=\{RESULT_TITLE( \+ '[^']*')?\}/,
      `${name} must use the shared title class`,
    );
  }
});

test('no card inlines a copy of the wrapper or cover class string', () => {
  /**
   * The regression this exists for: someone tuning one card pastes the class
   * list inline "just for this one", and the next global restyle silently
   * misses it. Scoped to the card bodies, since the constants themselves
   * legitimately contain these strings.
   */
  const marks = [
    'grid-cols-[', 'hover:-translate-y-0.5', 'aspect-video', 'aspect-square',
    'object-cover', 'line-clamp-2 text-xs leading-relaxed', 'mt-auto flex',
  ];
  for (const name of CARDS) {
    const body = functionSlice(CLIENT.code, name);
    for (const mark of marks) {
      assert.equal(
        body.includes(mark), false,
        `${name} inlines "${mark}" — it belongs in the shared constant`,
      );
    }
  }
});

test('CONTROL: the inline-copy probe DOES fire on a pasted class list', () => {
  /**
   * Without this, every assertion above is satisfiable by a matcher that finds
   * nothing — and "no card inlines it" would hold forever, including after
   * someone inlined it.
   */
  const pasted = `
function CourseResultCard({ course }) {
  return <Link className="group grid min-h-36 grid-cols-[auto_1fr] hover:-translate-y-0.5">x</Link>;
}
`;
  assert.ok(pasted.includes('grid-cols-[auto_1fr]'), 'the probe sees a pasted wrapper');
  assert.ok(pasted.includes('hover:-translate-y-0.5'));
  // …and the live card bodies really are non-empty, so the absence means something.
  for (const name of CARDS) {
    assert.ok(functionSlice(CLIENT.code, name).length > 300, `${name}'s body was actually read`);
  }
});

// ── Separate components, no type branching ──────────────────────────────────

test('there is no shared card component branching on which type it renders', () => {
  /**
   * The shape explicitly rejected: one renderer taking every type's metadata
   * and switching internally. `ResultRow` dispatches by type — that is a
   * lookup, not a card — and it must stay a dispatch.
   */
  for (const flag of ['isPromotion', 'isCourse', 'isArticle', 'isCareerPath', 'isOnline']) {
    assert.equal(
      CLIENT.code.includes(flag), false,
      `${flag} suggests a shared renderer branching on its own type`,
    );
  }
  assert.equal(CARDS.length, 5, 'five card components…');
  for (const name of CARDS) {
    assert.equal(
      countOf(CLIENT.code, new RegExp(String.raw`^function ${name}\(`, 'gm')), 1,
      `…and ${name} is one of them, declared once`,
    );
  }

  // ResultRow only picks; it must not style or lay anything out.
  const dispatch = functionSlice(CLIENT.code, 'ResultRow');
  assert.equal(dispatch.includes('className'), false, 'the dispatcher must not render markup');
  assert.ok(dispatch.length < 600, 'and must stay a lookup, not grow into a card');
});

// ── next/image vs <img>, decided per host provenance ────────────────────────

test('the covers with PROVEN hosts use next/image', () => {
  /**
   * `course_cover_url`, `o_course_cover_url` and `coverUrl` are already
   * rendered through next/image elsewhere in the app (/training-course's
   * CourseCard, the home page's OnlineCourseCard, /articles), so their hosts
   * are known-good against next.config.mjs `remotePatterns` in production.
   */
  for (const name of ['CourseResultCard', 'OnlineCourseResultCard', 'ArticleResultCard']) {
    const body = functionSlice(CLIENT.code, name);
    assert.match(body, /<Image\s/, `${name} should render next/image`);
    assert.equal(/<img\s/.test(body), false, `${name} should not fall back to a raw img`);
  }
  assert.match(CLIENT.withImports, /import Image from 'next\/image'/);
});

test('the covers with UNPROVEN hosts stay on a raw <img>', () => {
  /**
   * `hero_image_url` and `thumbnail_url` are rendered with a plain <img> by
   * EVERY existing consumer, so no code path has ever proven their hosts
   * against `remotePatterns`. next/image throws at runtime on an unlisted host,
   * and it would do so only for the rows whose cover happens to come from one —
   * the worst possible failure distribution, since the page would look fine in
   * testing. Adding hosts to next.config.mjs is out of scope for this change.
   */
  for (const name of ['CareerPathResultCard', 'PromotionResultCard']) {
    const body = functionSlice(CLIENT.code, name);
    assert.match(body, /<img\s/, `${name} should render a raw img`);
    assert.equal(/<Image\s/.test(body), false, `${name} must not use the optimiser`);
  }
  // The `eslint-disable-next-line @next/next/no-img-element` these need is NOT
  // asserted here: readSource strips comments, so it is invisible to this tier
  // by design. `next lint` is what would catch its absence.
});

test('CONTROL: the two probes distinguish the two elements', () => {
  // `<img` is a substring of nothing here, but `<Image` and `<img` differ only
  // by case — asserted both ways so a case-insensitive slip cannot pass.
  assert.ok(/<Image\s/.test('<Image src="x" />'));
  assert.equal(/<Image\s/.test('<img src="x" />'), false);
  assert.ok(/<img\s/.test('<img src="x" />'));
  assert.equal(/<img\s/.test('<Image src="x" />'), false);
});

// ── Behaviour that stays shared regardless of styling ───────────────────────

test('the objectives / topics field names appear NOWHERE in the search stack', () => {
  /**
   * The narrowing has to reach further than the haystack. These two fields were
   * fetched by the corpus, matched by the haystack, and quoted by a snippet;
   * removing one of the three would leave the other two paying for a rule that
   * no longer exists. Same claim shape as `contentText`: not fetched, not
   * matched, not serialised, not rendered.
   */
  const MATCH = readSource('src/lib/search/matchSearch.js');
  const CORPUS = readSource('src/lib/search/searchCorpus.js');
  for (const [name, src] of Object.entries({ MATCH, CORPUS, CLIENT })) {
    for (const dead of ['course_objectives', 'training_topics']) {
      assert.equal(
        src.code.includes(dead), false,
        `${name} still mentions ${dead} — the narrowing must reach every layer`,
      );
    }
  }
  // …and the career-path pair went the same way.
  for (const dead of ['objectives', 'suitable_for']) {
    assert.equal(
      new RegExp(String.raw`cp\?\.${dead}`).test(MATCH.code), false,
      `the career-path haystack still reads ${dead}`,
    );
  }
});

test('CONTROL: the dead-field probe DOES fire on the code it replaced', () => {
  // Every assertion above is an absence; run the matchers against the strings
  // that were really there.
  const old = "...(Array.isArray(c?.course_objectives) ? c.course_objectives : []),";
  assert.ok(old.includes('course_objectives'));
  assert.ok(/cp\?\.objectives/.test('...(Array.isArray(cp?.objectives) ? cp.objectives : []),'));
  // …and the file being scanned is real.
  assert.ok(readSource('src/lib/search/matchSearch.js').code.includes('course_teaser'));
});

test('the bottom-anchored row constant is declared once and shared', () => {
  assert.equal(
    countOf(CLIENT.code, /^const RESULT_META_BOTTOM =/gm), 1,
    'one declaration',
  );
  for (const name of ['CourseResultCard', 'OnlineCourseResultCard', 'ArticleTagRow']) {
    assert.match(
      functionSlice(CLIENT.code, name), /className=\{RESULT_META_BOTTOM\}/,
      `${name} must read the shared bottom row rather than adding a fourth spacing constant`,
    );
  }
});

test('the outbound online href is still defined in one place', () => {
  assert.match(CLIENT.withImports, /from ["']@\/lib\/onlineCourseHref["']/);
  assert.equal(
    countOf(CLIENT.code, /onlineCourseHref\(/g), 1,
    'called once, in the online card',
  );
  assert.equal(
    /website_urls\s*(\[0\]|\)\s*&&)/.test(CLIENT.code), false,
    'and the fallback rule is not re-implemented here',
  );
});

test('the promotion tag row lives in the promotion card and nowhere else', () => {
  const promo = functionSlice(CLIENT.code, 'PromotionResultCard');
  assert.match(promo, /backgroundColor: tag\.color/, 'editor-set colours, used verbatim');
  assert.match(promo, /bg-gray-100 text-gray-600/, 'and the colourless fallback');
  for (const name of CARDS.filter((n) => n !== 'PromotionResultCard')) {
    assert.equal(
      functionSlice(CLIENT.code, name).includes('tag.color'), false,
      `${name} must not grow a tag row`,
    );
  }
});

// ── ดูทั้งหมด: one home, one label, unchanged destination ────────────────────

test('the ดูทั้งหมด control is declared once, inside SectionHeader', () => {
  /**
   * fs rather than render, because a SECOND copy renders identically to a moved
   * one. The render tier can see that the header has a link and the area below
   * the grid does not; it cannot see that there is only one place in the file
   * where such a link can be written.
   *
   * Comments are stripped by readSource, so this file's own prose about
   * `ดูทั้งหมด` — and the SECTIONS docstring that names it — cannot satisfy the
   * count.
   */
  assert.equal(
    countOf(CLIENT.code, /^const SEE_ALL_LABEL =/gm), 1,
    'the label is a constant, so the words and the accessible name cannot drift',
  );
  assert.equal(
    countOf(CLIENT.code, /ดูทั้งหมด/g), 1,
    'and the string itself appears exactly once in the whole component',
  );
  const header = functionSlice(CLIENT.code, 'SectionHeader');
  assert.match(header, /\{SEE_ALL_LABEL\}/, 'the visible words come from the constant');
  assert.match(
    header, /aria-label=\{`\$\{SEE_ALL_LABEL\}: \$\{title\}`\}/,
    'and so does the accessible name, which must also name the section',
  );
});

test('the label is ดูทั้งหมด and must NOT be shortened to ทั้งหมด', () => {
  /**
   * A standing decision, pinned because it is exactly the edit a later tidy-up
   * makes: `ทั้งหมด` is four characters shorter and reads fine in isolation.
   *
   * It is already taken. The tab row a few lines above the header has a tab
   * named `ทั้งหมด (N)` meaning "all TYPES"; this control means "all results in
   * THIS section". Same word, two scopes, a few centimetres apart — and the two
   * do different things, so the collision is not cosmetic.
   *
   * Compared with `assert.equal`, because `ทั้งหมด` is a SUBSTRING of `ดูทั้งหมด`
   * — a containment check in either direction passes on both values and could
   * not tell the shortened label from the correct one.
   */
  const label = CLIENT.code.match(/^const SEE_ALL_LABEL = '([^']*)';$/m)?.[1];
  assert.equal(label, 'ดูทั้งหมด', 'the see-all label');
  assert.notEqual(label, 'ทั้งหมด', 'which is not the tab row’s word for a different scope');
  // The tab label really is the shorter string, so the collision being avoided
  // is a live one rather than a remembered one.
  const TABS = readSource('src/lib/search/searchTabs.js');
  assert.match(TABS.code, /\{ key: ALL_TAB, label: 'ทั้งหมด' \}/, 'the ทั้งหมด tab exists');
});

test('CONTROL: the label probes DO separate the two Thai strings', () => {
  // The substring trap for this round, demonstrated rather than trusted.
  assert.ok('ดูทั้งหมด'.includes('ทั้งหมด'), 'the tab word sits inside the link word…');
  assert.equal(
    /^const SEE_ALL_LABEL = 'ดูทั้งหมด';$/m.test("const SEE_ALL_LABEL = 'ทั้งหมด';"), false,
    '…and the anchored declaration probe rejects the short one',
  );
  assert.ok(
    /^const SEE_ALL_LABEL = 'ดูทั้งหมด';$/m.test("const SEE_ALL_LABEL = 'ดูทั้งหมด';"),
    'while accepting the shipped one',
  );
});

test('the destination is unchanged — the section’s own tab, from the caller', () => {
  /**
   * THE claim the render tier structurally cannot make: there is no href and no
   * click in a static render, so "it still goes where it went" has to be read
   * off the wiring. The condition is the same one that used to gate the button
   * below the grid; only the place it renders moved.
   */
  const results = functionSlice(CLIENT.code, 'SearchResults');
  assert.match(
    results,
    /onSeeAll=\{\s*isAll && count > visible\.length\s*\?\s*\(\) => onTabChange\(section\.key\)\s*:\s*null,?\s*\}/,
    'the header must be handed this section’s own tab, under the original condition',
  );
  // …and the old placement is gone from the caller entirely.
  assert.equal(
    /className="mt-4 text-sm font-semibold/.test(CLIENT.code), false,
    'the below-the-grid button’s class string must not survive',
  );
  assert.equal(
    countOf(CLIENT.code, /onTabChange\(section\.key\)/g), 1,
    'one call site, not one per placement',
  );
});

test('CONTROL: the ดูทั้งหมด probes DO fire on the shape this replaced', () => {
  /**
   * Two of the assertions above are counts and one is an absence, all three of
   * which a matcher that sees nothing satisfies. Run them against the code as it
   * was written before the move.
   */
  const before = [
    '{isAll && count > visible.length && (',
    '  <button type="button" onClick={() => onTabChange(section.key)}',
    '    className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline">',
    '    ดูทั้งหมด ({count}) →',
    '  </button>',
    ')}',
  ].join('\n');
  assert.equal(countOf(before, /ดูทั้งหมด/g), 1, 'the label probe sees the old label');
  assert.ok(/className="mt-4 text-sm font-semibold/.test(before), 'and the old class string');
  assert.equal(
    countOf(before, /^const SEE_ALL_LABEL =/gm), 0,
    'and the old code had no shared label constant',
  );
  // …and the slices being scanned are real, not empty.
  assert.ok(functionSlice(CLIENT.code, 'SectionHeader').length > 300, 'SectionHeader was read');
  assert.ok(functionSlice(CLIENT.code, 'SearchResults').length > 1000, 'SearchResults was read');
});

test('the input is type="text" with an explicit searchbox role', () => {
  assert.equal(
    /type="search"/.test(CLIENT.code), false,
    'type="search" re-enables Chrome’s own clear button — a second ✕',
  );
  assert.match(CLIENT.code, /type="text"\s*\n\s*role="searchbox"/, 'role restored alongside the type');
  assert.equal(
    countOf(CLIENT.code, /aria-label="ล้างคำค้นหา"/g), 1,
    'exactly one clear control is declared',
  );
});

test('CONTROL: the sources were read and scrubbed', () => {
  assert.ok(CLIENT.code.length > 5000, 'the component was actually read');
  assert.match(CLIENT.code, /export function SearchResults/);
  assert.equal(
    CLIENT.code.includes('branching on'), false,
    'comments must be stripped — this file’s own prose says the phrase',
  );
});
