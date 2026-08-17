import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS, REWRITING_CLASSES, applyEdits, classifyReference, decideReference,
} from '../../scripts/lib/legacy-reference-rewrite.mjs';
import { extractLegacyUrls } from '../../scripts/lib/legacy-url-extract.mjs';
import { APPENDED_FORMATS, IMAGE_EXTENSIONS } from '../../src/lib/legacyTransforms.mjs';

// ── WHAT THIS FILE PINS ─────────────────────────────────────────────────────
//
// Phase 2 edits ~2000 references inside 850 documents, most of them inside
// rich-HTML article bodies. Every failure mode here is silent:
//
//   · a replacement that re-encodes a path produces a URL that 404s, in a diff
//     too large to eyeball;
//   · a replacement that is not idempotent corrupts on the second run;
//   · a byte-range splice that is off by one eats a quote and destroys markup;
//   · rewriting a dead link produces a tidy path that still 404s, which is
//     worse than leaving it obviously broken.
//
// None of those throw. Tests are the only thing standing between them and
// production.

const CTX = {
  deadPaths: new Set(['/sites/default/files/articles/images/gone.png']),
  supersededBy: new Map([[
    '/sites/default/files/articles/images/cloudflare-published-application-routes.jpeg',
    '/sites/default/files/articles/images/cloudflare-published-application-routes.png',
  ]]),
  ampersandPaths: new Set(['/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png']),
  appendedFormats: APPENDED_FORMATS,
  imageExtensions: IMAGE_EXTENSIONS,
};

const classify = (raw) => classifyReference(raw, CTX);

// ── CLASS 1 — direct absolute / protocol-relative ───────────────────────────

test('class 1: an absolute legacy URL becomes a root-relative path', () => {
  const r = classify('https://www.9experttraining.com/sites/default/files/articles/cover/x.png');
  assert.equal(r.cls, CLASS.DIRECT);
  assert.equal(r.replacement, '/sites/default/files/articles/cover/x.png');
});

test('class 1: the apex host and http are handled as well as https://www', () => {
  for (const u of [
    'http://9experttraining.com/images/a.png',
    'https://9experttraining.com/images/a.png',
    '//www.9experttraining.com/images/a.png',
  ]) {
    assert.equal(classify(u).replacement, '/images/a.png', `failed for ${u}`);
  }
});

test('class 1: percent-encoding is preserved BYTE FOR BYTE, never normalised', () => {
  // Decoding and re-encoding would silently rewrite thousands of values into a
  // shape nobody reviewed, and a `%20` that became a literal space would not
  // survive the trip back through a URL parser.
  const raw = 'https://www.9experttraining.com/sites/default/files/articles/cover/a%20b%20%281%29.png';
  assert.equal(classify(raw).replacement, '/sites/default/files/articles/cover/a%20b%20%281%29.png');
});

test('class 1: a literal Thai filename survives unchanged', () => {
  const raw = 'https://www.9experttraining.com/sites/default/files/articles/cover/ปกคลิป.png';
  assert.equal(classify(raw).replacement, '/sites/default/files/articles/cover/ปกคลิป.png');
});

test('class 1: the query string is dropped — delivery does not use it', () => {
  const r = classify('https://www.9experttraining.com/images/a.png?v=2#frag');
  assert.equal(r.replacement, '/images/a.png');
});

// ── CLASS 2 — Drupal derivative ─────────────────────────────────────────────

test('class 2: a derivative resolves to its SOURCE, not its derivative path', () => {
  const r = classify('https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/foo.png.webp?itok=GD4R3SWk');
  assert.equal(r.cls, CLASS.DERIVATIVE);
  assert.equal(r.replacement, '/sites/default/files/articles/cover/foo.png');
});

test('class 2: the itok HMAC is dropped, not carried through', () => {
  const r = classify('/sites/default/files/styles/large_cover/public/a/b.jpg.webp?itok=abc123');
  assert.equal(r.replacement, '/sites/default/files/a/b.jpg');
  assert.ok(!r.replacement.includes('itok'));
});

