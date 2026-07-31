import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesPageClient } from '@/app/(public)/articles/_components/ArticlesPageClient';
import { readSourceForScanning } from '../sourceScan.mjs';

/**
 * The public /articles card: no type badge, skills instead of tags.
 *
 * ── WHAT CHANGED AND WHAT DELIBERATELY DID NOT ──────────────────────────────
 * The `บทความ / บทความวิดีโอ` overlay is gone — on a page where nearly every
 * card is a plain article it read as "this is a thing on the articles page".
 * The chip row now shows the article's SKILLS (chosen references to the upstream
 * taxonomy the rest of the site navigates by) instead of its TAGS (free text an
 * author types).
 *
 * The `tags` FIELD, the `?tag=` filter, the toolbar's tag chip and the search
 * box are all untouched, so every existing tag link still works. Two tests below
 * pin that, because "replace tags with skills" is exactly the instruction
 * someone would carry out by deleting the filter as well.
 *
 * ── AN UNRESOLVED ID IS DROPPED, AND THAT IS THE ASSERTION THAT MATTERS ─────
 * Articles store `skill_id` strings; the names come from a separate service.
 * That service can be down (page.jsx catches to `{items: []}`) and a skill can
 * be retired upstream while its id survives in old articles forever. Printing
 * the raw id would put `SK-999` on a public card. So the card drops what it
 * cannot resolve — which means the failure mode is SILENCE, which in turn means
 * the "it renders nothing" cases have to be tested from both sides or the whole
 * feature could be inert and look correct.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SKILL_NAMES = {
  'SK-001': 'Power BI',
  'SK-002': 'Excel',
  'SK-003': 'Python',
  'SK-004': 'Tableau',
};

/**
 * Names deliberately unlike the skill names, and unlike any Thai word this file
 * asserts the ABSENCE of. The overlay and the body row use two different maps
 * over two different fields, and a shared string would let an assertion about
 * one be satisfied by the other.
 */
const PROGRAM_NAMES = {
  'PG-001': 'Data & AI',
  'PG-002': 'Microsoft 365',
  'PG-003': 'Cloud',
};

function article(over = {}) {
  return {
    _id: 'aaaaaaaaaaaaaaaaaaaaaa01',
    slug: 'a-post',
    title: 'บทความทดสอบ',
    excerpt: 'สรุปสั้น ๆ',
    coverUrl: '',
    tags: ['tag-alpha', 'tag-beta'],
    programs: ['PG-001'],
    skills: ['SK-001', 'SK-002'],
    articleType: 'article',
    publishedAt: '2026-07-30T11:00:00.000Z',
    isPinnedOnArticlePage: false,
    showPinBadge: true,
    ...over,
  };
}

function render(articles, skillNames = SKILL_NAMES, programNames = PROGRAM_NAMES) {
  return renderToStaticMarkup(
    createElement(ArticlesPageClient, {
      articles,
      programs: [],
      programNames,
      skillNames,
      page: 1,
      totalPages: 1,
      total: articles.length,
      initialFilters: { q: '', tag: '', program: '', skill: '' },
    })
  );
}

/**
 * The single card. Anchored on <article>, so nothing in the TOOLBAR above it can
 * satisfy an assertion about the card.
 *
 * THE SCOPING PROBLEM THIS WAS BUILT FOR HAS SINCE BEEN REMOVED, and the note is
 * kept because the extractor outlived it. The toolbar used to carry a ประเภท
 * <select> offering บทความ and บทความวิดีโอ, so `assert(!/บทความวิดีโอ/)` against
 * the whole document FAILED on a correct page while `assert(/บทความวิดีโอ/)`
 * PASSED on a page with the badge still stamped on every card — both true at
 * once, so only a slice could tell them apart. That dropdown is now the skill
 * filter and the phrase is gone from the document entirely (S5-e2).
 *
 * The slice stays because the toolbar still holds article-facing text of its own
 * — skill names, `ทุก Skill`, the search placeholder, the empty state — and a
 * document-wide matcher for "what this CARD says" is still the wrong
 * instrument. S5-e3 is the control that keeps that claim honest rather than
 * assumed.
 */
