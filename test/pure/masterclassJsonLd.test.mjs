import { test } from 'node:test';
import assert from 'node:assert/strict';

import { masterclassCanonicalUrl, masterclassCourseId } from '@/lib/masterclass/masterclassUrl';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { readSource } from '../sourceScan.mjs';

/**
 * The masterclass detail graph, after the origin fix.
 *
 * ── WHAT THIS EXISTS TO PIN ─────────────────────────────────────────────────
 * The graph used to be built from THREE origins at once: a hardcoded
 * `masterclass.9experttraining.com` for every `@id` and registration URL, a
 * hardcoded www for `provider.url`, and the page's canonical (a fourth
 * expression) for the tag. The subdomain has been a 308 to www at the Vercel
 * domain level since the 2026-09-08 cutover, so it was never an origin the graph
 * should have named.
 *
 * These assert the one-origin property by INVOKING the builder, and the
 * no-literal property by reading its source — a literal that happens to equal
 * SITE_URL satisfies every value comparison until someone changes the env.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

/** A course fixture in the shape getMasterclassBySlug returns. */
const course = (over = {}) => ({
  slug: 'mas-ai-dmc',
  title_th: 'AI for Digital Marketing',
  subtitle_th: 'ใช้ AI ทำการตลาดจริง',
  course_code: 'MAS-AI-DMC',
  time_start: '09:00',
  time_end: '16:00',
  batches: [
    {
      _id: 'b1',
      batch_no: 1,
      status: 'open',
      venue_name: '9Expert Training',
      dates: [{ date: '2026-11-08T00:00:00.000Z' }, { date: '2026-11-09T00:00:00.000Z' }],
      is_early_bird: true,
      price_early_bird: 6900,
      price_normal: 8900,
      early_bird_deadline: '2026-10-31',
    },
  ],
  ...over,
});

const INSTRUCTORS = [{ name: 'Somchai', title: 'Lead Instructor', image_url: 'https://cdn.example/x.png' }];
const FAQS = [{ question_th: 'มีใบรับรองไหม', answer_html: '<p>มี e-Certificate</p>' }];

const nodeOfType = (graph, type) => graph['@graph'].find((n) => n['@type'] === type);

/** Every string value in a JSON document, at any depth. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) strings(v, out);
  }
  return out;
}

/** Absolute URLs in a graph, excluding the schema.org vocabulary. */
const urlsIn = (graph) =>
  strings(graph).filter((s) => s.startsWith('http') && !s.startsWith('https://schema.org'));

/**
 * Every object in a JSON document whose `@type` is `Offer`, at ANY depth.
 *
 * Deliberately a WALK and not `instance.offers` — the point of the assertion
 * below is that no Offer anywhere carries `availability`, including one added
 * later somewhere this file does not currently look (on the Course node, on a
 * nested `priceSpecification`, inside a future `subjectOf`). Reaching in by
 * the known path would pass against exactly the regression it guards.
 */
function offersIn(value, out = []) {
  if (Array.isArray(value)) for (const v of value) offersIn(v, out);
  else if (value !== null && typeof value === 'object') {
    if (value['@type'] === 'Offer') out.push(value);
    for (const v of Object.values(value)) offersIn(v, out);
  }
  return out;
}

// ── 1. masterclassCanonicalUrl ─────────────────────────────────────────────

test('the canonical is the origin plus /masterclass/<slug>', () => {
  assert.equal(masterclassCanonicalUrl('mas-ai-dmc'), `${SITE_URL}/masterclass/mas-ai-dmc`);
});

test('a trailing slash on the base does not produce a double slash', () => {
  assert.equal(
    masterclassCanonicalUrl('mas-ai-dmc', `${OTHER}/`),
    `${OTHER}/masterclass/mas-ai-dmc`
  );
  assert.equal(
    masterclassCanonicalUrl('mas-ai-dmc', `${OTHER}///`),
    `${OTHER}/masterclass/mas-ai-dmc`
  );
});

