import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ProgramArticlesSection } from '@/components/program/ProgramArticlesSection';
import {
  PROGRAM_ARTICLE_CARD_FIELDS,
  PROGRAM_ARTICLE_LIMIT,
  toFieldList,
} from '@/lib/articleListFields';
import { ARTICLE_COVER_FALLBACK } from '@/lib/articleCardModel';

/**
 * The program page's related-articles section.
 *
 * ── THE ASSERTION THAT MATTERS MOST IS THE SELECT ONE ──────────────────────
 * Every other claim here fails loudly. The projection does not: `getArticles`
 * runs `.lean()` and then a JSON round-trip that DROPS undefined keys, so a
 * field missing from the select never reaches the card as `undefined` — it is
 * simply absent, `shouldShowPinBadge` reads `=== true` on nothing, and the pin
 * badge vanishes from the whole section with no throw and no log.
 *
 * So that test does not assert the constant's literal contents, which would
 * only prove the constant equals itself. It DROPS a field from the projection,
 * puts the surviving object through the same JSON round-trip the read path
 * uses, renders it, and asserts the badge is gone — then renders the complete
 * projection and asserts it is back.
 *
 * ── MATCHER RULES ──────────────────────────────────────────────────────────
 * Element text at its boundaries (`>label<`), never a bare substring: Thai
 * negates by prefix, so a substring match reads a denial as a confirmation.
 */

const PROGRAM = {
  _id: '68d3c5b02c6a2f1315c0bce5',
  program_id: 'POWER-BI',
  program_name: 'Power BI',
  programiconurl: 'https://res.cloudinary.com/x/pbi.png',
};
const PROGRAM_NAMES = { 'POWER-BI': 'Power BI', MSE: 'Microsoft Excel' };
const SKILL_NAMES = { BUSINESS: 'Business', AI: 'AI' };

