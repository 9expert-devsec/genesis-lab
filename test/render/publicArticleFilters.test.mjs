import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ArticlesPageClient } from '@/app/(public)/articles/_components/ArticlesPageClient';
import { readSourceForScanning } from '../sourceScan.mjs';

/**
 * The /articles toolbar: the ประเภท filter is now a SKILL filter.
 *
 * ── WHY THE TYPE FILTER WENT ────────────────────────────────────────────────
 * The card's type badge was removed a round earlier, so nothing on the page
 * showed the article/video distinction any more — and a control that SPLITS a
 * list by something the reader cannot see sorts by an invisible property. Skill
 * is what the rest of the site navigates by and is already on every card as a
 * chip, so the filter and the card now agree about what an article is filed
 * under.
 *
 * ── THE OPTIONS COME FROM THE ARTICLES, NOT FROM UPSTREAM ───────────────────
 * This page already fetches every skill from upstream to resolve the chips, so
 * building the dropdown from that list is the shorter code and the wrong list:
 * upstream holds skills nothing has been written about, and each becomes an
 * option whose only possible outcome is `ไม่พบบทความที่ตรงกับเงื่อนไข`.
 *
 * THAT CLAIM CANNOT BE MADE AT THIS TIER. The component receives the options as
 * a prop, already narrowed and already resolved, so every render fixture here
 * would keep passing whatever it was handed while production offered the full
 * upstream list. It is carried by a SOURCE assertion instead — the same seam,
 * and the same reasoning, as the `program_id` keying guard in
 * publicArticleCard.test.mjs.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (p) => path.join(ROOT, p);

const PAGE_REL = 'src/app/(public)/articles/page.jsx';
const CLIENT_REL = 'src/app/(public)/articles/_components/ArticlesPageClient.jsx';
const ACTIONS_REL = 'src/lib/actions/articles.js';
const MODEL_REL = 'src/models/Article.js';

const page = readSourceForScanning(rel(PAGE_REL), { stripImports: false });
const client = readSourceForScanning(rel(CLIENT_REL), { stripImports: false });
const actions = readSourceForScanning(rel(ACTIONS_REL), { stripImports: false });
const model = readSourceForScanning(rel(MODEL_REL), { stripImports: false });
// THE ONE PLACE THIS FILE READS RAW SOURCE, AND IT IS ABOUT A COMMENT.
// `readSourceForScanning` strips comments — which is the point everywhere else,
// so a rule quoted in prose cannot satisfy an assertion about code. But T-h's
// second half asserts that the index CARRIES ITS MEASUREMENT, and a measurement
// is prose by definition, so the scrubbed text is empty of exactly the thing
// being checked. It went red against a model file that had the comment. Read raw
// here, deliberately and only here.
const modelRaw = readFileSync(rel(MODEL_REL), 'utf8');

/**
 * Options as page.jsx builds them: resolved, and sorted by NAME rather than by
 * the upstream code the reader never sees.
 */
const SKILL_OPTIONS = [
  { skill_id: 'DATA', skill_name: 'Data Analytics' },
  { skill_id: 'BUSINESS', skill_name: 'ธุรกิจ' },
  { skill_id: 'AI', skill_name: 'AI' },
];

const ARTICLE = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaa01',
  slug: 'a-post',
  title: 'บทความทดสอบ',
  excerpt: '',
  coverUrl: '',
  tags: [],
  programs: [],
  skills: ['DATA'],
  articleType: 'article',
  publishedAt: '2026-07-30T11:00:00.000Z',
  isPinnedOnArticlePage: false,
  showPinBadge: true,
};

function render({ skillOptions = SKILL_OPTIONS, skill = '' } = {}) {
  return renderToStaticMarkup(
    createElement(ArticlesPageClient, {
      articles: [ARTICLE],
      programs: [],
      programNames: {},
      skillNames: { DATA: 'Data Analytics' },
      skillOptions,
      page: 1,
      totalPages: 1,
      total: 1,
      initialFilters: { q: '', tag: '', program: '', skill },
    })
  );
}

/**
 * The skill <select>, found by its default option rather than by index.
 *
 * There are two <select>s in the toolbar and they are siblings with identical
 * classes, so an index would silently start measuring the program filter the
 * day someone reorders them. THROWS rather than returning '': a missing slice
 * satisfies every "does not contain" assertion below for free.
 */