test('class 2: a derivative that appended nothing still loses styles/public', () => {
  const r = classify('/sites/default/files/styles/thumbnail/public/a/plain.png');
  assert.equal(r.cls, CLASS.DERIVATIVE);
  assert.equal(r.replacement, '/sites/default/files/a/plain.png');
});

test('class 2: an ambiguous dotted name is NOT stripped and is refused, not guessed', () => {
  // `2024` is not an image extension, so `.webp` is this file's real extension.
  // resolveDerivative flags it low-confidence; this must decline rather than
  // invent `report.2024`.
  const r = classify('/sites/default/files/styles/large_cover/public/docs/report.2024.webp');
  assert.equal(r.cls, CLASS.UNCLASSIFIED);
  assert.equal(r.replacement, null);
});

test('class 2: encoding is preserved through the derivative strip', () => {
  const r = classify('/sites/default/files/styles/large_cover/public/articles/cover/a%20b.png.webp');
  assert.equal(r.replacement, '/sites/default/files/articles/cover/a%20b.png');
});

// ── CLASS 3 — the superseded .jpeg ──────────────────────────────────────────

test('class 3: the superseded .jpeg points at the surviving .png', () => {
  const r = classify('https://www.9experttraining.com/sites/default/files/articles/images/cloudflare-published-application-routes.jpeg');
  assert.equal(r.cls, CLASS.SUPERSEDED);
  assert.equal(r.replacement, '/sites/default/files/articles/images/cloudflare-published-application-routes.png');
});

// ── CLASS 4 — the ampersand files ───────────────────────────────────────────

test('class 4: an ampersand file keeps its path and is counted separately', () => {
  const r = classify('https://www.9experttraining.com/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png');
  assert.equal(r.cls, CLASS.AMPERSAND);
  // The path is NOT mapped to the `and` form — the resolver does that lookup.
  assert.equal(r.replacement, '/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png');
});

// ── LEFT ALONE ──────────────────────────────────────────────────────────────

test('an already root-relative reference comes out BYTE-IDENTICAL', () => {
  const raw = '/sites/default/files/articles/cover/x.png';
  const r = classify(raw);
  assert.equal(r.cls, CLASS.ALREADY_RELATIVE);
  assert.equal(r.replacement, null, 'a null replacement is what guarantees the bytes are untouched');
});

test('a confirmed-dead reference is left untouched', () => {
  const r = classify('https://www.9experttraining.com/sites/default/files/articles/images/gone.png');
  assert.equal(r.cls, CLASS.DEAD);
  assert.equal(r.replacement, null);
});

test('a dead DERIVATIVE is judged on its source and left untouched', () => {
  const ctx = { ...CTX, deadPaths: new Set(['/sites/default/files/a/b.png']) };
  const r = classifyReference('/sites/default/files/styles/large_cover/public/a/b.png.webp', ctx);
  assert.equal(r.cls, CLASS.DEAD);
  assert.equal(r.replacement, null);
});

test('a page link is out of scope and never rewritten', () => {
  // These match the audit's host pattern but name a PAGE. Rewriting one would
  // silently repoint it at our route of the same name — a content decision.
  for (const u of [
    'https://www.9experttraining.com/articles/power-automate-คืออะไร',
    'https://www.9experttraining.com/registration/public?class=2602&course=2206',
  ]) {
    const r = classify(u);
    assert.equal(r.cls, CLASS.NOT_A_FILE, `${u} was classified ${r.cls}`);
    assert.equal(r.replacement, null);
  }
});

// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────

test('every class is idempotent — a second pass changes nothing', () => {
  const inputs = [
    'https://www.9experttraining.com/sites/default/files/articles/cover/x.png',
    'https://www.9experttraining.com/sites/default/files/styles/large_cover/public/a/b.png.webp?itok=z',
    'https://www.9experttraining.com/sites/default/files/articles/images/cloudflare-published-application-routes.jpeg',
    'https://www.9experttraining.com/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png',
    '/sites/default/files/articles/cover/x.png',
  ];
  for (const raw of inputs) {
    const first = classify(raw);
    const once = first.replacement ?? raw;
    const second = classifyReference(once, CTX);
    const twice = second.replacement ?? once;
    assert.equal(twice, once, `${raw} is not idempotent: ${once} → ${twice}`);
  }
});

