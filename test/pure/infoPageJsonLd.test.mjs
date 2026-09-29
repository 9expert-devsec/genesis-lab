import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAboutPageJsonLd,
  buildContactPageJsonLd,
  ABOUT_TITLE,
  CONTACT_TITLE,
  HOME_BREADCRUMB_LABEL,
} from '@/lib/seo/infoPageJsonLd';
import { buildHomeJsonLd, homeGraphIds } from '@/lib/seo/homeJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { siteConfig } from '@/config/site';
import { readSource } from '../sourceScan.mjs';

/**
 * /about-us and /contact-us.
 *
 * Pure builders, so these invoke them for real. The load-bearing property is
 * NEGATIVE — these graphs must contain no organisation or venue facts at all —
 * so most of what follows asserts absence, and each absence check carries a
 * control proving it can actually see the thing it forbids.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

const nodesOf = (graph) => graph['@graph'];
const nodeOfType = (graph, type) => nodesOf(graph).find((n) => n['@type'] === type);
const pageNodeOf = (graph) => nodesOf(graph)[0];

const PAGES = [
  { label: '/about-us', build: buildAboutPageJsonLd, type: 'AboutPage', path: '/about-us', title: ABOUT_TITLE },
  { label: '/contact-us', build: buildContactPageJsonLd, type: 'ContactPage', path: '/contact-us', title: CONTACT_TITLE },
];

/** Every key name in a JSON document, at any depth. */
function keysDeep(value, out = []) {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

/** Every string value in a JSON document, at any depth. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) strings(v, out);
  }
  return out;
}

// ── 1. every home reference is byte-identical to homeGraphIds() ─────────────

/**
 * THE ASSERTION THESE GRAPHS EXIST FOR.
 *
 * Asserted against `buildHomeJsonLd`'s ACTUAL OUTPUT, not against homeGraphIds —
 * which both modules import and which would therefore agree with itself even if
 * Home stopped using it.
 */
test('every home @id reference resolves to a node the home graph really emits', () => {
  const home = buildHomeJsonLd();
  const emitted = new Map(nodesOf(home).map((n) => [n['@id'], n['@type']]));

  for (const { label, build } of PAGES) {
    const page = pageNodeOf(build());
    for (const key of ['isPartOf', 'about', 'mainEntity', 'mentions']) {
      if (!page[key]) continue;
      const id = page[key]['@id'];
      assert.ok(
        emitted.has(id),
        `${label}: ${key} -> ${id} is not an @id the home graph emits (it has ${[...emitted.keys()].join(', ')})`
      );
    }
  }
});

test('isPartOf is the WebSite, about is the EducationalOrganization', () => {
  const home = buildHomeJsonLd();
  const websiteId = nodeOfType(home, 'WebSite')['@id'];
  const organizationId = nodeOfType(home, 'EducationalOrganization')['@id'];

  for (const { label, build } of PAGES) {
    const page = pageNodeOf(build());
    assert.equal(page.isPartOf['@id'], websiteId, `${label}: isPartOf`);
    assert.equal(page.about['@id'], organizationId, `${label}: about`);
  }
});

test('/about-us mainEntity is the organisation; /contact-us does not claim one', () => {
  const organizationId = nodeOfType(buildHomeJsonLd(), 'EducationalOrganization')['@id'];
  assert.equal(pageNodeOf(buildAboutPageJsonLd()).mainEntity['@id'], organizationId);
  assert.ok(
    !('mainEntity' in pageNodeOf(buildContactPageJsonLd())),
    'a ContactPage subject is how to make contact, not the organisation itself'
  );
});

test('/contact-us mentions the training Place; /about-us does not', () => {
  const placeId = nodeOfType(buildHomeJsonLd(), 'Place')['@id'];
  assert.equal(pageNodeOf(buildContactPageJsonLd()).mentions['@id'], placeId);
  assert.ok(!('mentions' in pageNodeOf(buildAboutPageJsonLd())));
});

test('the references match homeGraphIds exactly, fragment for fragment', () => {
  const ids = homeGraphIds(SITE_URL);
  const contact = pageNodeOf(buildContactPageJsonLd());
  assert.equal(contact.isPartOf['@id'], ids.website);
  assert.equal(contact.about['@id'], ids.organization);
  assert.equal(contact.mentions['@id'], ids.place);
});

test('CONTROL: the references FOLLOW the origin — composed, not restated', () => {
  const ids = homeGraphIds(OTHER);
  const contact = pageNodeOf(buildContactPageJsonLd(OTHER));
  assert.equal(contact.isPartOf['@id'], `${OTHER}/#website`);
  assert.equal(contact.about['@id'], `${OTHER}/#organization`);
  assert.equal(contact.mentions['@id'], ids.place);
  assert.notEqual(contact.about['@id'], homeGraphIds().organization, 'a hardcoded fragment would ignore the argument');
});

test('changing the origin moves EVERY site URL — no literal host survives', () => {
  for (const { label, build } of PAGES) {
    const moved = JSON.stringify(build(OTHER));
    assert.ok(!moved.includes(SITE_URL), `${label}: a URL still names the production origin`);
  }
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  for (const { label, build } of PAGES) {
    assert.ok(JSON.stringify(build()).includes(SITE_URL), `${label}: the scan must see the origin`);
  }
});

// ── 2. the page @type is right, per page ───────────────────────────────────

test('the graph is exactly the page node then the BreadcrumbList', () => {
  for (const { label, build, type } of PAGES) {
    assert.deepEqual(
      nodesOf(build()).map((n) => n['@type']),
      [type, 'BreadcrumbList'],
      label
    );
  }
});

test('the two pages do NOT share a @type', () => {
  assert.notEqual(
    pageNodeOf(buildAboutPageJsonLd())['@type'],
    pageNodeOf(buildContactPageJsonLd())['@type']
  );
});

test('the page @id and url are the canonical, with no query and no trailing slash', () => {
  for (const { label, build, path } of PAGES) {
    const page = pageNodeOf(build());
    assert.equal(page.url, `${SITE_URL}${path}`, label);
    assert.equal(page['@id'], `${SITE_URL}${path}#webpage`, label);
    assert.ok(!page.url.endsWith('/'), `${label}: trailing slash`);
  }
});

test('breadcrumb points at the id the BreadcrumbList carries', () => {
  for (const { label, build } of PAGES) {
    const graph = build();
    assert.equal(
      pageNodeOf(graph).breadcrumb['@id'],
      nodeOfType(graph, 'BreadcrumbList')['@id'],
      label
    );
  }
});

test('the two pages do not collide on any @id', () => {
  const a = nodesOf(buildAboutPageJsonLd()).map((n) => n['@id']);
  const c = nodesOf(buildContactPageJsonLd()).map((n) => n['@id']);
  assert.equal(a.filter((id) => c.includes(id)).length, 0, `${a.join()} vs ${c.join()}`);
});

// ── 3. name equals the title source ───────────────────────────────────────

test('the page name is the full rendered <title>, not just the segment', () => {
  assert.equal(
    pageNodeOf(buildAboutPageJsonLd()).name,
    `${ABOUT_TITLE} | ${siteConfig.name}`
  );
  assert.equal(
    pageNodeOf(buildContactPageJsonLd()).name,
    `${CONTACT_TITLE} | ${siteConfig.name}`
  );
  assert.equal(pageNodeOf(buildAboutPageJsonLd()).name, 'เกี่ยวกับเรา | 9Expert Training');
  assert.equal(pageNodeOf(buildContactPageJsonLd()).name, 'ติดต่อเรา | 9Expert Training');
});

/**
 * The one duplication in the builder, guarded rather than trusted. If the root
 * layout's separator changes, this goes red here instead of the graphs quietly
 * describing titles the pages no longer have.
 */
test('the layout template is still the shape renderedTitle composes', () => {
  const { code } = readSource('src/app/layout.jsx');
  assert.ok(
    code.includes('template: `%s | ${siteConfig.name}`'),
    'the root layout title template changed — infoPageJsonLd.renderedTitle must follow it'
  );
});

test('the breadcrumb is หน้าแรก at the origin then this page at its canonical', () => {
  for (const { label, build, path, title } of PAGES) {
    const crumbs = nodeOfType(build(), 'BreadcrumbList').itemListElement;
    assert.deepEqual(
      crumbs,
      [
        { '@type': 'ListItem', position: 1, name: HOME_BREADCRUMB_LABEL, item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: title, item: `${SITE_URL}${path}` },
      ],
      label
    );
  }
});

// ── 4. NO organisation or venue facts, at any depth ───────────────────────

/**
 * THE NEGATIVE ASSERTION THIS MODULE IS FOR.
 *
 * Every property schema.org would use to STATE an organisation or place fact,
 * rather than reference one. If any appears, someone has started restating what
 * the home graph already declares, and the two copies will drift — the page and
 * the home graph already disagree in six measured ways, so a copy here would
 * freeze one side of that into structured data.
 */
const FACT_KEYS = [
  'address', 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode',
  'addressCountry', 'telephone', 'email', 'logo', 'image', 'sameAs', 'geo',
  'latitude', 'longitude', 'openingHoursSpecification', 'opens', 'closes',
  'hasMap', 'contactPoint', 'founder', 'legalName', 'alternateName', 'taxID',
  'faxNumber', 'vatID', 'location',
];

test('no organisation or venue fact key appears at any depth', () => {
  for (const { label, build } of PAGES) {
    const present = keysDeep(build()).filter((k) => FACT_KEYS.includes(k));
    assert.deepEqual(present, [], `${label}: restated ${present.join(', ')}`);
  }
});

test('CONTROL: the key scan really does find those keys when they are planted', () => {
  const planted = {
    '@graph': [
      { '@type': 'ContactPage', address: { '@type': 'PostalAddress', postalCode: '10400' } },
      { '@type': 'Place', telephone: '+6622194304', geo: { latitude: 13.75 } },
    ],
  };
  const found = keysDeep(planted).filter((k) => FACT_KEYS.includes(k));
  assert.ok(found.includes('address'), 'address');
  assert.ok(found.includes('postalCode'), 'postalCode');
  assert.ok(found.includes('telephone'), 'telephone');
  assert.ok(found.includes('geo'), 'geo');
  assert.ok(found.includes('latitude'), 'latitude');
});

/**
 * The same claim from the other direction: no VALUE from the live contact
 * details may appear either. A fact can be restated under an unexpected key name
 * and the key scan above would miss it.
 */
test('no live contact VALUE appears anywhere in either graph', () => {
  const forbidden = [
    '10400', '+6622194304', '02-219-4304', '086-322-2423',
    'training@9expert.co.th', 'instructor@9expert.co.th', 'sponsor@9expert.co.th',
    '0105548019065', 'เอเวอร์กรีน', 'ราชเทวี', 'maps.app.goo.gl',
    '13.750661', '100.531117', '08:00', '17:00', 'line.me', 'tiktok.com',
  ];
  for (const { label, build } of PAGES) {
    const serialised = JSON.stringify(build());
    for (const value of forbidden) {
      assert.ok(!serialised.includes(value), `${label}: leaked contact value ${value}`);
    }
  }
});

test('CONTROL: those values ARE present in the home graph — it is the one that states them', () => {
  const home = JSON.stringify(buildHomeJsonLd());
  for (const value of ['10400', '+6622194304', 'training@9expert.co.th', 'maps.app.goo.gl']) {
    assert.ok(home.includes(value), `the home graph must state ${value}, or the reference points at nothing`);
  }
});

/**
 * Nothing but `@id` inside a reference. `{'@id': x, name: 'y'}` is a node that
 * ASSERTS a name, not a pointer to one — the subtlest way a fact creeps back in.
 */
test('every reference object carries @id and nothing else', () => {
  for (const { label, build } of PAGES) {
    const page = pageNodeOf(build());
    for (const key of ['isPartOf', 'about', 'mainEntity', 'mentions', 'breadcrumb']) {
      if (!page[key]) continue;
      assert.deepEqual(Object.keys(page[key]), ['@id'], `${label}: ${key} carries more than @id`);
    }
  }
});

test('the page node carries exactly the agreed keys and no more', () => {
  assert.deepEqual(Object.keys(pageNodeOf(buildAboutPageJsonLd())).sort(), [
    '@id', '@type', 'about', 'breadcrumb', 'inLanguage', 'isPartOf', 'mainEntity', 'name', 'url',
  ]);
  assert.deepEqual(Object.keys(pageNodeOf(buildContactPageJsonLd())).sort(), [
    '@id', '@type', 'about', 'breadcrumb', 'inLanguage', 'isPartOf', 'mentions', 'name', 'url',
  ]);
});

// ── 5. hygiene ────────────────────────────────────────────────────────────

test('inLanguage is th and @context is the schema.org vocabulary', () => {
  for (const { label, build } of PAGES) {
    const graph = build();
    assert.equal(graph['@context'], 'https://schema.org', label);
    assert.equal(pageNodeOf(graph).inLanguage, 'th', label);
  }
});

test('the @context vocabulary is NOT rewritten by the origin', () => {
  assert.equal(buildContactPageJsonLd(OTHER)['@context'], 'https://schema.org');
});

test('no empty string, null or unreplaced placeholder at any depth', () => {
  for (const { label, build } of PAGES) {
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
    assert.deepEqual(walk(JSON.parse(JSON.stringify(build())), '$', []), [], label);
  }
});

test('a trailing slash on the origin does not produce a double slash', () => {
  for (const { label, build } of PAGES) {
    const graph = build(`${OTHER}/`);
    for (const url of strings(graph).filter((s) => s.startsWith('http') && s !== 'https://schema.org')) {
      assert.ok(!url.slice('https://'.length).includes('//'), `${label}: double slash in ${url}`);
    }
  }
});

test('both builders are deterministic — two calls are byte-identical', () => {
  for (const { label, build } of PAGES) {
    assert.equal(JSON.stringify(build()), JSON.stringify(build()), label);
  }
});
