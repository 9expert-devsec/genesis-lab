import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlogCard } from '@/app/_components/home/BlogSection';
import { buildProgramNames, buildSkillNames, resolveTaxonomyNames } from '@/lib/articleTaxonomy';
import { readSourceForScanning } from '../sourceScan.mjs';

// The landing article card presents its taxonomy the way /articles does.
//
// ── THE SAME RULES, ASSERTED SEPARATELY ─────────────────────────────────────
// Both cards render the SAME components now, so in principle one set of tests
// would cover both. In practice the failure this file exists for is the wiring:
// the landing card can render the shared chips perfectly and still show nothing,
// because getFeaturedArticlesForLanding did not project `programs`/`skills`, or
// because page.jsx never built the maps. Those are per-page facts and this is
// where they are pinned.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const PROGRAM_NAMES = buildProgramNames([
  { program_id: 'PG-A', program_name: 'Data Analytics' },
  { program_id: 'PG-B', program_name: 'Power Automate' },
  { program_id: 'PG-C', program_name: 'Power Apps' },
]);
const SKILL_NAMES = buildSkillNames([
  { skill_id: 'SK-1', skill_name: 'Power BI' },
  { skill_id: 'SK-2', skill_name: 'Excel' },
  { skill_id: 'SK-3', skill_name: 'SQL' },
]);

const blog = (over = {}) => ({
  id: 'a1',
  programs: ['PG-A', 'PG-B', 'PG-C'],
  skills: ['SK-1', 'SK-2', 'SK-3'],
  title: 'หัวข้อบทความ',
  excerpt: 'สรุปย่อ',
  thumbnail: '/x.png',
  slug: '/articles/a-slug',
  ...over,
});

const render = (over, maps = {}) =>
  renderToStaticMarkup(
    createElement(BlogCard, {
      blog: blog(over),
      programNames: PROGRAM_NAMES,
      skillNames: SKILL_NAMES,
      ...maps,
    }),
  );

test('the card shows the PROGRAM as its overlay, not the article type', () => {
  const html = render();
  assert.ok(html.includes('Data Analytics'), 'the resolved program name');
  // The type badge it replaces said บทความ on every plain article — a label that
  // read "this is a thing on the articles page".
  assert.ok(!html.includes('>บทความ<'), 'the type badge is gone');
  assert.ok(!html.includes('บทความวิดีโอ'), 'and so is its video variant');
});

test('the card shows SKILL names as chips, capped at exactly 2', () => {
  const html = render();
  assert.ok(html.includes('Power BI'), 'first skill');
  assert.ok(html.includes('Excel'), 'second skill');
  assert.ok(!html.includes('SQL'), 'the THIRD is dropped — this grid is 288px wide, not 384px');
  // Exactly two chips, not "at least two".
  assert.equal((html.match(/rounded-full bg-9e-ice/g) ?? []).length, 2);
  // And no +N counter — it went with the free-text tags.
  assert.ok(!/\+\d/.test(html), 'no overflow counter');
});

