import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists, walkSources } from '../sourceScan.mjs';
import {
  ALL_TYPE_IDS,
  ALL_TYPE_LABELS,
  BANNER_TYPES,
  BANNER_TYPE_IDS,
  LEGACY_TO_NEW,
  LEGACY_TYPES,
  LEGACY_TYPE_IDS,
  isBannerType,
} from '@/lib/banners/bannerTypes';

/**
 * THE BANNER TYPE IDS LIVE IN ONE MODULE AND NOWHERE ELSE.
 *
 * ── THE DEFECT THIS EXISTS BECAUSE OF ───────────────────────────────────────
 * The five type strings were hand-copied into five files — the mongoose enum,
 * the zod enum, the admin form's dropdown, the admin list's label map, and the
 * carousel's filter — with nothing comparing them. They drifted, and not
 * subtly: the two ADMIN surfaces printed a different NAME for every one of the
 * five types, so an admin picked "Hero Image – Desktop (1920×700)" and saw it
 * listed as "Hero Image (Desktop)" one screen later. Nobody noticed, because
 * nothing could.
 *
 * A copy of an id is worse than a copy of a label: a label that drifts is ugly;
 * an id that drifts silently stops matching stored documents.
 *
 * ── WHY THERE ARE TWO SCANS AND NOT ONE ─────────────────────────────────────
 * The first version of this file was a single repo-wide sweep for all nine ids
 * and it produced SIXTEEN false positives on the first run. The four new ids —
 * 'video', 'image', 'course', 'article' — are ordinary English words that this
 * repo already uses as values in unrelated enums:
 *
 *   CourseExtension.gallery[].type   ['image', 'youtube']
 *   MasterclassCourse.gallery[].type ['image', 'youtube']
 *   Article.articleType              ['article', 'video']
 *   Article.jsonLd.schemaType        ['Article', 'BlogPosting', …]
 *
 * None of those is a banner and none of them should import from a banner
 * module. A repo-wide ban on the word 'image' would be a guard that has to be
 * suppressed everywhere it fires, which is a guard nobody keeps.
 *
 * So the rule is split by what can actually be enforced:
 *
 *   SCAN 1 — the four UNIQUE legacy ids ('image_desktop' and its three
 *            siblings), repo-wide. Nothing else in the codebase can mean these,
 *            so any occurrence is a real copy. These are also the ids that are
 *            STORED in all 22 documents, which makes them the ones whose drift
 *            actually breaks a lookup.
 *
 *   SCAN 2 — all nine ids, but only across the files that read or write banner
 *            records. Inside that set, a bare 'video' or 'youtube' IS a banner
 *            type and IS a copy.
 *
 * Stated plainly because it is a real limit: a new file that handles banners
 * and spells 'video' will not be caught until it is added to BANNER_SURFACES.
 * SCAN 3 exists to make that list decay loudly rather than silently.
 *
 * ── WHY THE SCAN IS ON `.code` ──────────────────────────────────────────────
 * test/sourceScan.mjs strips comments before matching, so the docstring in
 * bannerTypes.js listing every id — and this note — neither satisfy nor violate
 * the rule. Only real code counts.
 *
 * ── WHY A COMPLETE QUOTED LITERAL AND NOT A SUBSTRING ───────────────────────
 * Ids are matched as whole quoted strings, never as substrings.
 * `type.includes('button')` is not a type id and must not trip; neither must a
 * word inside a class string or a URL. This repo has been bitten twice by
 * "is it there" assertions that passed for entirely the wrong reason.
 */

