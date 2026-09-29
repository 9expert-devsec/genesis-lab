import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCourseListJsonLd,
  TRAINING_COURSE_TITLE,
  HOME_BREADCRUMB_LABEL,
} from '@/lib/seo/courseListJsonLd';
import { buildHomeJsonLd, homeGraphIds } from '@/lib/seo/homeJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { siteConfig } from '@/config/site';
import { readSource } from '../sourceScan.mjs';

/**
 * /training-course's `@graph`.
 *
 * A pure builder, so this invokes it for real rather than scanning source.
 *
 * ── THE CONTROL EVERY TEST HERE SHARES ─────────────────────────────────────
 * The builder takes an origin. Production passes nothing. The tests below
 * rebuild on a DIFFERENT origin and assert the result moved with it — a
 * hardcoded host would survive the swap, and surviving the swap is the failure.
 * Same control, and the same reasoning, as test/pure/homeJsonLd.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

const nodesOf = (graph) => graph['@graph'];
const nodeOfType = (graph, type) => nodesOf(graph).find((n) => n['@type'] === type);

/** A projected list row, in the shape projectCourseListRows emits. */
const row = (i, over = {}) => ({
  _id: `69b25a3177e3680cba66${String(i).padStart(4, '0')}`,
  course_id: `COURSE-${i}`,
  course_name: `หลักสูตรที่ ${i}`,
  course_teaser: `คำโปรยของหลักสูตรที่ ${i}`,
  ...over,
});

const rows = (n) => Array.from({ length: n }, (_, i) => row(i + 1));

// ── 1. the shared @ids are Home's, byte for byte ────────────────────────────

/**
 * THE ASSERTION THIS BUILDER'S CROSS-REFERENCES EXIST FOR.
 *
 * `isPartOf` and `about` are claims about entities DECLARED on the home page.
 * They resolve only if the strings match Home's `@id`s exactly. Asserted
 * against `buildHomeJsonLd`'s ACTUAL OUTPUT — not against homeGraphIds, which
 * both files import and which would therefore agree with itself even if Home
 * stopped using it.
 */
test('isPartOf and about are byte-identical to the ids the home graph emits', () => {
  const home = buildHomeJsonLd();
  const collection = nodeOfType(buildCourseListJsonLd(rows(3)), 'CollectionPage');

  assert.equal(collection.isPartOf['@id'], nodeOfType(home, 'WebSite')['@id']);
  assert.equal(
    collection.about['@id'],
    nodeOfType(home, 'EducationalOrganization')['@id']
  );
});

test('and so is every Course provider — the organisation is one entity', () => {
  const organizationId = nodeOfType(buildHomeJsonLd(), 'EducationalOrganization')['@id'];
  const list = nodeOfType(buildCourseListJsonLd(rows(3)), 'ItemList');

  for (const entry of list.itemListElement) {
    assert.equal(entry.item.provider['@id'], organizationId);
  }
});

test('CONTROL: the shared ids FOLLOW the origin — they are composed, not restated', () => {
  const collection = nodeOfType(buildCourseListJsonLd(rows(2), OTHER), 'CollectionPage');
  assert.equal(collection.isPartOf['@id'], `${OTHER}/#website`);
  assert.equal(collection.about['@id'], `${OTHER}/#organization`);
  assert.notEqual(
    collection.isPartOf['@id'],
    homeGraphIds()['website'],
    'a hardcoded fragment would have ignored the argument'
  );
});

test('changing the origin moves EVERY site URL — no literal host survives', () => {
  const moved = JSON.stringify(buildCourseListJsonLd(rows(5), OTHER));
  assert.ok(
    !moved.includes(SITE_URL),
    'a URL still names the production origin after the origin was changed — it is hardcoded'
  );
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  const real = JSON.stringify(buildCourseListJsonLd(rows(5)));
  assert.ok(real.includes(SITE_URL), 'the scan must be able to see the origin, or it proves nothing');
});

// ── 2. the three nodes, and the links between them ──────────────────────────

test('the graph is exactly CollectionPage + ItemList + BreadcrumbList', () => {
  const graph = buildCourseListJsonLd(rows(3));
  assert.deepEqual(
    nodesOf(graph).map((n) => n['@type']),
    ['CollectionPage', 'ItemList', 'BreadcrumbList']
  );
});