const article = (n, extra = {}) => ({
  _id: `a${n}`,
  slug: `article-${n}`,
  title: `บทความที่ ${n}`,
  excerpt: `เนื้อหาย่อ ${n}`,
  coverUrl: `https://www.9experttraining.com/cover-${n}.png`,
  programs: ['POWER-BI'],
  skills: ['BUSINESS'],
  ...extra,
});

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(ProgramArticlesSection, {
      articles: [article(1)],
      program: PROGRAM,
      programNames: PROGRAM_NAMES,
      skillNames: SKILL_NAMES,
      ...props,
    })
  );

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const SRC = 'src/components/program/ProgramArticlesSection.jsx';
const scrubbed = () =>
  readFileSync(SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── empty means invisible ──────────────────────────────────────────────────

test('zero articles renders NOTHING — no section, no heading, no see-all link', () => {
  for (const articles of [[], undefined, null]) {
    assert.equal(render({ articles }), '', `articles=${JSON.stringify(articles)}`);
  }
});

test('CONTROL: one article DOES render — so the empties above are the guard, not a broken component', () => {
  const html = render();
  assert.notEqual(html, '');
  assert.match(html, />บทความเกี่ยวกับโปรแกรมนี้</);
});

test('the empty guard is the FaqAccordionSection shape, in code', () => {
  assert.match(scrubbed(), /if \(!articles\?\.length\) return null;/);
});

// ── the cap is exactly 6 ───────────────────────────────────────────────────

test('the shared cap constant is exactly 6 — an exact equality, never a floor', () => {
  assert.equal(PROGRAM_ARTICLE_LIMIT, 6);
});

test('both route mounts pass the SAME cap constant, so the two pages cannot disagree', () => {
  const routes = [
    'src/app/(public)/[...slug]/page.jsx',
    'src/app/(public)/program/[slug]/page.jsx',
  ];
  for (const rel of routes) {
    const code = readFileSync(rel, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.match(code, /limit: PROGRAM_ARTICLE_LIMIT/, `${rel} must use the shared constant`);
    /*
     * Scoped to the getArticles CALL, not to the rest of the file. Both routes
     * carry other `limit:` options (listSchedulesByCourse takes one), so a
     * whole-file scan reports them and says nothing about this call.
     */
    const call = code.slice(code.indexOf('getArticles({'));
    const args = call.slice(0, call.indexOf('})') + 2);
    assert.ok(
      !/limit:\s*\d/.test(args),
      `${rel} hardcodes a numeric limit in its getArticles call: ${args.replace(/\s+/g, ' ')}`
    );
  }
});

test('the section renders exactly the rows it is handed — it does not re-cap or re-sort', () => {
  const six = Array.from({ length: 6 }, (_, i) => article(i + 1));
  const doc = dom(render({ articles: six }));
  const grid = doc.querySelector('section > div:nth-of-type(2)');
  assert.equal(grid.children.length, 6);
  // Order is the route's, passed through untouched.
  const titles = [...grid.children].map((c) => c.querySelector('h3').textContent.trim());
  assert.deepEqual(titles, six.map((a) => a.title));
});

test('CONTROL: handed 3, it renders 3 — the count is the input, not a hardcoded 6', () => {
  const doc = dom(render({ articles: [article(1), article(2), article(3)] }));
  assert.equal(doc.querySelector('section > div:nth-of-type(2)').children.length, 3);
  assert.equal(doc.querySelector('h2').nextElementSibling.textContent.trim(), '3');
});

test('the section writes no second ordering — the route owns it', () => {
  const code = scrubbed();
  assert.ok(!/\.sort\(/.test(code), 'no sort in the section');
  assert.ok(!/\.slice\(/.test(code), 'no re-cap in the section');
});

// ── the see-all link ───────────────────────────────────────────────────────

test('the see-all href carries the program SHORT CODE', () => {
  const doc = dom(render());
  const link = [...doc.querySelectorAll('a')].find((a) =>
    a.textContent.includes('ดูบทความทั้งหมด')
  );
  assert.ok(link, 'the link renders');
  assert.equal(link.getAttribute('href'), '/articles?program=POWER-BI');
});

test('CONTROL: a different program yields a different href — the code is read, not baked in', () => {
  const doc = dom(render({ program: { ...PROGRAM, program_id: 'MSE' } }));
  const link = [...doc.querySelectorAll('a')].find((a) =>
    a.textContent.includes('ดูบทความทั้งหมด')
  );
  assert.equal(link.getAttribute('href'), '/articles?program=MSE');
});

test('a program with no short code falls back to bare /articles rather than ?program=undefined', () => {
  const doc = dom(render({ program: { program_name: 'x' } }));
  const link = [...doc.querySelectorAll('a')].find((a) =>
    a.textContent.includes('ดูบทความทั้งหมด')
  );
  assert.equal(link.getAttribute('href'), '/articles');
});

test('the see-all label is matched at its element boundaries, not as a substring', () => {
  assert.match(render(), />\s*ดูบทความทั้งหมด/);
});

// ── the projection, proven by dropping a field ─────────────────────────────

/** The round trip `getArticles` performs: `.lean()` then serialize(). */
const roundTrip = (doc) => JSON.parse(JSON.stringify(doc));

/** Project `doc` onto `fields`, the way Mongo `.select()` would. */
const project = (doc, fields) =>
  Object.fromEntries(Object.entries(doc).filter(([k]) => fields.includes(k)));

const ROW = article(1);

/**
 * The first CARD's cover.
 *
 * Scoped to the grid, not `doc.querySelector('img')`: the heading row carries
 * the program icon, so an unscoped query returns that instead and the
 * assertions compare the icon against the cover — which is exactly what
 * happened on the first run of these two tests.
 */
const coverOf = (doc) =>
  doc.querySelector('section > div:nth-of-type(2) img')?.getAttribute('src') ?? '';

test('the cover renders from coverUrl under the FULL projection', () => {
  const row = roundTrip(project(ROW, toFieldList(PROGRAM_ARTICLE_CARD_FIELDS)));
  assert.equal(coverOf(dom(render({ articles: [row] }))), ROW.coverUrl);
});

test('CONTROL: dropping coverUrl from the select silently swaps EVERY cover for the stand-in', () => {
  /*
   * The projection failure mode, and it is silent: the read path .lean()s then
   * JSON-round-trips, so an omitted field does not arrive as undefined — it
   * does not arrive at all. `toBlogCardModel` then substitutes the fallback
   * for every row and the section renders a wall of identical placeholder art,
   * with nothing thrown and nothing logged.
   */
  const fields = toFieldList(PROGRAM_ARTICLE_CARD_FIELDS).filter((f) => f !== 'coverUrl');
  const row = roundTrip(project(ROW, fields));
  assert.equal('coverUrl' in row, false, 'the round trip drops the key entirely');
  const src = coverOf(dom(render({ articles: [row] })));
  assert.equal(src, ARTICLE_COVER_FALLBACK, 'the stand-in, not the real cover');
  assert.notEqual(src, ROW.coverUrl);
});

test('the projection carries no field the card cannot read', () => {
  // The two pin fields left with ArticleCard: BlogCard draws no pin badge, so
  // carrying them would be cargo the next reader has to disprove.
  const fields = toFieldList(PROGRAM_ARTICLE_CARD_FIELDS);
  for (const dead of ['isPinnedOnArticlePage', 'showPinBadge']) {
    assert.equal(fields.includes(dead), false, `${dead} is no longer read by this section`);
  }
});

test('every field the card reads survives the projection', () => {
  const row = roundTrip(project(ROW, toFieldList(PROGRAM_ARTICLE_CARD_FIELDS)));
  const doc = dom(render({ articles: [row] }));
  assert.match(doc.body.innerHTML, />บทความที่ 1</, 'title');
  assert.ok(doc.body.textContent.includes('เนื้อหาย่อ 1'), 'excerpt');
  assert.ok(doc.querySelector(`img[src="${ROW.coverUrl}"]`), 'coverUrl');
  assert.ok(doc.body.textContent.includes('Power BI'), 'programs resolved through the name map');
  assert.ok(doc.body.textContent.includes('Business'), 'skills resolved through the name map');
  assert.ok(
    [...doc.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/articles/article-1'),
    'slug'
  );
});

// ── it is the /articles card, and the grid it was measured for ─────────────

test('it renders the LANDING PAGE card, not the /articles one and not a fork', () => {
  assert.match(
    scrubbed(),
    /import \{ BlogCard \} from '@\/app\/_components\/home\/BlogSection'/,
    'the same export the landing section renders'
  );
  assert.ok(!/ArticleCard/.test(scrubbed()), 'the /articles card is no longer used here');
  const doc = dom(render());
  // BlogCard's root is a <Link>; ArticleCard's was an <article> with three
  // links inside it. Asserting the ROOT distinguishes them without matching
  // classes that either card could carry.
  assert.equal(doc.querySelector('section > div:nth-of-type(2) > *').tagName, 'A');
  assert.equal(doc.querySelectorAll('article').length, 0, 'no <article> root');
});

test('FOUR columns at xl, the landing grid literal — so a card is the same 288px', () => {
  /*
   * This was three columns, which is what made the cards visibly bigger: same
   * 1200px container, (1200-48)/3 = 384px against the landing's
   * (1200-48)/4 = 288px.
   *
   * The literal is compared against BlogSection's OWN grid rather than spelled
   * out twice — a hardcoded copy here would pass while the two drifted.
   */
  const grid = dom(render()).querySelector('section > div:nth-of-type(2)');
  const cls = grid.getAttribute('class');
  const landing = readFileSync('src/app/_components/home/BlogSection.jsx', 'utf8');
  const landingGrid = landing.match(/className="(grid grid-cols-1[^"]*)"/)[1];
  assert.equal(cls, landingGrid, 'the program grid IS the landing grid');
  assert.match(cls, /xl:grid-cols-4/);
  assert.match(cls, /gap-4/);
});

test('CONTROL: the landing grid really is four-up at xl — so the match above is not to an empty string', () => {
  const landing = readFileSync('src/app/_components/home/BlogSection.jsx', 'utf8');
  const m = landing.match(/className="(grid grid-cols-1[^"]*)"/);
  assert.ok(m, 'the landing grid literal was found');
  assert.match(m[1], /xl:grid-cols-4/);
});

test('the heading follows the course grid, not the FAQ', () => {
  const doc = dom(render());
  const cls = doc.querySelector('section').getAttribute('class');
  assert.match(cls, /max-w-\[1200px\]/);
  assert.ok(!/max-w-3xl/.test(cls), `inherited the FAQ container: ${cls}`);
  const h2 = doc.querySelector('h2');
  assert.match(h2.getAttribute('class'), /text-lg font-bold/);
  assert.ok(!/text-center/.test(h2.getAttribute('class')));
  assert.ok(doc.querySelector('h2').parentElement.querySelector('img'), 'program icon');
});