function skillSelect(markup) {
  // ANCHORED ON THE LABEL, NOT ON THE FULL TAG. React injects `selected=""` into
  // whichever option matches the select's value, so the default option is
  // `<option value="">ทุก Skill</option>` with a filter active and
  // `<option value="" selected="">ทุก Skill</option>` without one. A literal
  // full-tag anchor therefore finds the element in exactly one of the two states
  // — it went red here against a perfectly correct render. Same family as the
  // `disabled:opacity-30` rule: do not write a conditional attribute into a
  // matcher that is supposed to locate an element.
  const at = markup.indexOf('>ทุก Skill</option>');
  assert.notEqual(
    at, -1,
    'no ทุก Skill option in the render — the skill filter did not render, or its ' +
    'default label changed. Re-point this extractor; do not weaken the assertions.',
  );
  const start = markup.lastIndexOf('<select', at);
  assert.notEqual(start, -1, 'the option is not inside a <select>');
  const end = markup.indexOf('</select>', at);
  assert.notEqual(end, -1, 'unterminated <select>');
  return markup.slice(start, end + '</select>'.length);
}

const optionValues = (sel) => [...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
const optionLabels = (sel) => [...sel.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);

// ── the control itself ───────────────────────────────────────────────────────

test('T-a — the toolbar renders a SKILL select, and no ประเภท filter anywhere', () => {
  const markup = render();
  const sel = skillSelect(markup);

  // `[^>]*` covers React's conditional `selected=""` — see the note on the
  // extractor. Matching the exact tag pins one of the two states by accident.
  assert.match(sel, /<option value=""[^>]*>ทุก Skill<\/option>/, 'the default option mirrors ทุก Program');
  assert.equal(
    /บทความวิดีโอ/.test(markup), false,
    'the video option must be gone from the whole document — the type distinction has ' +
    'no surface left on this page at all',
  );
  assert.equal(/ประเภททั้งหมด/.test(markup), false, 'and so must the old default label');
  assert.equal(/value="video"/.test(markup), false, 'nor the value behind it');

  // The program filter is untouched and still sits beside it.
  assert.match(markup, /<option value=""[^>]*>ทุก Program<\/option>/, 'the program filter survives');
});

test('T-a2 — NO `all` SENTINEL: "no filter" is the empty string', () => {
  // The ประเภท filter used `'all'` for "no filter" and `pushWith` had to know to
  // delete it — a second spelling of empty, and a second thing to keep in step
  // with the page's searchParams read. `''` is what pushWith already drops.
  const sel = skillSelect(render());
  assert.equal(optionValues(sel)[0], '', 'the default option carries the empty string');
  assert.equal(
    /value="all"/.test(sel), false,
    'the `all` sentinel must not come back — page.jsx reads `?skill=` straight out of ' +
    'searchParams, so a sentinel would have to be translated in two places',
  );
  assert.equal(
    /skill=all/.test(render({ skill: '' })), false,
    'and an unset filter puts nothing in the URL',
  );
});

test('T-b — options are resolved NAMES, in the order the page sorted them', () => {
  const sel = skillSelect(render());
  assert.deepEqual(
    optionLabels(sel), ['ทุก Skill', 'Data Analytics', 'ธุรกิจ', 'AI'],
    'the labels are skill NAMES, and the component renders the prop order rather ' +
    'than re-sorting — page.jsx sorts by localeCompare("th") because the ids sort ' +
    'by an upstream code nobody sees',
  );
  assert.deepEqual(optionValues(sel), ['', 'DATA', 'BUSINESS', 'AI'], 'and the values are the ids');
});

test('T-c — an option with no resolved name never reaches the markup', () => {
  // THE COMPONENT'S HALF ONLY. page.jsx does the dropping (T-f pins that); what
  // this asserts is that the component renders exactly what it was handed and
  // invents nothing — no blank-labelled option, no fallback to the id. Verified
  // by control: making page.jsx offer `skillNames[id] ?? id` reddens T-f and NOT
  // this test, because the render tier never sees which list the page started
  // from. That split is the point, not a gap.
  const markup = render({
    skillOptions: [{ skill_id: 'DATA', skill_name: 'Data Analytics' }],
  });
  const sel = skillSelect(markup);
  assert.deepEqual(optionValues(sel), ['', 'DATA'], 'only the resolvable one is offered');
  assert.equal(
    /RPA|POWERPLATFORM|SK-999/.test(markup), false,
    'no unresolved id anywhere in the document',
  );
  assert.equal(
    /<option value="[^"]*"><\/option>/.test(sel), false,
    'and no empty-labelled option, which is what an unresolved name would render as',
  );
});