test('mainEntity and breadcrumb point at the ids those nodes actually carry', () => {
  const graph = buildCourseListJsonLd(rows(3));
  const collection = nodeOfType(graph, 'CollectionPage');

  assert.equal(collection.mainEntity['@id'], nodeOfType(graph, 'ItemList')['@id']);
  assert.equal(collection.breadcrumb['@id'], nodeOfType(graph, 'BreadcrumbList')['@id']);
});

test('the CollectionPage url is the canonical the page emits, with no query string', () => {
  const collection = nodeOfType(buildCourseListJsonLd(rows(3)), 'CollectionPage');
  assert.equal(collection.url, `${SITE_URL}/training-course`);
  assert.equal(collection['@id'], `${SITE_URL}/training-course#webpage`);
});

// ── 3. the name IS the page's rendered <title> ──────────────────────────────

/**
 * The composed title, asserted as one string. `metadata.title` in page.jsx is
 * TRAINING_COURSE_TITLE and the root layout's template wraps it — so this is
 * what a reader and a crawler see, and the graph may not claim otherwise.
 */
test('CollectionPage.name is the full rendered <title>, not just the page segment', () => {
  const collection = nodeOfType(buildCourseListJsonLd(rows(3)), 'CollectionPage');
  assert.equal(collection.name, `${TRAINING_COURSE_TITLE} | ${siteConfig.name}`);
  assert.equal(collection.name, 'หลักสูตรทั้งหมด | 9Expert Training');
});

/**
 * The one duplication in the builder, guarded rather than asserted away.
 *
 * renderedTitle() restates the root layout's `title.template` FORM because
 * layout.jsx cannot be imported (it drags in fonts and the app shell). If the
 * separator ever changes there, this goes red here — which is the whole point of
 * writing the guard instead of trusting the comment.
 */
test('the layout template is still the shape renderedTitle composes', () => {
  // `.code` — the scrubbed source. The template is executable code, not a
  // comment, so stripping comments cannot make this pass vacuously.
  const { code } = readSource('src/app/layout.jsx');
  assert.ok(
    code.includes('template: `%s | ${siteConfig.name}`'),
    'the root layout title template changed — courseListJsonLd.renderedTitle must follow it'
  );
});

// ── 4. one ListItem per resolvable row, positions contiguous ────────────────

test('one ListItem per row, in the order handed in', () => {
  const list = nodeOfType(buildCourseListJsonLd(rows(4)), 'ItemList');
  assert.equal(list.itemListElement.length, 4);
  assert.deepEqual(
    list.itemListElement.map((e) => e.item.name),
    ['หลักสูตรที่ 1', 'หลักสูตรที่ 2', 'หลักสูตรที่ 3', 'หลักสูตรที่ 4']
  );
});

test('positions are 1..n and contiguous', () => {
  const list = nodeOfType(buildCourseListJsonLd(rows(6)), 'ItemList');
  assert.deepEqual(
    list.itemListElement.map((e) => e.position),
    [1, 2, 3, 4, 5, 6]
  );
});

test('numberOfItems equals the number of items actually listed', () => {
  const list = nodeOfType(buildCourseListJsonLd(rows(6)), 'ItemList');
  assert.equal(list.numberOfItems, list.itemListElement.length);
  assert.equal(list.numberOfItems, 6);
});

// ── 5. the Course node carries ONLY the agreed keys ─────────────────────────

/**
 * An exact key set, not a lower bound. The spec for this round is explicit that
 * price, offers and hasCourseInstance stay OUT — the detail page's Course node
 * is where those live, and duplicating them across 77 list entries is payload
 * and a second place for them to disagree.
 */
test('the nested Course carries exactly @id, url, name, description, provider', () => {
  const list = nodeOfType(buildCourseListJsonLd(rows(2)), 'ItemList');
  assert.deepEqual(
    Object.keys(list.itemListElement[0].item).sort(),
    ['@id', '@type', 'description', 'name', 'provider', 'url']
  );
});

test('no price, no offers, no hasCourseInstance anywhere in the graph', () => {
  const serialised = JSON.stringify(
    buildCourseListJsonLd([
      row(1, { course_price: 12900, course_cover_url: 'https://cdn.example/x.png' }),
    ])
  );
  for (const forbidden of ['offers', 'hasCourseInstance', 'price', '12900']) {
    assert.ok(!serialised.includes(forbidden), `${forbidden} leaked into the list graph`);
  }
});

