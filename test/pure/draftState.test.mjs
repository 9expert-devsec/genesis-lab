import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAFT_CONTENT_KEYS,
  LIVE_ONLY_KEYS,
  draftContentSchema,
  pageBuilderSchema,
} from '@/lib/schemas/pageBuilder';
import {
  hasUnpublishedDraft,
  effectiveContent,
  stripDraft,
} from '@/lib/pageBuilder/draftState';

/**
 * Round 1 of the draft/published split — the storage partition and the pure
 * read logic. Nothing here writes a draft; round 2 owns the action layer.
 *
 * The claim under all of it: a published page must not change when the author
 * edits it. Autosave writes the CONTENT half into `draft` on the same document;
 * everything else keeps taking effect immediately.
 */

// ── THE PARTITION ───────────────────────────────────────────────────────────

// Written out, in order, by a human. An EXACT set, never a length floor: a
// "draft everything" list satisfies `length >= 9` and defeats the entire split,
// and so does a list that quietly gains `slug` next month.
const EXPECTED_DRAFT_KEYS = [
  'title',
  'sections',
  'theme',
  'showHeader',
  'showFooter',
  'showStickyCta',
  'seo',
  'jsonLd',
  'promotionCover',
];

const EXPECTED_LIVE_ONLY_KEYS = [
  'slug',
  'pageType',
  'status',
  'publishStartDate',
  'publishEndDate',
  'promotionId',
  'promotionOrder',
  'slugHistory',
];

test('DRAFT_CONTENT_KEYS is exactly the nine content keys', () => {
  assert.deepEqual(DRAFT_CONTENT_KEYS, EXPECTED_DRAFT_KEYS);
});

test('LIVE_ONLY_KEYS is exactly the eight that keep taking effect immediately', () => {
  // slug is identity (unique index, slugHistory, the cross-collection guard,
  // two public routes). pageType is routing — /promotions queries it, and it
  // gates promotionId/promotionOrder, which are live-only themselves. status
  // and the publish window decide visibility: drafting them would mean a page
  // could not be unpublished without publishing.
  assert.deepEqual(LIVE_ONLY_KEYS, EXPECTED_LIVE_ONLY_KEYS);
});

test('the two sets are disjoint', () => {
  const both = DRAFT_CONTENT_KEYS.filter((k) => LIVE_ONLY_KEYS.includes(k));
  assert.deepEqual(both, [], 'a key on both sides would be drafted AND live at once');
});

test('together they cover the editable surface of pageBuilderSchema exactly', () => {
  // LIVE_ONLY_KEYS is derived as "schema keys minus draft keys", so coverage
  // holds structurally — this test guards that the derivation STAYS a
  // derivation. Replace it with a hand list and a forgotten key shows up here.
  const surface = Object.keys(pageBuilderSchema.shape).sort();
  const union = [...DRAFT_CONTENT_KEYS, ...LIVE_ONLY_KEYS].sort();
  assert.deepEqual(union, surface);
});

test('CONTROL: a new field in pageBuilderSchema cannot default into the draft', () => {
  // The derivation puts an unclassified key in LIVE_ONLY_KEYS, where the exact
  // set above reddens and names it. This asserts that direction so the reason
  // the exact-set test is load-bearing is recorded, not just assumed.
  const surface = Object.keys(pageBuilderSchema.shape);
  const unclassified = surface.filter(
    (k) => !EXPECTED_DRAFT_KEYS.includes(k) && !EXPECTED_LIVE_ONLY_KEYS.includes(k)
  );
  assert.deepEqual(unclassified, [], 'a schema key belongs to neither side — decide which');
  assert.ok(
    !DRAFT_CONTENT_KEYS.includes('slug'),
    'slug must never be drafted: a draft slug is a slug the unique index cannot protect'
  );
});

// ── draftContentSchema IS DERIVED, NOT RETYPED ──────────────────────────────

test('draftContentSchema carries exactly the draft keys', () => {
  assert.deepEqual(Object.keys(draftContentSchema.shape), EXPECTED_DRAFT_KEYS);
});

test('every field in draftContentSchema is the SAME zod node as in pageBuilderSchema', () => {
  // Reference identity. `.pick()` reuses the parent's field schemas, so this
  // holds for a derived schema and CANNOT hold for a hand-written twin, however
  // carefully its rules are copied. This is the structural form of the claim;
  // the two behavioural tests below are the readable form of the same thing.
  const notShared = DRAFT_CONTENT_KEYS.filter(
    (k) => draftContentSchema.shape[k] !== pageBuilderSchema.shape[k]
  );
  assert.deepEqual(notShared, [], 'these fields were retyped instead of picked');
});