test('T-c2 — CONTROL: the option list is DERIVED from the prop, not a constant', () => {
  // T-b and T-c both pass for a component that hardcodes its options. Change
  // the prop and the markup must change with it — including down to nothing but
  // the default.
  const three = optionValues(skillSelect(render()));
  const one = optionValues(skillSelect(render({ skillOptions: [{ skill_id: 'X', skill_name: 'Ex' }] })));
  const none = optionValues(skillSelect(render({ skillOptions: [] })));

  assert.equal(three.length, 4);
  assert.deepEqual(one, ['', 'X'], 'a different prop gives different options');
  assert.deepEqual(none, [''], 'and an empty list still renders the default — never a bare select');
  assert.notDeepEqual(three, one);
});

test('T-d — the current skill round-trips from the URL into the control', () => {
  // `?skill=BUSINESS` must come back as the selected option, or the filter
  // forgets itself on every navigation and the list silently disagrees with the
  // dropdown above it.
  const sel = skillSelect(render({ skill: 'BUSINESS' }));
  assert.match(
    sel, /<option value="BUSINESS" selected="">/,
    'the option matching initialFilters.skill is the selected one',
  );
  assert.equal(
    /<option value="DATA" selected="">/.test(sel), false,
    'and only that one — otherwise `selected` is being rendered unconditionally',
  );
  assert.equal(
    /<option value="" selected="">/.test(skillSelect(render({ skill: 'BUSINESS' }))), false,
    'the default must not stay selected when a filter is active',
  );
  // …and with no filter, the default IS the selected one.
  assert.match(skillSelect(render({ skill: '' })), /<option value="" selected="">/);
});

test('T-e — selecting a skill goes through pushWith, which sets ?skill= and drops page', () => {
  // ASSERTED AT THE SOURCE, because renderToStaticMarkup cannot dispatch an
  // onChange — there is no DOM and no event loop in this tier, and
  // test/stub-next-navigation's useRouter().push is deliberately inert. What can
  // be pinned is the wiring: the control calls the SAME helper the program
  // filter uses, and that helper deletes empty values and resets the page.
  assert.match(
    client, /onChange=\{\(e\) => pushWith\(\{ skill: e\.target\.value \}\)\}/,
    'the select routes through pushWith, not through a second URL builder',
  );
  assert.match(client, /pushWith\(\{ program: e\.target\.value \}\)/, 'exactly as the program filter does');

  // pushWith's own contract, pinned here because the assertion above leans on it.
  assert.match(
    client, /if \(v === '' \|\| v == null \|\| v === 'all'\) next\.delete\(k\);/,
    'an empty value REMOVES the param rather than writing ?skill=',
  );
  assert.match(
    client, /if \(resetPage\) next\.delete\('page'\);/,
    'and a filter change drops `page` — landing on page 4 of a 1-page result is the ' +
    'classic filter-plus-pager bug',
  );
  assert.match(client, /\(updates, resetPage = true\)/, 'with resetting as the DEFAULT');
});

// ── the seam only the source can see ─────────────────────────────────────────