test('CONTROL: the cap is 2 here and would not be satisfied by 3', () => {
  // Guards the number itself. If the cap were raised to match /articles, SQL
  // would appear and this reddens.
  const html = render();
  const chips = [...html.matchAll(/rounded-full bg-9e-ice[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(chips, ['Power BI', 'Excel'], 'exactly the first two, in order');
});

test('an id that resolves to no name is DROPPED, never printed', () => {
  // Same rule as /articles. A retired skill's id survives in old articles
  // forever, and printing `SK-014` on a public card is worse than showing
  // nothing. Verified with the whole-map-empty case too, since both pages catch
  // an upstream failure to `{ items: [] }`.
  const unknown = render({ programs: ['PG-GONE'], skills: ['SK-GONE', 'SK-1'] });
  assert.ok(!unknown.includes('PG-GONE'), 'no raw program id');
  assert.ok(!unknown.includes('SK-GONE'), 'no raw skill id');
  assert.ok(unknown.includes('Power BI'), 'and the resolvable one still shows');

  const noMaps = render({}, { programNames: {}, skillNames: {} });
  assert.ok(!/SK-\d|PG-[A-Z]/.test(noMaps), 'an empty map leaks nothing');
});

test('a card with no resolvable program renders NO overlay wrapper', () => {
  // Not an empty element — a transparent box floating on the artwork. Same rule
  // the /articles card follows.
  const html = render({ programs: [] });
  assert.ok(!html.includes('absolute left-3 top-3'), 'no overlay wrapper at all');
  // …and the control: with a resolvable program the wrapper IS there, so the
  // assertion above is not passing because the class simply never appears.
  assert.ok(render().includes('absolute left-3 top-3'), 'the wrapper matcher is live');
});

test('a card with no resolvable skills renders no chip row', () => {
  const html = render({ skills: ['SK-GONE'] });
  assert.ok(!html.includes('rounded-full bg-9e-ice'), 'no empty strip of padding');
  assert.ok(render().includes('rounded-full bg-9e-ice'), 'and the matcher is live');
});

// ── The wiring only the source can see ──────────────────────────────────────

test('the landing FETCHES the ids, the names, and cannot be taken down by either', () => {
  // The card can be perfect and still show nothing if the data never arrives.
  const actions = src('src/lib/actions/articles.js');
  assert.match(
    actions, /\.select\('slug title excerpt coverUrl tags articleType publishedAt programs skills'\)/,
    'getFeaturedArticlesForLanding projects the taxonomy ids — without them the ' +
    'card renders no chips, which is indistinguishable from an article that has none',
  );

  const page = src('src/app/page.jsx');
  assert.match(page, /listPrograms\(\)\.catch\(\(\) => \(\{ items: \[\] \}\)\)/, 'programs cannot fail the home page');
  assert.match(page, /listSkills\(\)\.catch\(\(\) => \(\{ items: \[\] \}\)\)/, 'nor can skills');
  assert.match(page, /buildProgramNames\(programsRes\.items\)/, 'and the maps are built from those fetches');
  assert.match(page, /buildSkillNames\(skillsRes\.items\)/);
  assert.match(page, /programNames=\{articleProgramNames\}/, 'and reach BlogSection');
  assert.match(page, /skillNames=\{articleSkillNames\}/);
});

test('both cards render the SHARED chips, not two copies that look alike', () => {
  // The ChatAvatar lesson: a copy that is byte-identical today drifts silently.
  const blogSection = src('src/app/_components/home/BlogSection.jsx');
  const articlesClient = src('src/app/(public)/articles/_components/ArticlesPageClient.jsx');
  for (const [file, code] of [['BlogSection.jsx', blogSection], ['ArticlesPageClient.jsx', articlesClient]]) {
    assert.match(code, /<ProgramOverlay ids=/, `${file} renders the shared overlay`);
    assert.match(code, /<SkillChips ids=/, `${file} renders the shared chips`);
    assert.ok(
      !/rounded-full bg-9e-ice px-2/.test(code),
      `${file} still holds its own copy of the chip markup`,
    );
  }
  // The one thing that legitimately differs, stated at both call sites.
  assert.match(articlesClient, /<SkillChips ids=\{article\.skills\} names=\{skillNames\} cap=\{3\} \/>/);
  assert.match(blogSection, /<SkillChips ids=\{blog\.skills\} names=\{skillNames\} cap=\{2\} \/>/);
});

test('the design record no longer claims BlogSection is untouched', () => {
  // That block IS the design record for this decision. Left as it was, it would
  // be an authoritative-looking artifact stating the opposite of what shipped.
  //
  // READS THE RAW FILE. Every other assertion here scrubs comments, because an
  // assertion about what code DOES must not be satisfiable by a comment about
  // it. This one is the documented exception: the subject under test IS a
  // comment, and the scrubbed source has already deleted it. The first draft of
  // this test used the scrubbed reader and failed on a correct file — the same
  // mirror-image trap recorded in test/run.mjs's header.
  const articlesClient = readFileSync(
    path.join(ROOT, 'src/app/(public)/articles/_components/ArticlesPageClient.jsx'),
    'utf8',
  );
  assert.ok(
    !/`\?type=` param and BlogSection\s*\n\s*\*\s*are all untouched/.test(articlesClient),
    'the stale claim is gone',
  );
  assert.match(articlesClient, /BLOGSECTION IS NO LONGER AN EXCEPTION/, 'and it says what is true now');
});

test('the program overlay is capped at exactly 2 on the landing card', () => {
  // Measured, not assumed. This row is absolutely positioned at left-3 on a
  // 288px card, and every article cover puts the 9Expert logo top-RIGHT at
  // ~86% of the width — x≈247px — leaving 235px clear. The widest pair any
  // real article carries is "Microsoft Excel" + "Microsoft 365" at 185.8px
  // (11px GoogleSans-Medium, +16px chip padding each, +4px gap), so 2 fits
  // with ~49px spare. A third cannot wrap out of the way like a skill chip: it
  // runs into the logo, which is exactly the chat course-card bug.
  const html = render();
  const chips = [...html.matchAll(/bg-9e-action[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(chips, ['Data Analytics', 'Power Automate'], 'the first two, in order');
  assert.ok(!html.includes('Power Apps'), 'the third is dropped');
});

test('CONTROL: raising the landing overlay cap by one must redden', () => {
  // The cap is a number at a call site, so the guard has to be on that number.
  const blogSection = src('src/app/_components/home/BlogSection.jsx');
  assert.match(
    blogSection, /<ProgramOverlay ids=\{blog\.programs\} names=\{programNames\} cap=\{2\} \/>/,
    'the landing passes 2 explicitly',
  );
  // …and the render above is what would actually catch cap={3}: with three
  // resolvable programs in the fixture, a cap of 3 puts "Power Apps" on screen.
  assert.equal(resolveTaxonomyNames(['PG-A', 'PG-B', 'PG-C'], PROGRAM_NAMES, 2).length, 2);
  assert.equal(resolveTaxonomyNames(['PG-A', 'PG-B', 'PG-C'], PROGRAM_NAMES, 3).length, 3,
    'a cap of 3 genuinely renders a third — so the assertion above is live');
});

test('NEITHER shared chip component hides a default cap', () => {
  // One convention, not two. SkillChips was written with a required cap so the
  // constraint could not hide; ProgramOverlay briefly hid its own, which left a
  // reader unable to tell which convention this codebase follows.
  const chips = src('src/components/articles/ArticleTaxonomyChips.jsx');
  assert.match(chips, /export function ProgramOverlay\(\{ ids, names, cap \}\)/, 'no default');
  assert.match(chips, /export function SkillChips\(\{ ids, names, cap \}\)/, 'no default');
  assert.ok(!/cap = \d/.test(chips), 'neither component defaults the cap');
  // Both call sites on both pages state their own number.
  const articlesClient = src('src/app/(public)/articles/_components/ArticlesPageClient.jsx');
  assert.match(articlesClient, /<ProgramOverlay ids=\{article\.programs\} names=\{programNames\} cap=\{2\} \/>/);
});

test('EVERY BlogCard call site is handed the name maps', () => {
  // THE DEFECT THIS EXISTS FOR, and it shipped: BlogSection renders BlogCard in
  // THREE places — the static grid (<=4 featured), BlogSlider (>4 featured), and
  // BlogCarousel (every mobile visitor) — and only the first was given the maps.
  // The other two fell back to the `= {}` defaults and rendered NO chips at all,
  // which is indistinguishable from an article with no taxonomy. On mobile that
  // is the only code path there is.
  //
  // The earlier guards could not see it: one checked that the file MENTIONS
  // <ProgramOverlay, the other checked page.jsx. Neither counted call sites.
  const blogSection = src('src/app/_components/home/BlogSection.jsx');
  const calls = blogSection.match(/<BlogCard\b[^/]*\/>/g) ?? [];
  assert.ok(calls.length >= 3, `expected the three render paths, found ${calls.length}`);
  for (const call of calls) {
    assert.ok(call.includes('programNames='), `a BlogCard call site drops programNames: ${call}`);
    assert.ok(call.includes('skillNames='), `a BlogCard call site drops skillNames: ${call}`);
  }
});

test('CONTROL: the call-site sweep would notice a dropped map', () => {
  // Without this the loop passes vacuously if the matcher finds nothing, and
  // "found 0 call sites" looks identical to "all correct".
  const withMaps = '<BlogCard blog={blog} programNames={programNames} skillNames={skillNames} />';
  const without = '<BlogCard blog={blog} />';
  assert.ok(withMaps.includes('programNames='), 'the matcher accepts a correct call');
  assert.ok(!without.includes('programNames='), 'and rejects the shape that shipped');
});