/** Repo-relative paths allowed to contain a banner type literal, with why. */
const ALLOWED = new Map([
  [
    'src/lib/banners/bannerTypes.js',
    'the one home — this is where the literals are supposed to be',
  ],
  [
    // NAMED EXCEPTION, expected to disappear rather than grow.
    // HeroBannerCarousel's `switch (banner.type)` still spells its cases out.
    // The component is DORMANT — Home renders FeatureContentSection in its slot
    // (src/app/page.jsx) — so rewriting a switch that nothing runs would be an
    // unverifiable change. Its FILTER predicate was converted; the switch goes
    // when the component does, in the slice that retires the legacy ids.
    'src/app/_components/home/HeroBannerCarousel.jsx',
    'dormant render switch — converted with the component, not before',
  ],
  // featureContentFromBanners.js WAS listed here for its literal POOL_TYPES.
  // The layout slice converted it to LEGACY_TYPES, so the exception is gone and
  // SCAN 2 now holds it to the same rule as everything else. An exception that
  // is removed when the work lands is the only kind worth having.
]);

/**
 * Files that read or write a banner record. SCAN 2 applies the full nine-id
 * rule here and only here.
 */
const BANNER_SURFACES = [
  'src/models/Banner.js',
  'src/lib/schemas/banner.js',
  'src/lib/actions/banners.js',
  'src/lib/landing/syncLandingData.js',
  'src/lib/home/featureContentFromBanners.js',
  'src/app/page.jsx',
  'src/app/admin/banners/page.jsx',
  'src/app/admin/banners/new/page.jsx',
  'src/app/admin/banners/[id]/edit/page.jsx',
  'src/app/admin/banners/_components/BannerForm.jsx',
  'src/app/admin/banners/_components/AdminBannerList.jsx',
  'src/app/_components/home/HeroBannerCarousel.jsx',
];

/** The ids no other domain in this repo can mean. */
const UNIQUE_LEGACY_IDS = LEGACY_TYPE_IDS.filter((id) => id.startsWith('image_'));

/** Regex-safe literal. */
const lit = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** An id as a COMPLETE quoted literal, in all three JS quote styles. */
const idLiteral = (id) => new RegExp(`(['"\`])${lit(id)}\\1`);

// ── SCAN 1 — the unique ids, repo-wide ──────────────────────────────────────