// ── RANGE SPLICING ──────────────────────────────────────────────────────────

test('applyEdits splices only the matched ranges and copies the rest verbatim', () => {
  const body = '<p>a</p><img src="https://www.9experttraining.com/images/a.png" alt="x"><p>b</p>';
  const hits = extractLegacyUrls(body);
  assert.equal(hits.length, 1);
  const r = classify(hits[0].url);
  const out = applyEdits(body, [{ start: hits[0].start, end: hits[0].end, replacement: r.replacement }]);
  assert.equal(out, '<p>a</p><img src="/images/a.png" alt="x"><p>b</p>');
});

test('a body with many references rewrites every one and nothing else', () => {
  const body = [
    '<p>intro</p>',
    '<img src="https://www.9experttraining.com/sites/default/files/articles/images/one.png">',
    '<p>middle &amp; text</p>',
    '<img src="https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/images/two.png.webp?itok=q">',
    '<a href="/sites/default/files/articles/images/three.png">already fine</a>',
  ].join('');
  const hits = extractLegacyUrls(body);
  const edits = [];
  for (const h of hits) {
    const r = classify(h.url);
    if (REWRITING_CLASSES.has(r.cls) && r.replacement !== null) {
      edits.push({ start: h.start, end: h.end, replacement: r.replacement });
    }
  }
  const out = applyEdits(body, edits);
  assert.ok(out.includes('src="/sites/default/files/articles/images/one.png"'));
  assert.ok(out.includes('src="/sites/default/files/articles/images/two.png"'));
  assert.ok(out.includes('href="/sites/default/files/articles/images/three.png"'), 'the already-correct one changed');
  assert.ok(out.includes('<p>middle &amp; text</p>'), 'prose between references was altered');
  assert.ok(!out.includes('9experttraining.com'), 'a host survived the rewrite');
  assert.ok(!out.includes('itok'), 'an itok survived the rewrite');
});

test('CONTROL — applyEdits throws on overlapping ranges rather than corrupting', () => {
  assert.throws(
    () => applyEdits('abcdef', [
      { start: 0, end: 4, replacement: 'X' },
      { start: 2, end: 6, replacement: 'Y' },
    ]),
    /overlapping edits/,
  );
});

test('CONTROL — applyEdits with no edits returns the identical string', () => {
  const s = '<p>nothing to do</p>';
  assert.equal(applyEdits(s, []), s);
});

// ── THE INVARIANT THE WHOLE PROJECT RESTS ON ────────────────────────────────