test('no canonical ever carries a double slash after the scheme', () => {
  for (const base of [OTHER, `${OTHER}/`, SITE_URL, `${SITE_URL}/`]) {
    const url = masterclassCanonicalUrl('mas-ai-dmc', base);
    assert.ok(!url.slice('https://'.length).includes('//'), `double slash in ${url}`);
  }
});

test('CONTROL: the canonical FOLLOWS the origin — it is composed, not restated', () => {
  assert.equal(masterclassCanonicalUrl('x', OTHER), `${OTHER}/masterclass/x`);
  assert.notEqual(masterclassCanonicalUrl('x', OTHER), masterclassCanonicalUrl('x'));
});

test('the Course @id is the canonical plus #course — the shape kept from before', () => {
  assert.equal(masterclassCourseId('mas-ai-dmc'), `${SITE_URL}/masterclass/mas-ai-dmc#course`);
  assert.equal(
    masterclassCourseId('mas-ai-dmc'),
    `${masterclassCanonicalUrl('mas-ai-dmc')}#course`,
    'the id must be the canonical plus a fragment, so stripping the fragment gives the url'
  );
});

// ── 2. the graph names ONE origin ──────────────────────────────────────────

/**
 * THE ASSERTION THIS ROUND EXISTS FOR. Swap the origin and nothing may still
 * name the old one — which is what would catch the `BASE_URL` literal, the
 * `provider.url` literal, or a new one added later.
 */
test('every URL in the graph is built from the origin passed in', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS, OTHER);
  for (const url of urlsIn(graph)) {
    assert.ok(
      url === OTHER || url.startsWith(`${OTHER}/`) || url.startsWith('https://cdn.example/'),
      `not on the passed origin: ${url}`
    );
  }
});

test('the superseded masterclass subdomain appears NOWHERE', () => {
  for (const siteUrl of [undefined, OTHER]) {
    const serialised = JSON.stringify(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS, siteUrl));
    assert.ok(
      !serialised.includes('masterclass.9experttraining.com'),
      'the subdomain is a 308 to www and must not be named in structured data'
    );
  }
});

test('changing the origin moves EVERY site URL — no literal host survives', () => {
  const moved = JSON.stringify(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS, OTHER));
  assert.ok(!moved.includes(SITE_URL), 'a URL still names the production origin — it is hardcoded');
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  const real = JSON.stringify(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS));
  assert.ok(real.includes(SITE_URL), 'the scan must see the origin, or it proves nothing');
});

test('the builder defaults to SITE_URL when given no origin', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS);
  assert.equal(nodeOfType(graph, 'Course')['@id'], `${SITE_URL}/masterclass/mas-ai-dmc#course`);
});

test('a trailing slash on the base cannot produce //#organization beside a clean url', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS, `${OTHER}/`);
  for (const url of urlsIn(graph).filter((u) => u.startsWith(OTHER))) {
    assert.ok(!url.slice('https://'.length).includes('//'), `double slash in ${url}`);
  }
});

/**
 * The builder must not spell the origin itself. Read from `code` (imports and
 * comments stripped), so neither the import line nor the docblock explaining the
 * old literal can satisfy it.
 */
test('generateJsonLd.js spells no origin as a literal', () => {
  const { code } = readSource('src/lib/masterclass/generateJsonLd.js');
  for (const literal of ['masterclass.9experttraining.com', '9experttraining', 'http://', 'https://www']) {
    assert.ok(!code.includes(literal), `origin literal left in the builder: ${literal}`);
  }
});

test('CONTROL: that scan fires when the old BASE_URL is planted back', () => {
  const { code } = readSource('src/lib/masterclass/generateJsonLd.js');
  const poisoned = `${code}\nconst B = 'https://masterclass.9experttraining.com';`;
  assert.ok(poisoned.includes('masterclass.9experttraining.com'), 'the scan must catch a re-added literal');
});