test('SCAN 1: no unique legacy id is spelled anywhere in src/ but the module', () => {
  const offenders = [];
  for (const src of walkSources('src')) {
    if (ALLOWED.has(src.rel)) continue;
    for (const id of UNIQUE_LEGACY_IDS) {
      if (idLiteral(id).test(src.code)) offenders.push(`${src.rel} → '${id}'`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these files spell a stored banner type id instead of importing it from '
      + `src/lib/banners/bannerTypes.js:\n  ${offenders.join('\n  ')}`
  );
});

// ── SCAN 2 — all nine ids, banner surfaces only ─────────────────────────────

test('SCAN 2: no banner surface spells any of the nine ids', () => {
  const offenders = [];
  for (const rel of BANNER_SURFACES) {
    if (ALLOWED.has(rel)) continue;
    const src = readSource(rel);
    for (const id of ALL_TYPE_IDS) {
      if (idLiteral(id).test(src.code)) offenders.push(`${rel} → '${id}'`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these banner surfaces spell a type id instead of importing it:\n  '
      + offenders.join('\n  ')
  );
});

// ── SCAN 3 — the lists above must not rot ───────────────────────────────────

test('SCAN 3: every named surface and exception still exists', () => {
  // A path that is renamed or deleted turns its entry into a no-op, and both
  // lists then quietly cover less than they claim. This is the check that makes
  // the coverage limit in the header honest rather than aspirational.
  for (const rel of BANNER_SURFACES) {
    assert.ok(sourceExists(rel), `BANNER_SURFACES lists a file that is gone: ${rel}`);
  }
  for (const rel of ALLOWED.keys()) {
    assert.ok(sourceExists(rel), `ALLOWED lists a file that is gone: ${rel}`);
  }
});

test('CONTROL: the matcher really can see a literal', () => {
  // Both scans are "found nothing" assertions, which pass just as happily when
  // the matcher is broken. Point it at the module that DOES contain every id.
  const home = readSource('src/lib/banners/bannerTypes.js');
  const found = ALL_TYPE_IDS.filter((id) => idLiteral(id).test(home.code));
  assert.deepEqual(
    [...found].sort(),
    [...ALL_TYPE_IDS].sort(),
    'the matcher cannot see the literals in the module that defines them — '
      + 'the "nowhere else" results above would be vacuous'
  );
});

test('CONTROL: a substring is not a match', () => {
  // `type.includes('button')` lives in BannerForm and must stay legal.
  assert.equal(idLiteral(BANNER_TYPES.IMAGE).test("type.includes('button')"), false);
  assert.equal(idLiteral(BANNER_TYPES.IMAGE).test("cn('image-wrapper')"), false);
  assert.equal(idLiteral(BANNER_TYPES.IMAGE).test('"image_desktop"'), false);
  assert.equal(idLiteral(BANNER_TYPES.IMAGE).test("startsWith('image')"), true);
});

test('CONTROL: SCAN 1 deliberately ignores the generic four', () => {
  // If someone later widens UNIQUE_LEGACY_IDS to the whole set, this reddens —
  // which is the moment to re-read the header before doing it.
  assert.deepEqual(UNIQUE_LEGACY_IDS.length, 4);
  for (const id of BANNER_TYPE_IDS) {
    assert.equal(UNIQUE_LEGACY_IDS.includes(id), false, `${id} is not unique enough to scan for`);
  }
});

// ── The shape of the module itself ──────────────────────────────────────────

test('the four new ids and the five legacy ids are disjoint', () => {
  const overlap = BANNER_TYPE_IDS.filter((id) => LEGACY_TYPE_IDS.includes(id));
  assert.deepEqual(overlap, [], 'an id cannot be both current and legacy');
  assert.equal(ALL_TYPE_IDS.length, BANNER_TYPE_IDS.length + LEGACY_TYPE_IDS.length);
});

test('every legacy id maps to a CURRENT id, never to another legacy one', () => {
  for (const id of LEGACY_TYPE_IDS) {
    const target = LEGACY_TO_NEW[id];
    assert.ok(target, `${id} has no migration target`);
    assert.ok(
      BANNER_TYPE_IDS.includes(target),
      `${id} maps to '${target}', which is not one of the four new ids`
    );
  }
});

test('every id — old and new — has a label', () => {
  for (const id of ALL_TYPE_IDS) {
    assert.equal(typeof ALL_TYPE_LABELS[id], 'string', `${id} has no label`);
    assert.ok(ALL_TYPE_LABELS[id].length > 0, `${id} has an empty label`);
  }
});

test('the admin label disagreement is gone — one label per id', () => {
  // The regression this closes: two maps, five ids, five different names. There
  // is one map now, so the only way to reintroduce it is to add a second — which
  // SCAN 2 catches.
  const names = Object.values(ALL_TYPE_LABELS);
  assert.equal(
    new Set(names).size,
    names.length,
    'two type ids share a display name, so the list screen cannot tell them apart'
  );
});

test('isBannerType accepts both sets and rejects everything else', () => {
  for (const id of ALL_TYPE_IDS) assert.equal(isBannerType(id), true, id);
  for (const junk of ['', 'Video', 'youtube ', 'image_desktop2', null, undefined, 7, {}]) {
    assert.equal(isBannerType(junk), false, String(junk));
  }
});

test('LEGACY_TYPES and LEGACY_TYPE_IDS cannot drift apart', () => {
  assert.deepEqual(
    [...LEGACY_TYPE_IDS].sort(),
    Object.values(LEGACY_TYPES).sort(),
    'the named ids and the ordered list disagree'
  );
});

test('the schema-facing list is what the transition needs: BOTH sets', () => {
  // Narrowing this to the four new ids before the migration runs would make
  // every stored document fail validation on its next save. That is the
  // ordering constraint the whole rollout is built around, so it is pinned.
  for (const id of LEGACY_TYPE_IDS) {
    assert.ok(ALL_TYPE_IDS.includes(id), `${id} must stay accepted until the data moves`);
  }
  for (const id of BANNER_TYPE_IDS) {
    assert.ok(ALL_TYPE_IDS.includes(id), `${id} must be accepted so new records can be written`);
  }
});