test('no replacement ever contains a transformation, a width, or a host', () => {
  const inputs = [
    'https://www.9experttraining.com/sites/default/files/articles/cover/x.png',
    'https://www.9experttraining.com/sites/default/files/styles/large_cover/public/a/b.png.webp?itok=z',
    '//9experttraining.com/images/a.png',
  ];
  for (const raw of inputs) {
    const { replacement } = classify(raw);
    if (replacement === null) continue;
    assert.ok(replacement.startsWith('/'), `${replacement} is not root-relative`);
    assert.doesNotMatch(replacement, /9experttraining\.com/, `${replacement} kept the host`);
    assert.doesNotMatch(replacement, /\b(?:f_webp|f_auto|q_auto|q_\d+|w_\d+|c_limit)\b/, `${replacement} baked in a transformation`);
    assert.doesNotMatch(replacement, /[?#]/, `${replacement} kept a query or fragment`);
    assert.doesNotMatch(replacement, /\/styles\//, `${replacement} kept a Drupal style segment`);
  }
});

// ── THE MANIFEST LAYER ──────────────────────────────────────────────────────
//
// Three references resolve on EVIDENCE rather than on the rule. The pattern
// refuses them and is right to: `thailand-4.0.png` could be a dotted filename
// or a Drupal `.png` conversion of `thailand-4.0`, and nothing in the path
// says which. legacy_file_migrations records only files that were actually
// downloaded and uploaded, so it answers what the path cannot.
//
// The layering is the thing being pinned here. If the manifest layer ever
// merges into the pattern, the pattern starts guessing — right for these
// three, wrong for the first genuinely-converted `chart.2.webp` someone
// uploads — and the report loses the ability to say which references rest on
// evidence.

const AMBIGUOUS = '/sites/default/files/styles/large_cover/public/articles/cover/thailand-4.0.png';
const AMBIGUOUS_SOURCE = '/sites/default/files/articles/cover/thailand-4.0.png';

const withManifest = (paths) => ({ ...CTX, manifestHas: (p) => paths.has(p) });

test('manifest layer: the pattern still refuses on its own', () => {
  const r = classifyReference(AMBIGUOUS, CTX);
  assert.equal(r.cls, CLASS.UNCLASSIFIED);
  assert.equal(r.replacement, null);
  // …but it hands the candidate forward rather than hiding it.
  assert.equal(r.candidateDecoded, AMBIGUOUS_SOURCE);
});

test('manifest layer: a candidate present as uploaded resolves the reference', () => {
  const ctx = withManifest(new Set([AMBIGUOUS_SOURCE]));
  const r = decideReference(AMBIGUOUS, ctx);
  assert.equal(r.cls, CLASS.MANIFEST_RESOLVED);
  assert.equal(r.replacement, AMBIGUOUS_SOURCE);
});

test('manifest layer: an ABSENT candidate leaves the reference untouched', () => {
  const ctx = withManifest(new Set());
  const r = decideReference(AMBIGUOUS, ctx);
  assert.equal(r.cls, CLASS.UNCLASSIFIED);
  assert.equal(r.replacement, null);
  assert.match(r.reason, /NOT in the migration manifest/);
});

test('manifest layer: a manifest-resolved candidate that is DEAD is not rewritten', () => {
  const ctx = {
    ...withManifest(new Set([AMBIGUOUS_SOURCE])),
    deadPaths: new Set([AMBIGUOUS_SOURCE]),
  };
  const r = decideReference(AMBIGUOUS, ctx);
  assert.equal(r.cls, CLASS.DEAD);
  assert.equal(r.replacement, null);
});

test('manifest layer: manifest-resolved is a DISTINCT class from pattern-resolved', () => {
  // A high-confidence derivative must never be labelled manifest-resolved,
  // even when the manifest happens to contain it — otherwise the report can no
  // longer tell evidence from rule.
  const ctx = withManifest(new Set(['/sites/default/files/a/b.png']));
  const r = decideReference('/sites/default/files/styles/large_cover/public/a/b.png.webp', ctx);
  assert.equal(r.cls, CLASS.DERIVATIVE);
});

test('CONTROL — the manifest layer never touches a class the pattern decided', () => {
  const ctx = withManifest(new Set(['/anything']));
  for (const raw of [
    'https://www.9experttraining.com/images/a.png',
    '/sites/default/files/articles/cover/x.png',
    'https://www.9experttraining.com/articles/some-page',
  ]) {
    const pattern = classifyReference(raw, ctx);
    const decided = decideReference(raw, ctx);
    assert.equal(decided.cls, pattern.cls, `${raw} was re-classified by the evidence layer`);
    assert.equal(decided.replacement, pattern.replacement);
  }
});

test('manifest-resolved output obeys the same invariant as every other class', () => {
  const ctx = withManifest(new Set([AMBIGUOUS_SOURCE]));
  const { replacement } = decideReference(AMBIGUOUS, ctx);
  assert.ok(replacement.startsWith('/'));
  assert.doesNotMatch(replacement, /9experttraining\.com|\/styles\/|[?#]/);
});
