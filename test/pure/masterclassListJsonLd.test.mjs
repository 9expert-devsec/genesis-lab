import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMasterclassListJsonLd,
  MASTERCLASS_TITLE,
  HOME_BREADCRUMB_LABEL,
} from '@/lib/seo/masterclassListJsonLd';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
import { masterclassCanonicalUrl, masterclassCourseId } from '@/lib/masterclass/masterclassUrl';
import { buildHomeJsonLd, homeGraphIds } from '@/lib/seo/homeJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { siteConfig } from '@/config/site';
import { readSource } from '../sourceScan.mjs';

/**
 * /masterclass's `@graph`.
 *
 * The assertion that matters most is §1: a ListItem's Course `@id` must be the
 * SAME string the detail page's Course node carries, compared against that
 * builder's real output rather than against the helper both import.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

const nodesOf = (graph) => graph['@graph'];
const nodeOfType = (graph, type) => nodesOf(graph).find((n) => n['@type'] === type);
const itemsOf = (graph) => nodeOfType(graph, 'ItemList').itemListElement;

/** A published masterclass in the shape getPublishedMasterclasses returns. */
const mc = (i, over = {}) => ({
  _id: `mc${i}`,
  slug: `mas-course-${i}`,
  title_th: `หลักสูตร Masterclass ${i}`,
  subtitle_th: `คำโปรยของหลักสูตร ${i}`,
  display_order: i,
  batches: [
    {
      _id: `b${i}`,
      batch_no: 1,
      status: 'open',
      price_normal: 8900,
      price_early_bird: 6900,
      is_early_bird: true,
      dates: [{ date: '2026-11-08T00:00:00.000Z' }],
    },
  ],
  ...over,
});

const list = (n) => Array.from({ length: n }, (_, i) => mc(i + 1));

// ── 1. the ListItem Course IS the detail page's Course ─────────────────────

/**
 * THE ASSERTION THE WHOLE ROUND EXISTS FOR.
 *
 * Compared against `generateMasterclassJsonLd`'s ACTUAL output — not against
 * masterclassCourseId, which both modules import and which would agree with
 * itself even if one of them stopped using it.
 */
test('a listing item\'s Course @id is byte-identical to the detail page\'s', () => {
  const course = mc(1);
  const listingItem = itemsOf(buildMasterclassListJsonLd([course]))[0].item;
  const detailCourse = nodeOfType(generateMasterclassJsonLd(course, [], []), 'Course');

  assert.equal(listingItem['@id'], detailCourse['@id']);
  assert.equal(listingItem['@id'], `${SITE_URL}/masterclass/mas-course-1#course`);
});

test('and so is its url — both are the canonical', () => {
  const course = mc(1);
  const listingItem = itemsOf(buildMasterclassListJsonLd([course]))[0].item;
  const detailCourse = nodeOfType(generateMasterclassJsonLd(course, [], []), 'Course');

  assert.equal(listingItem.url, detailCourse.url);
  assert.equal(listingItem.url, masterclassCanonicalUrl('mas-course-1'));
  assert.equal(listingItem['@id'], `${listingItem.url}#course`);
});

test('the identity holds under a swapped origin too', () => {
  const course = mc(1);
  const listingItem = itemsOf(buildMasterclassListJsonLd([course], OTHER))[0].item;
  const detailCourse = nodeOfType(generateMasterclassJsonLd(course, [], [], OTHER), 'Course');
  assert.equal(listingItem['@id'], detailCourse['@id']);
  assert.equal(listingItem['@id'], masterclassCourseId('mas-course-1', OTHER));
});

test('the superseded masterclass subdomain appears nowhere in the listing graph', () => {
  const serialised = JSON.stringify(buildMasterclassListJsonLd(list(3)));
  assert.ok(!serialised.includes('masterclass.9experttraining.com'));
});

// ── 2. the home references ────────────────────────────────────────────────

test('isPartOf and about are the ids the home graph really emits', () => {
  const home = buildHomeJsonLd();
  const page = nodeOfType(buildMasterclassListJsonLd(list(2)), 'CollectionPage');
  assert.equal(page.isPartOf['@id'], nodeOfType(home, 'WebSite')['@id']);
  assert.equal(page.about['@id'], nodeOfType(home, 'EducationalOrganization')['@id']);
});

test('every item provider is that same organisation', () => {
  const organizationId = nodeOfType(buildHomeJsonLd(), 'EducationalOrganization')['@id'];
  for (const entry of itemsOf(buildMasterclassListJsonLd(list(3)))) {
    assert.deepEqual(entry.item.provider, { '@id': organizationId });
  }
});

test('changing the origin moves EVERY site URL — no literal host survives', () => {
  const moved = JSON.stringify(buildMasterclassListJsonLd(list(3), OTHER));
  assert.ok(!moved.includes(SITE_URL), 'a URL still names the production origin');
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  assert.ok(JSON.stringify(buildMasterclassListJsonLd(list(3))).includes(SITE_URL));
});