// ── 3. the Course node's identity and url ─────────────────────────────────

test('the Course carries BOTH @id and url — url was missing entirely before', () => {
  const node = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS), 'Course');
  assert.equal(node.url, masterclassCanonicalUrl('mas-ai-dmc'));
  assert.equal(node['@id'], masterclassCourseId('mas-ai-dmc'));
  assert.equal(node['@id'], `${node.url}#course`, 'the id is the url plus the fragment');
});

test('the FAQPage @id is on the same canonical', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS);
  assert.equal(nodeOfType(graph, 'FAQPage')['@id'], `${masterclassCanonicalUrl('mas-ai-dmc')}#faq`);
});

test('every offer registration URL is on the same canonical', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS);
  const offers = nodeOfType(graph, 'Course').hasCourseInstance[0].offers;
  for (const offer of offers) {
    assert.equal(offer.url, `${masterclassCanonicalUrl('mas-ai-dmc')}/register?batch=b1`);
  }
});

// ── 4. provider and worksFor REFERENCE the home organisation ──────────────

test('provider is the home graph\'s organisation @id and nothing else', () => {
  const node = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS), 'Course');
  assert.deepEqual(node.provider, { '@id': homeGraphIds().organization });
  assert.deepEqual(Object.keys(node.provider), ['@id'], 'a reference carries @id only');
});

test('instructor worksFor is the SAME organisation @id — not a fourth anonymous one', () => {
  const node = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS), 'Course');
  assert.deepEqual(node.instructor[0].worksFor, { '@id': homeGraphIds().organization });
  assert.equal(node.instructor[0].worksFor['@id'], node.provider['@id']);
});

test('no inline Organization object survives anywhere in the graph', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS);
  const types = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v['@type'] === 'string') types.push(v['@type']);
      Object.values(v).forEach(walk);
    }
  })(graph);
  assert.ok(!types.includes('Organization'), `an inline Organization remains: ${types.join(', ')}`);
});

test('the references follow the origin too', () => {
  const node = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS, OTHER), 'Course');
  assert.equal(node.provider['@id'], `${OTHER}/#organization`);
  assert.equal(node.instructor[0].worksFor['@id'], `${OTHER}/#organization`);
});

// ── 5. everything else is UNCHANGED ──────────────────────────────────────

/**
 * The instance content — dates, mode, venue, prices, the early-bird deadline —
 * is what the origin round explicitly left alone. These pin that it did not move
 * by accident.
 *
 * `availability` is the one field that HAS moved, and it moved OUT: see the
 * assertion below and the builder's own note. The ISR staleness these tests
 * used to record as out-of-scope is the whole reason it went.
 */
test('hasCourseInstance still carries dates, mode, location and both offers', () => {
  const instance = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS), 'Course')
    .hasCourseInstance[0];
  assert.equal(instance.name, 'AI for Digital Marketing - รุ่นที่ 1');
  assert.equal(instance.courseMode, 'onsite');
  assert.equal(instance.startDate, '2026-11-08T09:00:00+07:00');
  assert.equal(instance.endDate, '2026-11-09T16:00:00+07:00');
  assert.equal(instance.location.name, '9Expert Training');
  assert.equal(instance.location.address.addressLocality, 'Bangkok');
  assert.equal(instance.offers.length, 2);
});

test('the offers still carry price, currency and priceValidUntil', () => {
  const [eb, regular] = nodeOfType(generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS), 'Course')
    .hasCourseInstance[0].offers;
  assert.equal(eb.name, 'Early Bird Price');
  assert.equal(eb.price, 6900);
  assert.equal(eb.priceCurrency, 'THB');
  assert.equal(eb.priceValidUntil, '2026-10-31T23:59:59+07:00');
  assert.deepEqual(eb.priceSpecification, {
    '@type': 'PriceSpecification',
    valueAddedTaxIncluded: false,
  });
  assert.equal(eb.url, `${SITE_URL}/masterclass/mas-ai-dmc/register?batch=b1`);
  assert.equal(regular.name, 'Regular Price');
  assert.equal(regular.price, 8900);
  assert.equal(regular.priceCurrency, 'THB');
  assert.deepEqual(regular.priceSpecification, {
    '@type': 'PriceSpecification',
    valueAddedTaxIncluded: false,
  });
  assert.equal(regular.url, `${SITE_URL}/masterclass/mas-ai-dmc/register?batch=b1`);
});