test("a rule change reaches the draft schema: title's max(200) is enforced there", () => {
  const content = {
    title: 'x'.repeat(201),
    sections: [],
    theme: 'default',
    showHeader: true,
    showFooter: true,
    showStickyCta: false,
    seo: {},
    jsonLd: {},
    promotionCover: '',
  };
  const draftResult = draftContentSchema.safeParse(content);
  const pageResult = pageBuilderSchema.safeParse({ ...content, slug: 'ok-slug' });
  assert.equal(draftResult.success, false, 'the draft schema accepted an over-long title');
  assert.equal(pageResult.success, false, 'the page schema accepted an over-long title');
  // The SAME rule, not merely a rule: same path, same zod code.
  assert.deepEqual(draftResult.error.issues[0].path, ['title']);
  assert.equal(
    draftResult.error.issues[0].code,
    pageResult.error.issues.find((i) => i.path[0] === 'title').code
  );
});

test('the slug regex is ABSENT from the draft schema, because slug is live-only', () => {
  const content = {
    title: 'ok',
    sections: [],
    theme: 'default',
    showHeader: true,
    showFooter: true,
    showStickyCta: false,
    seo: {},
    jsonLd: {},
    promotionCover: '',
  };
  // A slug that the page schema rejects outright rides through the draft schema
  // untouched — and is STRIPPED, because pageBuilderSchema is a plain z.object.
  const bad = { ...content, slug: 'NOT A SLUG!!' };
  const draftResult = draftContentSchema.safeParse(bad);
  assert.equal(draftResult.success, true, 'the draft schema is validating a slug it does not own');
  assert.equal(draftResult.data.slug, undefined, 'the draft schema leaked slug through');
  assert.equal(pageBuilderSchema.safeParse(bad).success, false, 'the page schema stopped enforcing the slug rule');
});

test('the server-managed stamps are NOT in the editable draft surface', () => {
  // savedAt/savedBy are set by the action layer in round 2 — the same reason
  // `preview` sits outside pageBuilderSchema. A client must not be able to
  // submit them.
  assert.equal(draftContentSchema.shape.savedAt, undefined);
  assert.equal(draftContentSchema.shape.savedBy, undefined);
});

// ── THE FOUR PAGE SHAPES ────────────────────────────────────────────────────

const LIVE = {
  slug: 'live-slug',
  title: 'Live title',
  pageType: 'general',
  status: 'published',
  theme: 'default',
  showHeader: true,
  showFooter: false,
  showStickyCta: false,
  publishStartDate: null,
  publishEndDate: null,
  promotionId: '',
  promotionOrder: 0,
  promotionCover: '',
  sections: [{ id: 's1', type: 'hero' }],
  seo: { metaTitle: 'live meta' },
  jsonLd: { mode: 'auto' },
  slugHistory: [],
};

const DRAFT_CONTENT = {
  title: 'Drafted title',
  sections: [{ id: 's2', type: 'text' }],
  theme: 'ai_purple',
  showHeader: false,
  showFooter: true,
  showStickyCta: true,
  seo: { metaTitle: 'draft meta' },
  jsonLd: { mode: 'off' },
  promotionCover: 'https://example.com/cover.jpg',
};

// Every page in production today is this one: the field simply is not there.
// A Mongoose `default` does NOT apply to a document written before the field
// existed and read back through .lean() + a JSON round-trip — `showPinBadge`
// read back undefined exactly this way.
const MISSING_FIELD = { ...LIVE };
const NULL_DRAFT = { ...LIVE, draft: null };
const EMPTY_DRAFT = { ...LIVE, draft: {} };
const POPULATED = {
  ...LIVE,
  draft: { ...DRAFT_CONTENT, savedAt: '2026-08-24T00:00:00.000Z', savedBy: { id: 'u1', name: 'Yani' } },
};

test('hasUnpublishedDraft: only a populated draft counts', () => {
  assert.equal(hasUnpublishedDraft(MISSING_FIELD), false, 'a pre-existing page must not look drafted');
  assert.equal(hasUnpublishedDraft(NULL_DRAFT), false);
  assert.equal(hasUnpublishedDraft(EMPTY_DRAFT), false);
  assert.equal(hasUnpublishedDraft(POPULATED), true);
});

test('hasUnpublishedDraft: {} matches what storage does to it', () => {
  // The model does not set minimize:false, so Mongoose strips an empty object
  // on save: a `draft: {}` written today reads back ABSENT tomorrow. Answering
  // false for both keeps the page's answer stable across that round-trip.
  assert.equal(hasUnpublishedDraft(EMPTY_DRAFT), hasUnpublishedDraft(MISSING_FIELD));
});

test('hasUnpublishedDraft: no page, and non-object drafts, are not drafts', () => {
  assert.equal(hasUnpublishedDraft(null), false);
  assert.equal(hasUnpublishedDraft(undefined), false);
  assert.equal(hasUnpublishedDraft({}), false);
  assert.equal(hasUnpublishedDraft({ draft: [] }), false, 'an array is not a draft');
  assert.equal(hasUnpublishedDraft({ draft: 'yes' }), false, 'a string is not a draft');
});

// ── effectiveContent ────────────────────────────────────────────────────────