test('CONTROL: the references follow the origin', () => {
  const page = nodeOfType(buildMasterclassListJsonLd(list(2), OTHER), 'CollectionPage');
  assert.equal(page.isPartOf['@id'], `${OTHER}/#website`);
  assert.equal(page.about['@id'], `${OTHER}/#organization`);
  assert.notEqual(page.about['@id'], homeGraphIds().organization);
});

// ── 3. shape, links, title ────────────────────────────────────────────────

test('the graph is exactly CollectionPage + ItemList + BreadcrumbList', () => {
  assert.deepEqual(
    nodesOf(buildMasterclassListJsonLd(list(2))).map((n) => n['@type']),
    ['CollectionPage', 'ItemList', 'BreadcrumbList']
  );
});

test('mainEntity and breadcrumb point at the ids those nodes carry', () => {
  const graph = buildMasterclassListJsonLd(list(2));
  const page = nodeOfType(graph, 'CollectionPage');
  assert.equal(page.mainEntity['@id'], nodeOfType(graph, 'ItemList')['@id']);
  assert.equal(page.breadcrumb['@id'], nodeOfType(graph, 'BreadcrumbList')['@id']);
  assert.equal(page['@id'], `${SITE_URL}/masterclass#webpage`);
  assert.equal(page.url, `${SITE_URL}/masterclass`);
});

test('the ItemList @id does not collide with the other listings\'', () => {
  const id = nodeOfType(buildMasterclassListJsonLd(list(2)), 'ItemList')['@id'];
  assert.equal(id, `${SITE_URL}/masterclass#masterclasslist`);
  for (const other of ['#courselist', '#schedulelist']) {
    assert.ok(!id.endsWith(other), `collides with another listing's fragment: ${id}`);
  }
});

/**
 * The title used to be `'Masterclass — 9Expert Training'`, which the root
 * layout's template turned into `Masterclass — 9Expert Training | 9Expert
 * Training`. The brand belongs to the template.
 */
test('CollectionPage.name is the rendered title, with the brand exactly ONCE', () => {
  const name = nodeOfType(buildMasterclassListJsonLd(list(2)), 'CollectionPage').name;
  assert.equal(name, `${MASTERCLASS_TITLE} | ${siteConfig.name}`);
  assert.equal(name, 'Masterclass | 9Expert Training');
  assert.equal(
    name.split(siteConfig.name).length - 1,
    1,
    `the brand appears more than once: ${name}`
  );
});

test('the title SEGMENT does not itself contain the brand', () => {
  assert.ok(
    !MASTERCLASS_TITLE.includes(siteConfig.name),
    'the template appends the brand — a segment carrying it doubles it'
  );
});

/**
 * BOTH OF THE DETAIL ROUTE'S TITLES READ THE SAME SEGMENT.
 *
 * ── WHY THIS TEST IS HERE AND WHY IT IS A SOURCE SCAN ───────────────────────
 * generateMetadata is not invocable from this tier — it awaits
 * getMasterclassBySlug, which opens a Mongo connection — so this reads the
 * route's source, comments stripped, exactly as the layout-template test above
 * does. Same split, same stated limitation.
 *
 * It lives in THIS file rather than beside the detail route's own tests because
 * the claim is about MASTERCLASS_TITLE having ONE spelling. Four consumers now:
 * /masterclass's metadata.title, CollectionPage.name, and the detail route's
 * two branches.
 *
 * ── WHY THE SCAN IS WHOLE-FILE, WRITTEN THE HARD WAY ───────────────────────
 * It was scoped to a single statement when it was written, with a comment
 * explaining that the found-course title two lines below carried the same
 * doubled brand and was out of that round's scope. The comment was accurate and
 * the test was still the wrong shape: a guard narrowed to the instance someone
 * already noticed cannot catch the one they did not, and the live defect sat
 * directly under it for a round. The scan is now over the whole route and the
 * assertion is "the brand is not spelled here AT ALL".
 *
 * ── THE TWO BRANCHES WERE NOT EQUALLY SERIOUS, AND THAT IS RECORDED ───────
 * The not-found branch never renders: Next discards a route's generateMetadata
 * when the segment calls notFound(), so a missing slug serves the ROOT layout's
 * default title. Its doubled brand was latent. The FOUND-course branch shipped,
 * on every published masterclass — curl'd on a production build, the served
 * title read
 *     Claude AI for Data Analyst | Masterclass — 9Expert Training | 9Expert Training
 * and now reads
 *     Claude AI for Data Analyst | Masterclass | 9Expert Training
 */
