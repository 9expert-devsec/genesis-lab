import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  customPageSchema, customPageDraftContentSchema,
  CUSTOM_PAGE_DRAFT_KEYS, CUSTOM_PAGE_LIVE_ONLY_KEYS,
} from '@/lib/schemas/customPage';
import {
  effectiveContent, composeWorkingView, hasUnpublishedDraft, stripDraft,
} from '@/lib/pages/customPageDraft';

/**
 * The CustomPage half of the draft/published split.
 *
 * ── WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
 * The SEMANTICS — absent vs null vs {}, the live fallback, wholesale-not-merged
 * — are shared with the Page Builder through lib/pages/draftState.js and are
 * already covered case-by-case in test/pure/draftState. Re-asserting all of them
 * here would be testing the same functions twice and would go green even if this
 * binding pointed at the wrong key list.
 *
 * So this file asserts the two things that are ACTUALLY specific to CustomPage:
 * the PARTITION (which keys are content), and that the binding really is wired
 * to that partition rather than merely importing something.
 */

const DRAFT_NAMES = [
  'title', 'body', 'metaTitle', 'metaDescription', 'canonicalUrl', 'noIndex',
  'ogTitle', 'ogDescription', 'ogImage', 'ogImagePublicId', 'ogType',
  'twitterCard', 'jsonLd',
];

// ── 1. the partition ────────────────────────────────────────────────────────

test('CUSTOM_PAGE_DRAFT_KEYS is exactly the thirteen content keys', () => {
  // Transcribed by hand, not derived from the constant — a set computed from the
  // thing under test agrees with whatever it finds.
  assert.deepEqual([...CUSTOM_PAGE_DRAFT_KEYS].sort(), [...DRAFT_NAMES].sort());
  assert.equal(CUSTOM_PAGE_DRAFT_KEYS.length, 13);
});

test('CUSTOM_PAGE_LIVE_ONLY_KEYS is exactly the three that take effect at once', () => {
  /**
   * slug is identity (unique index, slugHistory trail, cross-collection guard,
   * a public route); status decides visibility, and drafting it would mean a
   * page could not be unpublished without publishing; slugHistory is
   * server-computed on a rename and is never part of a client patch.
   */
  assert.deepEqual([...CUSTOM_PAGE_LIVE_ONLY_KEYS].sort(), ['slug', 'slugHistory', 'status']);
});

test('the two sets are disjoint and together cover the editable surface exactly', () => {
  const both = CUSTOM_PAGE_DRAFT_KEYS.filter((k) => CUSTOM_PAGE_LIVE_ONLY_KEYS.includes(k));
  assert.deepEqual(both, [], 'a key is on both sides of the partition');
  assert.deepEqual(
    [...CUSTOM_PAGE_DRAFT_KEYS, ...CUSTOM_PAGE_LIVE_ONLY_KEYS].sort(),
    Object.keys(customPageSchema.shape).sort(),
    'the partition no longer covers customPageSchema exactly'
  );
});

test('CONTROL: a new field in customPageSchema cannot default into the draft', () => {
  /**
   * The reason LIVE_ONLY is DERIVED rather than typed out. A field added to the
   * page schema lands on the live-only side automatically and the coverage
   * assertion above goes red NAMING it — so a human has to assign it a side in
   * the same commit, which is the whole mechanism.
   */
  const widened = customPageSchema.extend({ noise: customPageSchema.shape.title });
  const derived = Object.keys(widened.shape).filter((k) => !CUSTOM_PAGE_DRAFT_KEYS.includes(k));
  assert.ok(derived.includes('noise'), 'the derivation did not pick up the new field');
  assert.equal(CUSTOM_PAGE_DRAFT_KEYS.includes('noise'), false,
    'a brand-new field silently became draft content');
});

test('previewToken is on NEITHER side — it is not in the editable surface at all', () => {
  // A credential. A drafted credential is one the preview gate cannot check, and
  // a live-only listing would imply a client may send one. It is absent from
  // customPageSchema entirely, which is what makes both impossible.
  assert.equal(Object.keys(customPageSchema.shape).includes('previewToken'), false);
  assert.equal(CUSTOM_PAGE_DRAFT_KEYS.includes('previewToken'), false);
  assert.equal(CUSTOM_PAGE_LIVE_ONLY_KEYS.includes('previewToken'), false);
});

test('the OG image URL and its Cloudinary token are on the SAME side', () => {
  /**
   * ONE control writes both, through a single onChange(url, publicId), and
   * `ogImagePublicId` is the ownership token deleteCustomPage destroys the asset
   * with. Split across the partition, a publish would take the new URL and leave
   * the old token — pointing the page at image B and the delete path at image A,
   * so deleting the page would destroy the wrong file and leak the right one.
   */
  const url = CUSTOM_PAGE_DRAFT_KEYS.includes('ogImage');
  const token = CUSTOM_PAGE_DRAFT_KEYS.includes('ogImagePublicId');
  assert.equal(url, token,
    'ogImage and ogImagePublicId are on opposite sides of the partition — a publish '
    + 'would orphan a Cloudinary asset and point the delete path at the wrong file');
});