/**
 * NO OFFER CARRIES `availability`, AT ANY DEPTH.
 *
 * ── WHY THIS IS A WALK AND NOT TWO `assert.ok(!('availability' in o))` ──────
 * The builder had two independent availability expressions — the Early Bird's
 * from the deadline, the Regular Price's from `batch.status` — and the reason
 * they went is a property of the PAGE, not of either expression: the route is
 * ISR with revalidate 3600, so a sold-out batch keeps serving InStock for up to
 * an hour. That reason applies to any Offer this builder ever emits, so the
 * assertion is over all of them rather than over the two that exist today.
 *
 * Both fixture branches are exercised on purpose. The default course() has an
 * open batch inside its early-bird window — the case that used to produce
 * InStock TWICE, and the one a careless re-introduction would make pass a
 * `!== 'OutOfStock'` check. The second has a full batch past its deadline — the
 * case that used to produce OutOfStock, and the honest-but-stale claim that is
 * the actual defect.
 */
test('no Offer carries availability, at any depth, in either batch state', () => {
  const stale = course({
    batches: [
      {
        ...course().batches[0],
        status: 'full',
        early_bird_deadline: '2020-01-01',
      },
    ],
  });

  for (const [label, graph] of [
    ['open batch, inside the early-bird window', generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS)],
    ['full batch, past the deadline', generateMasterclassJsonLd(stale, INSTRUCTORS, FAQS)],
  ]) {
    const offers = offersIn(graph);
    // CONTROL: the walk really found them. `for (const o of [])` passes.
    assert.equal(offers.length, 2, `${label}: the walk found ${offers.length} offers`);
    for (const o of offers) {
      assert.ok(!('availability' in o), `${label}: ${o.name} still carries availability`);
    }
    // And no schema.org availability token survives anywhere else in the graph
    // either — e.g. moved onto the CourseInstance or the priceSpecification.
    assert.ok(
      !strings(graph).some((s) => s.startsWith('https://schema.org/') && /Stock|Order|SoldOut|Discontinued/.test(s)),
      `${label}: an availability token is still in the graph`
    );
  }
});

test('a cancelled batch is still excluded, and no batches means no instances key', () => {
  const cancelled = generateMasterclassJsonLd(
    course({ batches: [{ _id: 'b9', batch_no: 9, status: 'cancelled', dates: [] }] }),
    INSTRUCTORS,
    FAQS
  );
  assert.ok(!('hasCourseInstance' in nodeOfType(cancelled, 'Course')));
});

test('no FAQs means no FAQPage node', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, []);
  assert.deepEqual(graph['@graph'].map((n) => n['@type']), ['Course']);
});

test('no instructors means no instructor key', () => {
  const node = nodeOfType(generateMasterclassJsonLd(course(), [], FAQS), 'Course');
  assert.ok(!('instructor' in node));
});

test('the graph is Course then FAQPage, and the name/description are untouched', () => {
  const graph = generateMasterclassJsonLd(course(), INSTRUCTORS, FAQS);
  assert.deepEqual(graph['@graph'].map((n) => n['@type']), ['Course', 'FAQPage']);
  const node = nodeOfType(graph, 'Course');
  assert.equal(node.name, 'AI for Digital Marketing | Masterclass');
  assert.equal(node.description, 'ใช้ AI ทำการตลาดจริง');
  assert.equal(node.courseCode, 'MAS-AI-DMC');
  assert.equal(node.educationalCredentialAwarded, 'e-Certificate');
});