test('effectiveContent returns the DRAFT content when there is a draft', () => {
  assert.deepEqual(effectiveContent(POPULATED), DRAFT_CONTENT);
});

test('effectiveContent drops the draft stamps — they are not content', () => {
  const keys = Object.keys(effectiveContent(POPULATED));
  assert.deepEqual(keys, EXPECTED_DRAFT_KEYS);
  assert.ok(!keys.includes('savedAt'));
  assert.ok(!keys.includes('savedBy'));
});

test('effectiveContent returns the LIVE content when the draft is null', () => {
  // The reason this function exists. An existing published page has no draft
  // until its first edit; returning the draft blindly would open it as an EMPTY
  // page, and the first autosave would write that emptiness back as the draft.
  const got = effectiveContent(NULL_DRAFT);
  assert.equal(got.title, 'Live title');
  assert.deepEqual(got.sections, LIVE.sections);
});

test('effectiveContent returns the LIVE content when the field is absent entirely', () => {
  assert.deepEqual(effectiveContent(MISSING_FIELD), effectiveContent(NULL_DRAFT));
  assert.equal(effectiveContent(MISSING_FIELD).title, 'Live title');
});

test('effectiveContent returns the LIVE content for an empty-object draft', () => {
  assert.equal(effectiveContent(EMPTY_DRAFT).title, 'Live title');
});

test('effectiveContent is restricted to DRAFT_CONTENT_KEYS — no live-only key leaks', () => {
  for (const page of [MISSING_FIELD, NULL_DRAFT, EMPTY_DRAFT, POPULATED]) {
    assert.deepEqual(Object.keys(effectiveContent(page)), EXPECTED_DRAFT_KEYS);
  }
  const got = effectiveContent(MISSING_FIELD);
  for (const key of EXPECTED_LIVE_ONLY_KEYS) {
    assert.equal(got[key], undefined, `${key} is live-only and must not appear in content`);
  }
});

test('CONTROL: the draft really does override — the two answers differ', () => {
  // Pairs with the null-draft tests above. If effectiveContent ignored the
  // draft entirely, every test in this block would still pass except this one.
  assert.notDeepEqual(effectiveContent(POPULATED), effectiveContent(NULL_DRAFT));
  assert.equal(effectiveContent(POPULATED).title, 'Drafted title');
  assert.equal(effectiveContent(NULL_DRAFT).title, 'Live title');
});

test('effectiveContent omits a key the source does not own, rather than inventing undefined', () => {
  const sparse = { draft: { title: 'only a title' } };
  assert.deepEqual(Object.keys(effectiveContent(sparse)), ['title']);
});

test('effectiveContent does not merge a partial draft with the live page', () => {
  // Wholesale, on purpose: round 2 writes the whole content surface at once, so
  // a partial draft is a MALFORMED draft. Merging would produce a page half
  // from each side — a state no author ever authored — and hide the defect.
  const partial = { ...LIVE, draft: { title: 'Drafted title' } };
  const got = effectiveContent(partial);
  assert.deepEqual(Object.keys(got), ['title']);
  assert.equal(got.sections, undefined, 'live sections were merged into a partial draft');
});

// ── stripDraft ──────────────────────────────────────────────────────────────

test('stripDraft removes the draft and NOTHING else', () => {
  const got = stripDraft(POPULATED);
  assert.equal('draft' in got, false, 'the draft survived');
  // Byte-identical on the rest, not merely "draft is gone": the exact remaining
  // key list AND the exact remaining values.
  assert.deepEqual(Object.keys(got), Object.keys(LIVE));
  assert.deepEqual(got, LIVE);
  assert.equal(JSON.stringify(got), JSON.stringify(LIVE));
});

test('stripDraft does not mutate its input', () => {
  const page = { ...LIVE, draft: { ...DRAFT_CONTENT } };
  stripDraft(page);
  assert.equal(hasUnpublishedDraft(page), true, 'the caller lost its draft');
});

test('stripDraft leaves a page that never had the key untouched', () => {
  const got = stripDraft(MISSING_FIELD);
  assert.deepEqual(got, MISSING_FIELD);
  assert.deepEqual(Object.keys(got), Object.keys(LIVE));
});

test('stripDraft removes a null draft too — no key is left behind', () => {
  const got = stripDraft(NULL_DRAFT);
  assert.equal('draft' in got, false, 'a null draft key survived into a read that must not carry one');
  assert.deepEqual(got, LIVE);
});

test('stripDraft passes non-objects straight through', () => {
  assert.equal(stripDraft(null), null);
  assert.equal(stripDraft(undefined), undefined);
});

test('CONTROL: stripDraft is observable — the page it is given DOES carry a draft', () => {
  // Without this the four tests above would all pass against a page that never
  // had a draft in the first place, which is the vacuous-guard shape.
  assert.equal(hasUnpublishedDraft(POPULATED), true);
  assert.equal('draft' in POPULATED, true);
});