test('the Course @id and url are the same canonical string', () => {
  const list = nodeOfType(buildCourseListJsonLd(rows(1)), 'ItemList');
  const { item, url } = list.itemListElement[0];
  assert.equal(item['@id'], item.url);
  assert.equal(item.url, url, 'the ListItem url and its item url are one value');
});

// ── 6. description: omitted when blank, never emitted empty ─────────────────

test('a blank teaser omits the description key entirely', () => {
  for (const teaser of ['', '   ', undefined, null]) {
    const list = nodeOfType(buildCourseListJsonLd([row(1, { course_teaser: teaser })]), 'ItemList');
    const item = list.itemListElement[0].item;
    assert.ok(
      !('description' in item),
      `teaser ${JSON.stringify(teaser)} should omit description, got ${JSON.stringify(item.description)}`
    );
  }
});

test('a real teaser is carried, trimmed', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([row(1, { course_teaser: '  เรียน Power BI จากศูนย์  ' })]),
    'ItemList'
  );
  assert.equal(list.itemListElement[0].item.description, 'เรียน Power BI จากศูนย์');
});

test('CONTROL: the graph never carries an empty string at any depth', () => {
  const graph = buildCourseListJsonLd([
    row(1, { course_teaser: '' }),
    row(2, { course_teaser: '   ' }),
  ]);
  const walk = (value, path, out) => {
    if (typeof value === 'string') {
      if (value === '') out.push(path);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
    }
    return out;
  };
  assert.deepEqual(walk(JSON.parse(JSON.stringify(graph)), '$', []), []);
});

// ── 7. unnameable rows are SKIPPED, not guessed ────────────────────────────

/**
 * A row with neither `course_id` nor `urlAlias` cannot be named by
 * courseCanonicalPath, which returns null. courseLinkHref would turn that into
 * `/training-course` — correct for an <a href>, and an entry claiming the
 * listing page is a Course if it reached here. These assert it does not.
 */
test('a row with no course_id and no alias is dropped from the list', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([
      row(1),
      row(2, { course_id: '', urlAlias: '   ' }),
      row(3),
    ]),
    'ItemList'
  );
  assert.equal(list.itemListElement.length, 2);
  assert.deepEqual(
    list.itemListElement.map((e) => e.item.name),
    ['หลักสูตรที่ 1', 'หลักสูตรที่ 3']
  );
});

test('positions stay contiguous across a skip — the gap does not survive', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([row(1), row(2, { course_id: null }), row(3), row(4)]),
    'ItemList'
  );
  assert.deepEqual(list.itemListElement.map((e) => e.position), [1, 2, 3]);
  assert.equal(list.numberOfItems, 3, 'numberOfItems counts what is listed, not what was handed in');
});

test('no ListItem ever points at the listing page itself', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([row(1, { course_id: '', urlAlias: '' }), row(2)]),
    'ItemList'
  );
  for (const entry of list.itemListElement) {
    assert.notEqual(entry.url, `${SITE_URL}/training-course`);
  }
});

test('a row with no course_name is dropped too', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([row(1), row(2, { course_name: '' }), row(3)]),
    'ItemList'
  );
  assert.equal(list.itemListElement.length, 2);
});

// ── 8. the alias rule is delegated, not re-derived ─────────────────────────

test('an alias wins over the derived path, and is not double-slashed', () => {
  const list = nodeOfType(
    buildCourseListJsonLd([row(1, { course_id: 'PBI', urlAlias: '/power-bi-intensive' })]),
    'ItemList'
  );
  assert.equal(list.itemListElement[0].url, `${SITE_URL}/power-bi-intensive`);
});

test('no alias falls through to <code>-training-course, lowercased', () => {
  const list = nodeOfType(buildCourseListJsonLd([row(1, { course_id: 'POWER-BI' })]), 'ItemList');
  assert.equal(list.itemListElement[0].url, `${SITE_URL}/power-bi-training-course`);
});

// ── 9. every url is on the origin, and no url doubles a slash ──────────────

/** Every string value in a JSON document, at any depth. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) strings(v, out);
  }
  return out;
}

/**
 * `https://schema.org` is the `@context` — the VOCABULARY, not a site URL, and
 * it must not move with the origin. Excluded by name rather than by a looser
 * pattern so that any OTHER off-origin URL still fails this.
 */
const SCHEMA_ORG = 'https://schema.org';