test('neither masterclass detail title carries the brand — both read the shared segment', () => {
  const { code, withImports } = readSource("src/app/(public)/masterclass/[slug]/page.jsx");

  // 1. THE BRAND IS NOT SPELLED ANYWHERE IN THE ROUTE'S CODE — whole file, not
  //    one statement. Comments are stripped, so the docblocks that quote the
  //    old strings in order to explain their removal cannot satisfy this.
  //
  //    The route has no legitimate reason to spell the brand: the root
  //    template appends it to metadata.title, and shareTitle composes it from
  //    siteConfig.name for the share cards. So ANY occurrence is a failure,
  //    which is the assertion a single-statement scan could not make.
  assert.ok(
    !code.includes('Masterclass — 9Expert Training'),
    'a branded title literal is back — the root template would append the brand again'
  );
  assert.ok(
    !code.includes(siteConfig.name),
    'the route spells the brand literally; it must come from siteConfig.name'
  );

  // 2. and the segment comes from this module, not from a second spelling.
  //    The import is read from `withImports` and the USE from `code`, which is
  //    the distinction sourceScan's header insists on: an import-line check read
  //    from `code` passes vacuously, and a use-check read from `withImports` is
  //    satisfied by the import alone.
  assert.ok(
    withImports.includes("import { MASTERCLASS_TITLE } from '@/lib/seo/masterclassListJsonLd'"),
    'the route no longer imports the shared title constant'
  );
  //    Both branches' metadata.title, each reading the segment.
  assert.ok(
    code.includes('const title = MASTERCLASS_TITLE;'),
    'the not-found metadata.title is not the shared segment'
  );
  assert.ok(
    code.includes('const title = `${course.title_th} | ${MASTERCLASS_TITLE}`;'),
    'the found-course metadata.title is not built from the shared segment'
  );

  // 3. the share titles are the COMPOSED form, in BOTH branches. No template
  //    applies to og or twitter — the root sets openGraph.title as a plain
  //    string, so a page-level one replaces it outright, and an un-composed
  //    value would ship a card with no brand on it at all.
  assert.ok(
    code.includes('const shareTitle = `${MASTERCLASS_TITLE} | ${siteConfig.name}`;'),
    'the not-found share title is not composed from the segment and the brand'
  );
  assert.ok(
    code.includes('const shareTitle = `${title} | ${siteConfig.name}`;'),
    'the found-course share title is not composed from its title and the brand'
  );
  // and og/twitter really CONSUME shareTitle — two keys in each of two
  // branches. Without this the composition above could be dead code while the
  // cards still shipped the bare, brandless segment.
  assert.equal(
    (code.match(/title: shareTitle/g) || []).length,
    4,
    'og:title and twitter:title, in both branches, must read shareTitle'
  );

  // 4. CONTROL: the scan really read the route, and really sees strings in it.
  assert.ok(code.length > 1000, 'readSource returned something too small to be the route');
  assert.ok(code.includes('generateMetadata'), 'the scan is not looking at the metadata function');
});

test('the layout template is still the shape the name composes', () => {
  const { code } = readSource('src/app/layout.jsx');
  assert.ok(
    code.includes('template: `%s | ${siteConfig.name}`'),
    'the root layout title template changed — this builder must follow it'
  );
});

test('the breadcrumb is หน้าแรก then this page', () => {
  const crumbs = nodeOfType(buildMasterclassListJsonLd(list(2)), 'BreadcrumbList').itemListElement;
  assert.deepEqual(crumbs, [
    { '@type': 'ListItem', position: 1, name: HOME_BREADCRUMB_LABEL, item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: MASTERCLASS_TITLE, item: `${SITE_URL}/masterclass` },
  ]);
});

// ── 4. ordering, counts ───────────────────────────────────────────────────

test('items keep the order they were handed in (display_order from the query)', () => {
  const graph = buildMasterclassListJsonLd([mc(3), mc(1), mc(2)]);
  assert.deepEqual(
    itemsOf(graph).map((e) => e.item.name),
    ['หลักสูตร Masterclass 3', 'หลักสูตร Masterclass 1', 'หลักสูตร Masterclass 2']
  );
  assert.deepEqual(itemsOf(graph).map((e) => e.position), [1, 2, 3]);
});

test('numberOfItems equals the number actually listed', () => {
  const graph = buildMasterclassListJsonLd(list(4));
  const il = nodeOfType(graph, 'ItemList');
  assert.equal(il.numberOfItems, 4);
  assert.equal(il.numberOfItems, il.itemListElement.length);
});

test('positions stay contiguous across a skip', () => {
  const graph = buildMasterclassListJsonLd([mc(1), mc(2, { slug: '  ' }), mc(3), mc(4)]);
  assert.deepEqual(itemsOf(graph).map((e) => e.position), [1, 2, 3]);
  assert.equal(nodeOfType(graph, 'ItemList').numberOfItems, 3);
});