// ── 2. the draft schema is PICKED, not rebuilt ──────────────────────────────

test('customPageDraftContentSchema carries exactly the draft keys', () => {
  assert.deepEqual(
    Object.keys(customPageDraftContentSchema.shape).sort(),
    [...CUSTOM_PAGE_DRAFT_KEYS].sort()
  );
});

test('a rule change reaches the draft schema: title max(200) is enforced there', () => {
  // The point of .pick() over a second z.object(): the rules are the SAME nodes.
  const long = 'x'.repeat(201);
  assert.equal(customPageDraftContentSchema.safeParse({ title: long, body: 'b' }).success, false,
    'the draft schema does not enforce the page schema’s title limit — it was rebuilt, not picked');
});

test('the slug regex is ABSENT from the draft schema, because slug is live-only', () => {
  assert.equal(Object.keys(customPageDraftContentSchema.shape).includes('slug'), false);
});

// ── 3. the binding really points at THIS partition ──────────────────────────

test('effectiveContent returns the draft’s content, restricted to the thirteen', () => {
  const page = {
    slug: 'live-slug', status: 'published', title: 'live', body: '<p>live</p>',
    draft: {
      title: 'drafted', body: '<p>drafted</p>',
      slug: 'SHOULD-NOT-LEAK', status: 'SHOULD-NOT-LEAK',
      savedAt: 'x', savedBy: { id: 'u' },
    },
  };
  const out = effectiveContent(page);
  assert.equal(out.title, 'drafted');
  assert.equal(out.body, '<p>drafted</p>');
  assert.equal('slug' in out, false, 'a live-only key leaked out of the draft');
  assert.equal('status' in out, false, 'a live-only key leaked out of the draft');
  assert.equal('savedAt' in out, false, 'a server stamp is being treated as content');
  assert.equal('savedBy' in out, false, 'a server stamp is being treated as content');
});

test('effectiveContent falls back to the LIVE content when there is no draft', () => {
  // The case that matters most: every existing published page is in it. Opening
  // one must not show an empty editor that the next save writes back.
  for (const draft of [null, undefined, {}]) {
    const page = { title: 'live', body: '<p>live</p>', ...(draft === undefined ? {} : { draft }) };
    const out = effectiveContent(page);
    assert.equal(out.title, 'live', `draft=${JSON.stringify(draft)} did not fall back to live`);
    assert.equal(out.body, '<p>live</p>');
  }
});

test('composeWorkingView keeps the live-only keys and drops .draft', () => {
  const page = {
    slug: 's', status: 'published', slugHistory: ['old'],
    title: 'live', body: '<p>live</p>',
    draft: { title: 'drafted', body: '<p>drafted</p>' },
  };
  const view = composeWorkingView(page);
  assert.equal(view.slug, 's', 'the live-only slug was dropped');
  assert.equal(view.status, 'published');
  assert.deepEqual(view.slugHistory, ['old']);
  assert.equal(view.title, 'drafted', 'the draft did not override the live title');
  assert.equal('draft' in view, false,
    'the working view still carries .draft — two answers to "what is the body"');
});

test('CONTROL: the binding is wired to CustomPage’s list, not the builder’s', () => {
  /**
   * `body` is in CustomPage's partition and in no builder key list; `sections`
   * is in the builder's and in none of CustomPage's. A binding pointed at the
   * wrong constant would fail exactly here and nowhere else — every other
   * assertion in this file would still pass, which is why this one exists.
   */
  const page = { draft: { body: '<p>drafted</p>', sections: ['SHOULD-NOT-APPEAR'] } };
  const out = effectiveContent(page);
  assert.equal(out.body, '<p>drafted</p>', 'body is not being treated as draft content');
  assert.equal('sections' in out, false,
    'the binding picked up `sections` — it is pointed at the Page Builder’s key list');
});

test('hasUnpublishedDraft and stripDraft are the SHARED ones, re-exported', () => {
  // Not a second implementation. The behaviour is covered in test/pure/draftState;
  // what is asserted here is that this module hands back the same semantics.
  assert.equal(hasUnpublishedDraft({ draft: { title: 't' } }), true);
  assert.equal(hasUnpublishedDraft({ draft: {} }), false, '{} must not count as a draft');
  assert.equal(hasUnpublishedDraft({ draft: null }), false);
  assert.equal(hasUnpublishedDraft({}), false);
  assert.equal('draft' in stripDraft({ slug: 's', draft: { title: 't' } }), false);
  assert.deepEqual(stripDraft({ slug: 's', draft: null }), { slug: 's' });
});