test('every string in the graph that is a URL starts with the origin', () => {
  const graph = buildCourseListJsonLd(rows(5), OTHER);
  const urls = strings(graph).filter((s) => s.startsWith('http') && s !== SCHEMA_ORG);
  assert.ok(urls.length > 0, 'the scan must see some URLs, or it proves nothing');
  for (const url of urls) {
    assert.ok(url === OTHER || url.startsWith(`${OTHER}/`), `not on the origin: ${url}`);
  }
});

test('the @context vocabulary is NOT rewritten by the origin', () => {
  const graph = buildCourseListJsonLd(rows(2), OTHER);
  assert.equal(graph['@context'], SCHEMA_ORG);
});

test('no url carries a double slash after the scheme', () => {
  const graph = buildCourseListJsonLd(
    [
      row(1, { urlAlias: '/aliased' }),
      row(2, { urlAlias: 'no-leading-slash' }),
      row(3, { urlAlias: '/trailing/' }),
      row(4),
    ],
    OTHER
  );
  for (const url of strings(graph).filter((s) => s.startsWith('http'))) {
    assert.ok(
      !url.slice('https://'.length).includes('//'),
      `double slash in ${url}`
    );
  }
});

test('a trailing slash on the origin does not produce a double slash', () => {
  const graph = buildCourseListJsonLd(rows(2), `${OTHER}/`);
  for (const url of strings(graph).filter((s) => s.startsWith('http'))) {
    assert.ok(!url.slice('https://'.length).includes('//'), `double slash in ${url}`);
  }
  assert.equal(
    nodeOfType(graph, 'CollectionPage').url,
    `${OTHER}/training-course`
  );
});

// ── 10. empty list → null, so the page emits nothing ──────────────────────

test('an empty list returns null rather than an empty ItemList', () => {
  assert.equal(buildCourseListJsonLd([]), null);
});

test('so do the shapes a failed fetch can hand over', () => {
  for (const input of [null, undefined, 'not an array', {}]) {
    assert.equal(buildCourseListJsonLd(input), null, `${JSON.stringify(input)} should yield null`);
  }
});

test('a list where EVERY row is unnameable also returns null', () => {
  assert.equal(
    buildCourseListJsonLd([row(1, { course_id: '', urlAlias: '' }), row(2, { course_id: null })]),
    null,
    'skipping every row leaves nothing to describe — an empty ItemList must not be emitted'
  );
});

// ── 11. the breadcrumb ────────────────────────────────────────────────────

test('the breadcrumb is หน้าแรก at the origin then this page at its canonical', () => {
  const crumbs = nodeOfType(buildCourseListJsonLd(rows(2)), 'BreadcrumbList').itemListElement;
  assert.deepEqual(crumbs, [
    { '@type': 'ListItem', position: 1, name: HOME_BREADCRUMB_LABEL, item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: TRAINING_COURSE_TITLE, item: `${SITE_URL}/training-course` },
  ]);
});

test('the breadcrumb root is the bare origin, with no trailing slash', () => {
  const crumbs = nodeOfType(buildCourseListJsonLd(rows(2)), 'BreadcrumbList').itemListElement;
  assert.ok(!crumbs[0].item.endsWith('/'), `breadcrumb root has a trailing slash: ${crumbs[0].item}`);
});

// ── 12. the graph does not depend on anything the query string can change ──

/**
 * The claim the builder's docblock makes, asserted: this page is static and its
 * filtering is client-side, so the graph is a function of the server's rows
 * ALONE. There is no page/filter parameter to pass, and two calls with the same
 * rows are byte-identical — which is why the prerendered HTML can serve
 * /training-course?skill=… and still be truthful.
 */
/**
 * ONE required parameter: the rows. `siteUrl` has a default, and a default
 * parameter does not count toward `Function.length` — so 1 is the arity of
 * "rows, plus an origin only a test passes". If a `page`, `filter` or
 * `searchParams` argument is ever added ahead of the default, this goes red,
 * which is the shape of change this assertion is watching for.
 */
test('the builder takes no filter or page argument — only rows and an optional origin', () => {
  assert.equal(buildCourseListJsonLd.length, 1);
});

test('two builds from the same rows are byte-identical', () => {
  const r = rows(5);
  assert.equal(
    JSON.stringify(buildCourseListJsonLd(r)),
    JSON.stringify(buildCourseListJsonLd(r))
  );
});