test('a course with no slug or no title is skipped', () => {
  assert.equal(itemsOf(buildMasterclassListJsonLd([mc(1), mc(2, { slug: '' })])).length, 1);
  assert.equal(itemsOf(buildMasterclassListJsonLd([mc(1), mc(2, { title_th: '' })])).length, 1);
});

// ── 5. description: the SHORT field, omitted when blank ───────────────────

test('description is subtitle_th', () => {
  const item = itemsOf(buildMasterclassListJsonLd([mc(1)]))[0].item;
  assert.equal(item.description, 'คำโปรยของหลักสูตร 1');
});

test('a blank subtitle omits the description key entirely', () => {
  for (const subtitle_th of ['', '   ', undefined, null]) {
    const item = itemsOf(buildMasterclassListJsonLd([mc(1, { subtitle_th })]))[0].item;
    assert.ok(
      !('description' in item),
      `subtitle ${JSON.stringify(subtitle_th)} should omit description, got ${item.description}`
    );
  }
});

test('the long body field is never used as the description', () => {
  const item = itemsOf(
    buildMasterclassListJsonLd([
      mc(1, { subtitle_th: '', description_html: '<p>เนื้อหายาวมาก</p>' }),
    ])
  )[0].item;
  assert.ok(!('description' in item));
  assert.ok(!JSON.stringify(item).includes('เนื้อหายาวมาก'), 'description_html leaked in');
});

test('a real subtitle is trimmed', () => {
  const item = itemsOf(buildMasterclassListJsonLd([mc(1, { subtitle_th: '  สั้น ๆ  ' })]))[0].item;
  assert.equal(item.description, 'สั้น ๆ');
});

// ── 6. no batch / price / availability facts ──────────────────────────────

/**
 * The listing is static with revalidate 3600 and batch availability flips on a
 * seat sale, so the facts a buyer acts on stay on the detail page. The fixture
 * deliberately carries batches and prices, so this fails if any leak through.
 */
test('the item Course carries exactly @id, @type, url, name, description, provider', () => {
  const item = itemsOf(buildMasterclassListJsonLd([mc(1)]))[0].item;
  assert.deepEqual(Object.keys(item).sort(), [
    '@id', '@type', 'description', 'name', 'provider', 'url',
  ]);
});

test('no batches, offers, price, availability or instances anywhere in the graph', () => {
  const serialised = JSON.stringify(buildMasterclassListJsonLd(list(3)));
  for (const forbidden of [
    'hasCourseInstance', 'offers', 'price', '8900', '6900',
    'availability', 'InStock', 'batch', 'CourseInstance', 'startDate',
  ]) {
    assert.ok(!serialised.includes(forbidden), `${forbidden} leaked into the listing graph`);
  }
});

// ── 7. empty and degenerate inputs ───────────────────────────────────────

test('no published masterclasses → null, so the page emits nothing', () => {
  assert.equal(buildMasterclassListJsonLd([]), null);
});

test('the shapes a failed read can hand over → null', () => {
  for (const input of [null, undefined, 'not an array', {}]) {
    assert.equal(buildMasterclassListJsonLd(input), null, `${JSON.stringify(input)} should yield null`);
  }
});

test('a list where every course is unnameable → null', () => {
  assert.equal(buildMasterclassListJsonLd([mc(1, { slug: '' }), mc(2, { title_th: '' })]), null);
});

// ── 8. hygiene ───────────────────────────────────────────────────────────

test('no empty string, null or unreplaced placeholder at any depth', () => {
  const walk = (v, path, out) => {
    if (v === null) out.push(`${path} is null`);
    else if (typeof v === 'string') {
      if (v === '') out.push(`${path} is empty`);
      if (v.includes('{{')) out.push(`${path} has a placeholder`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
    else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
    }
    return out;
  };
  const graph = buildMasterclassListJsonLd([mc(1, { subtitle_th: '' }), mc(2)]);
  assert.deepEqual(walk(JSON.parse(JSON.stringify(graph)), '$', []), []);
});

test('a trailing slash on the origin does not produce a double slash', () => {
  const graph = buildMasterclassListJsonLd(list(2), `${OTHER}/`);
  const urls = [];
  (function w(v) {
    if (typeof v === 'string') { if (v.startsWith('http')) urls.push(v); }
    else if (Array.isArray(v)) v.forEach(w);
    else if (v && typeof v === 'object') Object.values(v).forEach(w);
  })(graph);
  for (const url of urls.filter((u) => u !== 'https://schema.org')) {
    assert.ok(!url.slice('https://'.length).includes('//'), `double slash in ${url}`);
  }
});

test('two builds from the same input are byte-identical', () => {
  const l = list(3);
  assert.equal(
    JSON.stringify(buildMasterclassListJsonLd(l)),
    JSON.stringify(buildMasterclassListJsonLd(l))
  );
});