function card(markup) {
  const start = markup.indexOf('<article');
  assert.notEqual(start, -1, 'no <article> in the render — the card did not render');
  const end = markup.indexOf('</article>', start);
  assert.notEqual(end, -1, 'unterminated <article>');
  const body = markup.slice(start, end);
  assert.ok(body.length > 200, `the card sliced to ${body.length} chars — too small to be real`);
  return body;
}

/**
 * The TOP-LEFT OVERLAY region — the slot the type badge vacated — or `null` when
 * the card does not render one at all.
 *
 * `null` IS A REAL ANSWER HERE, not a failure, because "renders nothing" is the
 * specified behaviour for an article with no resolvable program: no chip, no
 * placeholder, and no empty wrapper floating on the artwork. A test that only
 * asked "is the name absent" would pass against an empty `<span>`, so the
 * absence of the ELEMENT is what gets asserted and this has to be able to
 * report it.
 *
 * Depth-matched on `<span>` rather than sliced to the end of the cover link:
 * the pin badge is a sibling in the same subtree, so a slice-to-the-end would
 * sweep it in and let a pin satisfy an assertion about programs. An unbalanced
 * subtree FAILS LOUDLY instead of returning a truncated string.
 */
function overlay(markup) {
  const c = card(markup);
  const at = c.indexOf('class="absolute left-3 top-3');
  if (at === -1) return null;

  const start = c.lastIndexOf('<span', at);
  assert.notEqual(start, -1, 'the overlay class is not on a <span> — re-point this extractor');

  let depth = 0;
  const re = /<span\b|<\/span>/g;
  re.lastIndex = start;
  for (let m = re.exec(c); m; m = re.exec(c)) {
    depth += m[0] === '</span>' ? -1 : 1;
    if (depth === 0) return c.slice(start, m.index + m[0].length);
  }
  assert.fail('unterminated overlay <span> — re-point this extractor, do not weaken the tests');
}