test('T-f — the options come from DISTINCT-OVER-ARTICLES, not from the upstream list', () => {
  // THE SEAM. The render tier receives `skillOptions` as a prop, so it stays
  // green no matter which list page.jsx built it from — while production would
  // offer skills that no article carries and every one of those options would
  // return "ไม่พบบทความที่ตรงกับเงื่อนไข". A control that can only disappoint is
  // worse than a shorter list.
  assert.match(page, /listUsedArticleSkillIds/, 'the page calls the distinct reader');
  assert.match(
    page, /const skillOptions = usedSkillIds\b/,
    'and the options are built from ITS result, not from skillsRes.items',
  );
  assert.equal(
    /skillOptions = \(skillsRes\.items/.test(page), false,
    'building from the upstream list is the defect this assertion exists for',
  );
  assert.match(
    page, /\.filter\(\(s\) => s\.skill_name\)/,
    'an id with no resolved name is DROPPED, the same rule the chips follow',
  );
  assert.match(
    page, /localeCompare\(b\.skill_name, 'th'\)/,
    'and sorted by the resolved NAME — the ids sort by an upstream code',
  );

  // The reader itself: scoped to what the page renders, and returning IDS so
  // there is one resolver rather than two.
  assert.match(
    actions, /Article\.distinct\('skills', \{ active: true \}\)/,
    'scoped to active articles — a skill carried only by inactive ones would be ' +
    'offered and return nothing, which is the same defect one step smaller',
  );
});

test('T-g — getArticles filters on `skills`, and countDocuments still sees it', () => {
  // No tier here reaches a database, so this is a source guard by necessity —
  // and it is the same shape as the `program` line one row above it, which is
  // the point: two fields with identical semantics should not acquire different
  // code.
  assert.match(actions, /\n  skill = '',/, 'the parameter is declared');
  assert.match(
    actions, /if \(skill\)\s+filter\.skills\s+= String\(skill\);/,
    'and applied to the filter, guarded so an empty value filters nothing',
  );
  assert.match(
    actions, /if \(program\)\s+filter\.programs\s+= String\(program\);/,
    'mirroring program exactly',
  );
  assert.match(
    actions, /Article\.countDocuments\(filter\)/,
    'countDocuments still runs on the SAME filter object, so `total` keeps describing ' +
    'the whole matching set and the pager does not overcount a filtered list',
  );
  assert.equal(
    /countDocuments\(\{\}\)|countDocuments\(\)/.test(actions), false,
    'and never on an unfiltered one',
  );
});

test('T-h — the filtered field is INDEXED, and the index landed first', () => {
  // The three-parties lesson from ARTICLE_ORDER_INDEX, one field along: a filter
  // and its index are two things that must agree with nothing in the toolchain
  // forcing them to. An equality filter on an unindexed array field COLLSCANs,
  // and the symptom is only ever "the page got slower".
  assert.match(
    model, /ArticleSchema\.index\(\{ skills: 1 \}\)/,
    'the multikey index exists on the model',
  );
  assert.match(model, /ArticleSchema\.index\(\{ programs: 1 \}\)/, 'beside its twin');

  // The measurement is written down, not asserted as prose — this pins that the
  // numbers are THERE, so a future reader can re-derive rather than trust.
  assert.match(
    modelRaw, /explain\('executionStats'\) on a SCRATCH COPY/,
    'the index carries its measurement, on a scratch copy rather than production',
  );
  assert.match(
    modelRaw, /ON THE MOST COMMON SKILL THE INDEX CHANGES NO PLAN/,
    'including the part that is NOT a win — an index that changes no plan on the ' +
    'fattest bucket is a fact worth writing down, not one to quietly omit',
  );
  assert.match(modelRaw, /IXSCAN\(skills_1\)/, 'with the winning plans named');
  assert.match(modelRaw, /COLLSCAN, 487 docs examined/, 'and the counts, so a reader can re-derive');
  assert.equal(
    /explain\('executionStats'\) on a SCRATCH COPY/.test(model), false,
    'CONTROL: the scrubbed source does NOT contain it — which is why this assertion ' +
    'reads the raw file, and why every OTHER assertion in this file reads the scrubbed one',
  );
});

test('T-i — CONTROL: the source matchers can fail, and the sources really loaded', () => {
  // Every negative above is satisfied by a matcher that never fires, and every
  // positive by a file that failed to load into an empty string.
  for (const [label, src] of [
    ['page.jsx', page], ['ArticlesPageClient', client], ['articles.js', actions], ['Article.js', model],
  ]) {
    assert.ok(src.length > 800, `${label} scanned to ${src.length} chars`);
  }
  assert.equal(/listUsedProgramIds/.test(page), false, 'a name that is NOT there reads as absent');
  assert.match(page, /listPrograms\(\)/, 'while one that is reads as present');
  assert.equal(
    /ArticleSchema\.index\(\{ nonsense: 1 \}\)/.test(model), false,
    'and the index matcher says no to an index that does not exist',
  );

  // Comments are stripped by readSourceForScanning, so none of the code
  // assertions above can be satisfied by prose describing them.
  assert.equal(
    /THE OPTIONS COME FROM THE ARTICLES, NOT FROM UPSTREAM/.test(page), false,
    'this file\'s own doc-block wording must not appear in the scanned source — if it ' +
    'does, comments are reaching the matchers',
  );
});
