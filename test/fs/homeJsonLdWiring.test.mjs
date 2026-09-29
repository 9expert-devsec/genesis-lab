import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * The two claims about Home's JSON-LD that cannot be invoked.
 *
 * test/pure/homeJsonLd calls the builder for real and asserts its `WebPage.url`
 * equals `siteConfig.url`. That assertion only MEANS "the graph agrees with the
 * canonical tag" while the page's `alternates.canonical` is still built from
 * that same expression — which is a fact about page.jsx, not about the builder.
 * This file pins it, and pins the position of the emitted <script>.
 *
 * Read from `code` (imports and comments stripped): a claim about what the file
 * DOES must not be satisfied by an import line or by prose in a comment — that
 * is defects 1, 2 and 5 in sourceScan.mjs's header.
 */

const PAGE = 'src/app/page.jsx';
const BUILDER = 'src/lib/seo/homeJsonLd.js';
const ORIGIN = 'src/lib/seo/siteUrl.js';

// ── the canonical is the fixed point the pure test leans on ─────────────────

test('Home builds its canonical from siteConfig.url — the value the graph uses', () => {
  const { code } = readSource(PAGE);
  assert.match(
    code,
    /alternates:\s*\{\s*canonical:\s*siteConfig\.url\s*,?\s*\}/,
    'the pure test asserts the graph url equals siteConfig.url; if the canonical stops being '
      + 'built from it, that assertion silently stops meaning anything'
  );
});

test('CONTROL: the same matcher rejects a canonical built from something else', () => {
  const rewritten = 'alternates: { canonical: `${siteConfig.url}/` }';
  assert.ok(
    !/alternates:\s*\{\s*canonical:\s*siteConfig\.url\s*,?\s*\}/.test(rewritten),
    'the matcher must not pass a canonical that has been changed'
  );
});

// ── the page renders the builder, and holds no graph of its own ─────────────

test('the page renders the builder rather than an inline literal', () => {
  const { code } = readSource(PAGE);
  assert.match(code, /JSON\.stringify\(\s*buildHomeJsonLd\(\s*\)\s*\)/);
  assert.ok(
    !code.includes("'@context'") && !code.includes('"@context"'),
    'the graph must live in the builder, not back in the JSX'
  );
});

// ── POSITION: the script stays OUTSIDE <main> ───────────────────────────────

/**
 * fs/heroOverlayOptIn and render/homeHeroSection both assert on the element
 * structure inside <main>. The JSON-LD block sits between the header and the
 * main landmark and must stay there: moving it inside would change that
 * structure without changing a single thing a crawler reads.
 *
 * Bound on the ELEMENT, not on a Tailwind class or a bare attribute name.
 */
test('the JSON-LD script is emitted before <main>, not inside it', () => {
  const { code } = readSource(PAGE);
  const script = code.indexOf('application/ld+json');
  const main = code.indexOf('<main');
  assert.ok(script !== -1, 'the page must still emit a JSON-LD script');
  assert.ok(main !== -1, 'the page must still have a <main> landmark');
  assert.ok(
    script < main,
    'the JSON-LD script moved inside <main> — that changes the structure two already-red '
      + 'Home guards assert on'
  );
});

test('CONTROL: the same comparison catches a script placed inside <main>', () => {
  const moved = '<main id="main"><script type="application/ld+json" /></main>';
  assert.ok(
    !(moved.indexOf('application/ld+json') < moved.indexOf('<main')),
    'the comparison must fail when the script really is inside <main>'
  );
});

// ── no second spelling of the host in the new code ──────────────────────────

/**
 * §0.1: every `@id` and `url` comes from one constant. The builder must compose
 * from its origin argument and never name a host itself.
 *
 * The ORIGIN module is exempt from nothing here — it does not spell the host
 * either; it reads siteConfig, which is where the env resolution already lives.
 * Its docstring names the two non-www spellings still live elsewhere in the
 * repo, and comments are stripped from `code`, so prose cannot satisfy this.
 */
for (const rel of [BUILDER, ORIGIN]) {
  test(`${rel} names no host of its own`, () => {
    const { code } = readSource(rel);
    assert.ok(
      !code.includes('9experttraining'),
      'the origin comes from the constant — a literal host here is the defect'
    );
    assert.ok(
      !code.includes('genesis-lab.9expert.app'),
      'the staging host must not appear either'
    );
  });
}

// ── the contact facts are READ, not spelled ────────────────────────────────

/**
 * The half test/pure/homeJsonLd cannot see.
 *
 * That file asserts the emitted `hasMap`, `geo`, `streetAddress` and `taxID`
 * EQUAL the siteConfig fields — which a literal that happens to match would
 * satisfy perfectly, right up until someone edits one side. These four facts each
 * existed twice before 2026-09-29 and all four pairs had drifted apart, so
 * "equal today" is exactly the property that was already true and still broke.
 *
 * This asserts the values are ABSENT from the builder's source: the only way the
 * graph can carry them is by reading the one field. Read from `code`, so the
 * docblock explaining the round cannot satisfy it.
 */
const FACT_LITERALS = [
  // the ruled values — present in siteConfig, and must not be duplicated here
  'maps.app.goo.gl',
  '13.75021',
  '100.53042',
  '0105548019065',
  'อาคารเอเวอร์กรีน เพลส',
  // the superseded ones — must not survive anywhere in this file
  '8ny66J39HeZ2Yh678',
  '13.750661',
  '100.531117',
  'อาคาร เอเวอร์กรีนเพลส',
];

test(`${BUILDER} spells none of the contact facts as a literal`, () => {
  const { code } = readSource(BUILDER);
  const found = FACT_LITERALS.filter((v) => code.includes(v));
  assert.deepEqual(
    found,
    [],
    `these must come from siteConfig, not be spelled here: ${found.join(', ')}`
  );
});

test('CONTROL: the same scan DOES fire when a fact literal is planted', () => {
  const { code } = readSource(BUILDER);
  const poisoned = `${code}\nconst m = 'https://maps.app.goo.gl/8ny66J39HeZ2Yh678';`;
  const found = FACT_LITERALS.filter((v) => poisoned.includes(v));
  assert.ok(found.includes('8ny66J39HeZ2Yh678'), 'the scan must catch a re-added literal');
  assert.ok(found.includes('maps.app.goo.gl'), 'and the generic host too');
});

test(`${BUILDER} reads each fact from siteConfig by name`, () => {
  const { code } = readSource(BUILDER);
  for (const field of [
    'siteConfig.mapLink',
    'siteConfig.geo.latitude',
    'siteConfig.geo.longitude',
    'siteConfig.addressStreetTh',
    'siteConfig.taxId',
  ]) {
    assert.ok(code.includes(field), `the builder must read ${field}`);
  }
});

test('CONTROL: the host scan DOES fire on a file that spells one out', () => {
  const { code } = readSource('src/config/site.js');
  assert.ok(
    code.includes('9experttraining'),
    'siteConfig is where the host legitimately lives — if the scan cannot see it there, '
      + 'the assertions above pass vacuously'
  );
});