/** How many chips the overlay is showing. 0 when there is no overlay at all. */
const chipCount = (markup) =>
  (overlay(markup)?.match(/<span class="rounded-full bg-9e-action /g) ?? []).length;

// ── skills on the card ───────────────────────────────────────────────────────

test('S5-a — the article\'s skills render as chips, resolved through the map', () => {
  const c = card(render([article()]));
  assert.match(c, />Power BI</, 'the first skill, by NAME');
  assert.match(c, />Excel</, 'and the second');
});

test('S5-b — an id with no matching name is DROPPED, never printed raw', () => {
  // The case that exists in production the moment a skill is retired upstream:
  // the id stays on the article forever.
  const c = card(render([article({ skills: ['SK-001', 'SK-999'] })]));
  assert.match(c, />Power BI</, 'the resolvable one still renders');
  assert.equal(
    /SK-999/.test(c), false,
    'the unresolved id leaked onto a public card. An opaque code is worse than ' +
    'nothing — it looks like a bug to a reader and like data to a crawler.',
  );
  assert.equal(/SK-001/.test(c), false, 'and the resolved one shows its NAME, not its id');
});

test('S5-c — an article with no resolvable skills renders NO chip row', () => {
  // Both halves of "no chips": no skills at all, and skills that all fail to
  // resolve (the whole-service-down case, since page.jsx catches to an empty
  // map). An empty <div> would leave a strip of padding under the excerpt.
  const none = card(render([article({ skills: [] })]));
  const unresolvable = card(render([article({ skills: ['SK-777', 'SK-888'] })]));
  const blank = card(render([article()], {}));

  for (const [label, c] of [['no skills', none], ['unresolvable', unresolvable], ['empty map', blank]]) {
    assert.equal(
      /rounded-full bg-9e-ice px-2 py-0\.5 text-\[11px\] text-9e-action/.test(c), false,
      `${label}: a chip rendered anyway`,
    );
    assert.equal(/SK-\d/.test(c), false, `${label}: an id leaked`);
  }

  // …and the same matcher DOES fire on the card that has skills, or the three
  // assertions above are checking a class string that never appears.
  assert.match(
    card(render([article()])), /rounded-full bg-9e-ice px-2 py-0\.5 text-\[11px\] text-9e-action/,
    'the chip matcher must be live',
  );
});

test('S5-d — at most THREE chips, however many skills the article has', () => {
  const c = card(render([article({ skills: ['SK-001', 'SK-002', 'SK-003', 'SK-004'] })]));
  for (const name of ['Power BI', 'Excel', 'Python']) {
    assert.match(c, new RegExp(`>${name}<`), `${name} is within the cap`);
  }
  assert.equal(/>Tableau</.test(c), false, 'the fourth is dropped — the cap is unchanged at 3');
});

// ── the top-left overlay: PROGRAMS ───────────────────────────────────────────
//
// The slot the type badge vacated. Every assertion is made against the extracted
// overlay rather than the card, for the same reason the card is extracted from
// the document: the toolbar's program <select> and the body's skill chips both
// legitimately contain program-shaped and chip-shaped markup, so a document-wide
// or even a card-wide matcher cannot tell "the overlay shows this" from
// "something on the page does".

test('S5-i — one program renders its NAME in the top-left overlay', () => {
  const o = overlay(render([article({ programs: ['PG-002'] })]));
  assert.ok(o, 'the overlay must exist for an article with a resolvable program');
  assert.match(o, />Microsoft 365</, 'resolved through the map, as element text');
  assert.equal(/PG-002/.test(o), false, 'and by NAME, not by id');

  // It really is the slot the type badge had, with the badge's own treatment —
  // otherwise "moved into the overlay" is just "rendered somewhere".
  assert.match(o, /class="absolute left-3 top-3/, 'top-left, over the cover');
  assert.match(o, /rounded-full bg-9e-action px-2 py-0\.5 text-\[11px\] font-medium text-white/,
    'reusing the vacated badge\'s visual treatment');
});

test('S5-j — three programs render exactly TWO chips, and no "+N" counter', () => {
  // This slot sits on the artwork, so the cap is tighter than the body row's 3
  // and there is deliberately no overflow counter: a `+1` floating on a cover
  // image reads as part of the picture.
  const markup = render([article({ programs: ['PG-001', 'PG-002', 'PG-003'] })]);
  const o = overlay(markup);
  assert.equal(chipCount(markup), 2, 'exactly two chips');
  // `&amp;`, not `&`: the fixture name carries an ampersand on purpose and React
  // escapes it, which is the proof that the name is rendered as TEXT rather than
  // interpolated as markup. Written escaped rather than dodged with a
  // punctuation-free fixture — upstream program names really do contain "&".
  assert.match(o, />Data &amp; AI</, 'the first');
  assert.match(o, />Microsoft 365</, 'the second');
  assert.equal(/Cloud/.test(o), false, 'the third is dropped');
  assert.equal(/\+1/.test(o), false, 'and nothing announces that it was dropped');
});

test('S5-j2 — CONTROL: the counter varies, so the cap is a cap and not a constant', () => {
  // `chipCount === 2` is satisfied by a component that always renders two. One
  // program must give one chip, and none must give none.
  assert.equal(chipCount(render([article({ programs: ['PG-001'] })])), 1, 'one program, one chip');
  assert.equal(chipCount(render([article({ programs: [] })])), 0, 'no programs, no chips');
  assert.equal(
    chipCount(render([article({ programs: ['PG-001', 'PG-002'] })])), 2,
    'and the boundary itself — two is inside the cap, not clipped to one',
  );
});

test('S5-k — an unresolved program_id is absent from the markup ENTIRELY', () => {
  // The case that exists the moment a program is retired upstream, or whenever
  // listPrograms fails and page.jsx catches to an empty map: the id stays on the
  // article forever. An opaque code on a public card is worse than nothing.
  const markup = render([article({ programs: ['PG-001', 'PG-404'] })]);
  assert.match(overlay(markup), />Data &amp; AI</, 'the resolvable one still renders');
  assert.equal(
    /PG-404/.test(markup), false,
    'the unresolved id leaked. Asserted against the WHOLE document, not the overlay: ' +
    'an id printed anywhere — a title attribute, a key echoed into markup — is the ' +
    'defect, and scoping this one would let it hide next door.',
  );
  assert.equal(chipCount(markup), 1, 'and it is dropped rather than rendered blank');
});

test('S5-l — no resolvable programs means NO OVERLAY ELEMENT AT ALL', () => {
  // Three ways to have nothing to show, and all three must produce the same
  // clean cover: an empty wrapper is a transparent box sitting on the artwork,
  // and it is what a naive `{tags.map(...)}` with no length guard produces.
  const none = render([article({ programs: [] })]);
  const missing = render([article({ programs: undefined })]);
  const unresolvable = render([article({ programs: ['PG-404', 'PG-405'] })]);
  const emptyMap = render([article()], SKILL_NAMES, {});

  for (const [label, markup] of [
    ['programs: []', none],
    ['programs absent', missing],
    ['all unresolvable', unresolvable],
    ['empty map', emptyMap],
  ]) {
    assert.equal(overlay(markup), null, `${label}: an overlay element rendered anyway`);
    assert.equal(
      /absolute left-3 top-3/.test(card(markup)), false,
      `${label}: the overlay's position class is in the card`,
    );
  }

  // …and the extractor DOES find one on a card that has a program, or every
  // assertion above is a null check against an extractor that never returns
  // anything — the exact shape that makes a "renders nothing" test vacuous.
  assert.ok(overlay(render([article()])), 'the overlay extractor must be live');
});

test('S5-l2 — the overlay is NON-INTERACTIVE, and the pin badge is not swept into it', () => {
  // The chips sit inside the cover <Link>. An anchor here would nest anchors —
  // invalid HTML that browsers resolve by splitting the outer link, breaking the
  // card's own click target. The program filter already exists in the toolbar.
  const o = overlay(render([article({ programs: ['PG-001', 'PG-002'] })]));
  assert.equal(/<a\b/.test(o), false, 'no anchor inside the overlay');
  assert.equal(/href=/.test(o), false, 'and nothing carrying a link');
  assert.equal(/<button/.test(o), false, 'nor a button');

  // The pin badge is a SIBLING in the same subtree. If the extractor sliced to
  // the end of the cover link instead of depth-matching, it would sweep the pin
  // in and a pin could satisfy an assertion about programs.
  const pinned = render([article({ isPinnedOnArticlePage: true, showPinBadge: true })]);
  assert.match(card(pinned), /M12 17v5/, 'the pin is in the card…');
  assert.equal(/M12 17v5/.test(overlay(pinned)), false, '…and NOT in the overlay slice');
});

// ── the type badge is gone, the pin badge is not ─────────────────────────────

test('S5-e — the type badge overlay is gone from the card', () => {
  const video = card(render([article({ articleType: 'video' })]));
  const plain = card(render([article({ articleType: 'article' })]));
  assert.equal(/บทความวิดีโอ/.test(video), false, 'no video label on the card');
  assert.equal(
    /บทความ</.test(plain), false,
    'nor the plain-article label. On a page where nearly every card is one, it read ' +
    'as "this is a thing on the articles page".',
  );
});

test('S5-e2 — the ประเภท filter is gone too, so the type has no surface at all', () => {
  // THIS ASSERTION USED TO SAY THE OPPOSITE, and re-pointing it rather than
  // deleting it is the point. It was the control for S5-e: both type labels
  // legitimately appeared in the toolbar's ประเภท <select>, so a document-wide
  // `assert(!/บทความวิดีโอ/)` would have failed on a CORRECT page, which is why
  // the card is sliced first.
  //
  // That dropdown has now been replaced by the skill filter, so the phrase is
  // absent from the whole document and the claim gets to be the stronger one.
  // The card slice is still load-bearing for OTHER reasons — see the control
  // below — so the extractor stays.
  const markup = render([article()]);
  assert.equal(
    /บทความวิดีโอ/.test(markup), false,
    'the video label must not be anywhere on the page: the card badge went first, ' +
    'the filter followed it',
  );
  assert.equal(/value="video"/.test(markup), false, 'nor the option value behind it');
  assert.equal(/ประเภททั้งหมด/.test(markup), false, 'nor the filter\'s own default label');
});

test('S5-e3 — CONTROL: the card slice is still doing real work', () => {
  // S5-e is a pair of negatives against a SLICE. If the slice were vacuous, or
  // if nothing else on the page could satisfy those matchers, the scoping would
  // be theatre. The toolbar now carries the skill filter, whose option labels
  // are article-facing text that appears OUTSIDE the card — so a document-wide
  // matcher for "what this card says" is still the wrong instrument.
  const markup = render([article()]);
  const c = card(markup);

  assert.ok(c.length > 200 && c.length < markup.length, 'the slice is real and strictly smaller');
  assert.match(markup, /ทุก Skill/, 'the toolbar has text of its own…');
  assert.equal(/ทุก Skill/.test(c), false, '…which the card does not carry');
  assert.match(
    markup, /ไม่พบบทความที่ตรงกับเงื่อนไข|placeholder="ค้นหาบทความ\.\.\."/,
    'and the page still holds บทความ-containing prose outside the card, which is what ' +
    'a bare /บทความ/ matcher would trip over',
  );
});

test('S5-f — the PIN BADGE survives at the top right', () => {
  // Different concern, different corner, and the one overlay that carries
  // information the card cannot otherwise convey. lucide's Pin emits a
  // "12 17v5" stem; the component name is gone by render time.
  const pinned = card(render([article({ isPinnedOnArticlePage: true, showPinBadge: true })]));
  assert.match(pinned, /M12 17v5/, 'the pin glyph is drawn');
  assert.match(pinned, /right-3 top-3/, 'in the corner the type badge did NOT occupy');

  const unpinned = card(render([article()]));
  assert.equal(/M12 17v5/.test(unpinned), false, 'and an unpinned article gets none');
});

// ── what must NOT have moved ─────────────────────────────────────────────────

test('S5-g — tags, the ?tag= filter and search are untouched', () => {
  // "Replace tags with skills" is an instruction someone carries out by deleting
  // the filter too. The FIELD and every route into it stay; only the card's
  // display changed, so existing #tag links keep working.
  const withTag = render([article()]);
  assert.equal(
    /#tag-alpha/.test(card(withTag)), false,
    'the card no longer prints tags — that is the change',
  );

  const filtered = renderToStaticMarkup(
    createElement(ArticlesPageClient, {
      articles: [article()],
      programs: [],
      skillNames: SKILL_NAMES,
      page: 1,
      totalPages: 1,
      total: 1,
      initialFilters: { q: '', tag: 'tag-alpha', program: '', skill: '' },
    })
  );
  assert.match(filtered, /กรองตาม tag:/, 'the active-tag chip still renders');
  assert.match(filtered, /#tag-alpha/, 'and names the tag');
  assert.match(filtered, /aria-label="ล้าง tag filter"/, 'with its clear control');
  assert.match(withTag, /placeholder="ค้นหาบทความ\.\.\."/, 'and the search box is untouched');
});

test('S5-h — the page fetches skills the same way it fetches programs, and projects nothing new', () => {
  // A seam only the source can see: the render tier is handed `skillNames` as a
  // prop, so it stays green if page.jsx never builds one. Also pins the two
  // decisions that make this cheap and safe — the upstream call CANNOT fail the
  // page, and PUBLIC_LIST_FIELDS is still not wired in (it lacks the two fields
  // shouldShowPinBadge needs, and wiring it would silently delete every pin
  // badge on this page — test/pure/articleListFields holds that gap too).
  const page = readSourceForScanning(
    path.join(ROOT, 'src/app/(public)/articles/page.jsx'),
    { stripImports: false },
  );
  assert.match(page, /import \{ listSkills \} from '@\/lib\/api\/skills'/, 'imported');
  assert.match(page, /listSkills\(\)\.catch\(\(\) => \(\{ items: \[\] \}\)\)/, 'and it cannot fail the page');
  assert.match(page, /skillNames=\{skillNames\}/, 'and the map reaches the client');
  assert.match(
    page, /\[String\(s\.skill_id\), String\(s\.skill_name\)\]/,
    'keyed on skill_id — what an article actually stores. Keyed on _id it would ' +
    'resolve nothing and every chip would vanish silently.',
  );
  assert.equal(
    /PUBLIC_LIST_FIELDS/.test(page), false,
    'the public list must keep reading whole documents — the short projection is ' +
    'missing isPinnedOnArticlePage and showPinBadge',
  );
});

test('S5-m — programNames is keyed on program_id, and derived from the EXISTING fetch', () => {
  // THE S5-h LESSON, APPLIED A SECOND TIME. The render tier receives this map as
  // a prop, so keying it on `_id` reddens NOTHING at that tier: every render
  // fixture would keep passing its own correct map while production resolved
  // zero programs and — because an unresolved id is dropped rather than printed
  // — showed no error, no placeholder, and no symptom beyond the tags quietly
  // never appearing. This assertion is the only thing carrying that claim.
  const page = readSourceForScanning(
    path.join(ROOT, 'src/app/(public)/articles/page.jsx'),
    { stripImports: false },
  );
  assert.match(
    page, /\[String\(p\.program_id\), String\(p\.program_name\)\]/,
    'keyed on program_id — src/models/Article.js declares `programs: [String]` and ' +
    'comments it "program_id values", and ArticleForm\'s ProgramPicker stores ' +
    '`p.program_id`. Keyed on _id this map resolves nothing, silently.',
  );
  assert.match(page, /programNames=\{programNames\}/, 'and it reaches the client');

  // NO SECOND FETCH. The filter <select> and the card need the same two fields
  // off the same call; two calls are two answers on a slow upstream, i.e. a card
  // tagged with a program the dropdown does not offer, from one page render.
  assert.equal(
    (page.match(/listPrograms\(/g) ?? []).length, 1,
    'listPrograms is called exactly once — the map is derived from that result',
  );
  assert.match(
    page, /Object\.fromEntries\(\s*programs\b/,
    'and derived from the already-mapped `programs` array specifically, so there is ' +
    'one source rather than two readings of one response',
  );
});

test('S5-m2 — CONTROL: the program seam matchers can fail, and the field is real', () => {
  // Same discipline as S5-h2: a source assertion matching nothing is
  // indistinguishable from a pass, and the count assertion above is satisfied by
  // a regex that never fires (0 === 0 is not the claim, but a broken matcher
  // would report 0 and only the `=== 1` saves it — so show it counts).
  const page = readSourceForScanning(
    path.join(ROOT, 'src/app/(public)/articles/page.jsx'),
    { stripImports: false },
  );
  assert.equal((page.match(/listSkills\(/g) ?? []).length, 1, 'the counter can count');
  assert.equal((page.match(/listCourses\(/g) ?? []).length, 0, 'and can count zero');
  assert.equal(
    /\[String\(p\._id\), String\(p\.program_name\)\]/.test(page), false,
    'the _id spelling must be absent — this is the shape the control introduces',
  );

  // The field the map is keyed against is declared on the real model, so an
  // article can genuinely carry these ids.
  const model = readFileSync(path.join(ROOT, 'src/models/Article.js'), 'utf8');
  assert.match(model, /programs:\s+\[\{ type: String/, 'the model stores programs as strings');
  assert.match(model, /program_id values/, 'and says which identifier they are');

  const form = readFileSync(
    path.join(ROOT, 'src/app/admin/articles/_components/ArticleForm.jsx'), 'utf8',
  );
  assert.match(
    form, /value\.includes\(p\.program_id\)/,
    'and the picker that writes them checks program_id — the other end of the same claim',
  );
});

test('S5-h2 — CONTROL: the source guard reads real source and its matchers can fail', () => {
  // A source assertion that matches nothing looks exactly like a pass for the
  // negative half above.
  const page = readSourceForScanning(
    path.join(ROOT, 'src/app/(public)/articles/page.jsx'),
    { stripImports: false },
  );
  assert.ok(page.length > 800, `page.jsx scanned to ${page.length} chars`);
  assert.match(page, /listPrograms\(\)\.catch/, 'the pattern the skills call was modelled on is there');
  assert.equal(/listCourses\(\)/.test(page), false, 'and the same matcher says no to a call that is absent');

  // The article field the map is keyed against is declared on the real model,
  // so an article can genuinely carry these ids.
  const model = readFileSync(path.join(ROOT, 'src/models/Article.js'), 'utf8');
  assert.match(model, /skills:\s+\[\{ type: String/, 'the model stores skills as strings');
});
