import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resetFakeDb, seed, all, setSessionUser } from '../fakeDb.mjs';
// The source counter, for the two slug-guard call sites this harness cannot
// drive. ADDED beside the statement above rather than folded into it.
import { readSource, countCallSites } from '../sourceScan.mjs';
import { CUSTOM_PAGE_DRAFT_KEYS } from '@/lib/schemas/customPage';
import {
  saveCustomPageDraft,
  publishCustomPage,
  discardCustomPageDraft,
  getCustomPageBySlug,
} from '@/lib/actions/customPages';
// The two other reads the leak sweep classifies — one stripped, one deliberately
// not. ADDED beside the statement above rather than folded into it.
import { getCustomPages, getCustomPageById } from '@/lib/actions/customPages';
// The preview path's read and the composition the catch-all applies to it.
import { getCustomPageBySlugAny } from '@/lib/actions/customPages';
import { composeWorkingView } from '@/lib/pages/customPageDraft';
// The /promotions grid loader — the one CustomPage read outside the actions
// module. ADDED beside the statements above rather than folded into any.
import { getActiveCustomPagePromotions } from '@/lib/promotions/getPromotions';

/**
 * The CustomPage draft/publish split, EXECUTED rather than source-scanned.
 *
 * ── WHY THESE CLAIMS NEED RUNNING CODE ─────────────────────────────────────
 * "Saving does not change the live page", "a publish promotes the draft exactly
 * once", "an unpublish leaves pending work alone" are statements about what the
 * code DOES. A shape check cannot tell a correct implementation from a merely
 * plausible one, and the whole point of this round is that the previous
 * behaviour — every save going straight to live — was perfectly well-shaped.
 *
 * Same harness and the same reasoning as test/fs/pageBuilderDraftActions: the
 * fake DB stands in for the model, and everything else — the real actions, the
 * real slugGuard, the real pageAudit — runs for real.
 *
 * ── EVERY CASE IS A SUBTEST OF ONE PARENT, and that is MEASURED ────────────
 * The runner uses isolation:'none' with concurrency, so root-level tests run
 * concurrently. These cases are async and share one module-level fake database;
 * as root tests they would interleave and reset each other's fixtures. Awaited
 * subtests of a single parent are sequential. Do not flatten them.
 *
 * WHAT THE HARNESS CANNOT SEE: it is not Mongo and does not enforce the
 * Mongoose schema, so nothing here proves a required-field or cast rule. The
 * `body: required` behaviour is asserted by the model's own declaration, not by
 * this file.
 */

const PAGE_ID = 'custom-page-under-test';
const LIVE_BODY = '<p>LIVE BODY — the public must keep seeing this</p>';
const DRAFT_BODY = '<p>DRAFTED BODY — not public until published</p>';

function seedPage(overrides = {}) {
  return seed('CustomPage', {
    _id: PAGE_ID,
    slug: 'real-slug',
    title: 'Live Title',
    body: LIVE_BODY,
    status: 'published',
    metaTitle: 'live meta',
    metaDescription: '',
    canonicalUrl: '',
    noIndex: false,
    ogTitle: '', ogDescription: '', ogImage: '', ogImagePublicId: '',
    ogType: 'website', twitterCard: 'summary_large_image',
    jsonLd: {},
    slugHistory: [],
    pageType: 'general',
    promotionOrder: 0,
    promotionCover: '',
    previewToken: 'tok-123',
    draft: null,
    ...overrides,
  });
}

/** The FormData the editor posts — every key customPageSchema expects. */
function formOf(overrides = {}) {
  const values = {
    slug: 'real-slug',
    title: 'Live Title',
    body: LIVE_BODY,
    status: 'published',
    metaTitle: 'live meta',
    metaDescription: '',
    canonicalUrl: '',
    noIndex: 'false',
    ogTitle: '', ogDescription: '', ogImage: '', ogImagePublicId: '',
    ogType: 'website', twitterCard: 'summary_large_image',
    jsonLd: JSON.stringify({}),
    pageType: 'general',
    // FormData is strings all the way down — the schema's z.coerce does the
    // conversion, which is exactly what the real editor posts.
    promotionOrder: '0',
    promotionCover: '',
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, String(v));
  return fd;
}

const pageNow = () => all('CustomPage').find((p) => p._id === PAGE_ID);

test('the CustomPage draft/publish actions', async (t) => {
  t.beforeEach(() => {
    resetFakeDb();
    setSessionUser({ id: 'admin-1', name: 'Admin One' });
  });

  // ── 1. THE CASE THIS ROUND EXISTS FOR ───────────────────────────────────

  await t.test('saving a draft does NOT change the live body', async () => {
    seedPage();
    const res = await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    assert.equal(res.ok, true, res.error);

    const stored = pageNow();
    assert.equal(stored.body, LIVE_BODY,
      'the live body changed on a draft save — this is the entire defect the round removes');
    assert.equal(stored.draft.body, DRAFT_BODY, 'the draft did not receive the new body');
    assert.equal(stored.status, 'published', 'a draft save changed the status');
  });

  await t.test('and the PUBLIC read still returns the old body', async () => {
    // The end-to-end version of the case above, through the real published read.
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    const publicDoc = await getCustomPageBySlug('real-slug');
    assert.equal(publicDoc.body, LIVE_BODY,
      'the public read serves the drafted body — a visitor sees unpublished content');
  });

  await t.test('publishing promotes the draft onto the live fields exactly once', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY, title: 'Drafted Title' }));
    const res = await publishCustomPage(PAGE_ID);
    assert.equal(res.ok, true, res.error);

    const stored = pageNow();
    assert.equal(stored.body, DRAFT_BODY, 'the publish did not promote the drafted body');
    assert.equal(stored.title, 'Drafted Title');
    assert.equal(stored.status, 'published');
    assert.equal(stored.draft, null, 'the draft survived its own publish — it would republish forever');
  });

  // ── 2. THE PARTITION, AS BEHAVIOUR ──────────────────────────────────────

  await t.test('a draft save writes the slug LIVE — identity is not drafted', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ slug: 'renamed-slug' }));
    const stored = pageNow();
    assert.equal(stored.slug, 'renamed-slug', 'the slug was drafted — the unique index cannot protect it');
    assert.deepEqual(stored.slugHistory, ['real-slug'], 'the old slug was not retired into history');
    assert.equal('slug' in stored.draft, false, 'a live-only key leaked into the draft');
  });

  await t.test('a draft save NEVER writes status, whatever the form posts', async () => {
    /**
     * The second-authority fix, enforced at the action layer rather than only in
     * the UI. If a save could set status, it could publish the STALE live
     * content while the new content sat in the draft.
     */
    seedPage({ status: 'draft' });
    await saveCustomPageDraft(PAGE_ID, formOf({ status: 'published', body: DRAFT_BODY }));
    const stored = pageNow();
    assert.equal(stored.status, 'draft',
      'a draft save published the page — exactly one path may do that, and it is not this one');
    assert.equal('status' in stored.draft, false, 'status leaked into the draft');
  });

  await t.test('the draft holds exactly the fourteen content keys plus its stamps', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    assert.deepEqual(
      Object.keys(pageNow().draft).sort(),
      [...CUSTOM_PAGE_DRAFT_KEYS, 'savedAt', 'savedBy'].sort()
    );
  });

  // ── 2b. PROMOTION MODE, ACROSS THE PARTITION ────────────────────────────

  await t.test('a draft save writes pageType and promotionOrder STRAIGHT TO LIVE', async () => {
    /**
     * They are live-only, and this is the behaviour that assignment buys: the
     * grid query is a Mongo filter that cannot see inside the Mixed draft blob,
     * and the promotion slug guard is gated on the type, so a drafted pageType
     * would be checked at save and applied at publish with no re-check.
     *
     * The visible consequence is asserted in the same case, deliberately: the
     * BODY in the same save did not move. One save, two destinations.
     */
    seedPage();
    const res = await saveCustomPageDraft(PAGE_ID, formOf({
      pageType: 'promotion', promotionOrder: '7', body: DRAFT_BODY,
    }));
    assert.equal(res.ok, true, res.error);

    const stored = pageNow();
    assert.equal(stored.pageType, 'promotion',
      'pageType did not reach the live document — the grid query and the redirect read '
      + 'the live value, so the control would do nothing until publish');
    assert.equal(stored.promotionOrder, 7, 'promotionOrder did not reach the live document');
    assert.equal('pageType' in stored.draft, false, 'a live-only key leaked into the draft');
    assert.equal('promotionOrder' in stored.draft, false, 'a live-only key leaked into the draft');
    assert.equal(stored.body, LIVE_BODY,
      'the same save moved the live body — the two halves are not being separated');
  });

  await t.test('the COVER drafts: the live card does not change until เผยแพร่', async () => {
    seedPage({ pageType: 'promotion', promotionCover: 'https://cdn/live-cover.jpg' });
    await saveCustomPageDraft(PAGE_ID, formOf({
      pageType: 'promotion', promotionCover: 'https://cdn/new-cover.jpg',
    }));

    let stored = pageNow();
    assert.equal(stored.promotionCover, 'https://cdn/live-cover.jpg',
      'the live cover changed on a draft save — the /promotions grid would show an '
      + 'unpublished image, which is the defect the draft split exists to prevent');
    assert.equal(stored.draft.promotionCover, 'https://cdn/new-cover.jpg',
      'the new cover did not land in the draft');

    // …and the public read agrees, because it is the one the grid loader mirrors.
    const publicDoc = await getCustomPageBySlug('real-slug');
    assert.equal(publicDoc.promotionCover, 'https://cdn/live-cover.jpg',
      'the public read serves the drafted cover');

    await publishCustomPage(PAGE_ID);
    stored = pageNow();
    assert.equal(stored.promotionCover, 'https://cdn/new-cover.jpg',
      'เผยแพร่ did not promote the drafted cover onto the live field');
  });

  await t.test('CONTROL: the cover probe would SEE a live write — it is not asserting nothing', async () => {
    /**
     * The case above is mostly "this value did NOT change", and an unchanged
     * value passes against a form that never carried the field at all. This
     * drives the SAME field through the path that IS allowed to move it live,
     * and requires it to move — so the assertion above is measuring a partition,
     * not an inert key.
     */
    seedPage({ pageType: 'promotion', promotionCover: 'https://cdn/live-cover.jpg' });
    await saveCustomPageDraft(PAGE_ID, formOf({
      pageType: 'promotion', promotionCover: 'https://cdn/moved.jpg',
    }));
    await publishCustomPage(PAGE_ID);
    assert.equal(pageNow().promotionCover, 'https://cdn/moved.jpg',
      'the cover never reaches the live field by ANY path — the field is inert and the '
      + 'draft assertion above proves nothing');
  });

  // ── 2c. THE MSDB SLUG GUARD ─────────────────────────────────────────────

  await t.test('a page BECOMING a promotion under a colliding slug is refused', async () => {
    /**
     * THE CASE THE GATE-ON-SUBMITTED-TYPE CHOICE EXISTS FOR. The slug does not
     * change here — only the type does — so a guard keyed on "did the slug
     * move?" would let this straight through, and two sources would then claim
     * one /promotions/songkran-2026.
     */
    seedPage({ slug: 'songkran-2026', pageType: 'general' });
    seed('PromotionConfig', { promotion_id: 'P1', url_slug: 'songkran-2026' });

    const res = await saveCustomPageDraft(PAGE_ID, formOf({
      slug: 'songkran-2026', pageType: 'promotion',
    }));
    assert.equal(res.ok, false, 'the save was accepted — the slug now collides with MSDB');
    assert.match(String(res.error), /MSDB/, `unexpected refusal reason: ${res.error}`);
    assert.equal(pageNow().pageType, 'general',
      'the refusal did not prevent the write — the page is a promotion anyway');
  });

  await t.test('the same slug on a ทั่วไป page is FINE — the guard is scoped', async () => {
    // The discrimination. Without this, a guard that refused every save would
    // satisfy the case above.
    seedPage({ slug: 'songkran-2026', pageType: 'general' });
    seed('PromotionConfig', { promotion_id: 'P1', url_slug: 'songkran-2026' });

    const res = await saveCustomPageDraft(PAGE_ID, formOf({
      slug: 'songkran-2026', pageType: 'general', body: DRAFT_BODY,
    }));
    assert.equal(res.ok, true,
      `a non-promotion page was refused an MSDB-colliding slug: ${res.error}`);
  });

  await t.test('a raw Promotion.promotion_id collides too, not just a config url_slug', async () => {
    // Both halves of how /promotions/<slug> resolves — the pretty URL and the
    // id-fallback. A guard that only checked one would leave the other open.
    seedPage({ slug: 'p-692eb3f3aa', pageType: 'general' });
    seed('Promotion', { promotion_id: 'p-692eb3f3aa', is_active: true });

    const res = await saveCustomPageDraft(PAGE_ID, formOf({
      slug: 'p-692eb3f3aa', pageType: 'promotion',
    }));
    assert.equal(res.ok, false, 'the id-fallback namespace is unguarded');
  });

  await t.test('ALL THREE slug-accepting actions call the guard, and each is gated', async () => {
    /**
     * The three executed cases above drive saveCustomPageDraft, which is the
     * editor's primary save. createCustomPage and updateCustomPage take a slug
     * too, and a guard on two of three is a guard with a door left open — but
     * neither is reachable from this harness in the same shape (create writes a
     * new document, update is no longer wired to the editor). So the COUNT is
     * asserted from source, beside the behaviour rather than instead of it.
     *
     * `countCallSites` is the repo's existing counter — not a regex written here
     * for the occasion.
     */
    const { code } = readSource('src/lib/actions/customPages.js');
    assert.equal(countCallSites(code, 'checkPromotionSlugAvailable'), 3,
      'the promotion slug guard is called a different number of times — it belongs at '
      + 'every action that accepts a slug: create, update and saveDraft');
    assert.equal(countCallSites(code, 'checkSlugAvailable'), 3,
      'the cross-collection guard call count changed');

    // …and every one of the three is GATED on the submitted type, never bare.
    const gated = code.match(/if \(parsed\.data\.pageType === 'promotion'\) \{\s*const promoSlugCheck = await checkPromotionSlugAvailable/g) ?? [];
    assert.equal(gated.length, 3,
      `${gated.length} of the 3 calls sit behind the pageType gate — an ungated one would `
      + 'refuse MSDB-colliding slugs to ordinary pages that never touch /promotions');
  });

  await t.test('CONTROL: the count probe would MISS nothing — a two-of-three shape fails it', () => {
    // Planted source, not the real file: the exact regression this case guards.
    const planted = `
      const a = await checkPromotionSlugAvailable(x);
      const b = await checkPromotionSlugAvailable(y);
    `;
    assert.equal(countCallSites(planted, 'checkPromotionSlugAvailable'), 2,
      'the counter cannot see these call sites at all, so the assertion above proves nothing');
    assert.notEqual(countCallSites(planted, 'checkPromotionSlugAvailable'), 3);
  });

  await t.test('a promotion slug that collides with NOTHING is accepted', async () => {
    seedPage({ slug: 'real-slug', pageType: 'general' });
    seed('PromotionConfig', { promotion_id: 'P1', url_slug: 'something-else' });
    seed('Promotion', { promotion_id: 'P1', is_active: true });

    const res = await saveCustomPageDraft(PAGE_ID, formOf({ pageType: 'promotion' }));
    assert.equal(res.ok, true, `a clean promotion slug was refused: ${res.error}`);
    assert.equal(pageNow().pageType, 'promotion');
  });

  // ── 2d. THE GRID LOADER, EXECUTED ───────────────────────────────────────

  await t.test('getActiveCustomPagePromotions never returns the draft', async () => {
    /**
     * The mirror of the builder loader's own case. Shape guards say the
     * projection is narrow; this drives the real loader over a document that
     * HAS a draft and requires the draft not to come back — which is the claim
     * that actually matters, and the one a projection typo would break.
     */
    seedPage({ pageType: 'promotion', promotionCover: 'https://cdn/live.jpg' });
    await saveCustomPageDraft(PAGE_ID, formOf({
      pageType: 'promotion', promotionCover: 'https://cdn/pending.jpg', body: DRAFT_BODY,
    }));
    assert.ok(pageNow().draft, 'the fixture has no draft, so this asserts nothing');

    const [got] = await getActiveCustomPagePromotions();
    assert.ok(got, 'the published promotion page did not reach the grid at all');
    assert.equal('draft' in got, false,
      'the grid loader ships the unpublished draft — body AND the pending cover');
    assert.equal(got.promotionCover, 'https://cdn/live.jpg',
      'the card would render the UNPUBLISHED cover');
  });

  await t.test('the loader returns what the card needs, and gates on both facts', async () => {
    seedPage({ pageType: 'promotion', promotionOrder: 5, promotionCover: 'https://cdn/c.jpg' });
    const [got] = await getActiveCustomPagePromotions();
    for (const f of ['slug', 'title', 'pageType', 'status', 'promotionOrder', 'promotionCover']) {
      assert.ok(f in got, `${f} is missing from the projection — the card pipeline reads it`);
    }
  });

  await t.test('CONTROL: the loader drops an unpublished page AND a non-promotion one', async () => {
    // Both halves of the gate, each alone. Without this, a loader that returned
    // everything would satisfy the two cases above.
    seedPage({ pageType: 'promotion', status: 'draft' });
    assert.deepEqual(await getActiveCustomPagePromotions(), [],
      'an UNPUBLISHED promotion page reached the public grid');

    resetFakeDb();
    setSessionUser({ id: 'admin-1', name: 'Admin One' });
    seedPage({ pageType: 'general', status: 'published' });
    assert.deepEqual(await getActiveCustomPagePromotions(), [],
      'an ordinary published page reached the promotions grid');
  });

  await t.test('flipping to โปรโมชัน and back keeps the order and the cover', async () => {
    // They are stored unconditionally rather than cleared on the way out, so an
    // accidental type flip does not destroy an arrangement the author chose.
    seedPage({ pageType: 'promotion', promotionOrder: 3, promotionCover: 'https://cdn/c.jpg' });
    await saveCustomPageDraft(PAGE_ID, formOf({
      pageType: 'general', promotionOrder: '3', promotionCover: 'https://cdn/c.jpg',
    }));
    const stored = pageNow();
    assert.equal(stored.pageType, 'general');
    assert.equal(stored.promotionOrder, 3, 'the order was cleared by leaving promotion mode');
    assert.equal(stored.draft.promotionCover, 'https://cdn/c.jpg',
      'the cover was cleared by leaving promotion mode');
  });

  // ── 3. DISCARD, AND WHAT AN UNPUBLISH MUST NOT DO ───────────────────────

  await t.test('discarding drops the draft and touches nothing else', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY, title: 'Drafted Title' }));
    const res = await discardCustomPageDraft(PAGE_ID);
    assert.equal(res.ok, true, res.error);

    const stored = pageNow();
    assert.equal(stored.draft, null, 'the draft was not discarded');
    assert.equal(stored.body, LIVE_BODY, 'discarding changed the live body');
    assert.equal(stored.title, 'Live Title', 'discarding changed the live title');
    assert.equal(stored.status, 'published', 'discarding changed the status');
  });

  await t.test('publishing with NO draft is a valid republish, not an error', async () => {
    seedPage({ status: 'draft', draft: null });
    const res = await publishCustomPage(PAGE_ID);
    assert.equal(res.ok, true, res.error);
    assert.equal(pageNow().status, 'published');
    assert.equal(pageNow().body, LIVE_BODY, 'a republish invented content from nowhere');
  });

  // ── 4. THE AUDIT ROWS ───────────────────────────────────────────────────

  await t.test('each action records one advanced_html row, and never a token', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    await publishCustomPage(PAGE_ID);
    await saveCustomPageDraft(PAGE_ID, formOf({ body: '<p>again</p>' }));
    await discardCustomPageDraft(PAGE_ID);

    const rows = all('PageAuditLog').filter((r) => r.pageId === PAGE_ID);
    assert.deepEqual(rows.map((r) => r.action),
      ['draft.save', 'publish', 'draft.save', 'draft.discard']);
    for (const r of rows) {
      assert.equal(r.pageType, 'advanced_html', 'a row was filed under the wrong page type');
      assert.equal(JSON.stringify(r).includes('tok-123'), false,
        'an audit row carries the preview token — the trail becomes a way to obtain access');
    }
  });

  // ── 5. NO PUBLIC READ CARRIES A DRAFT ───────────────────────────────────

  await t.test('the public read returns no `draft` key at all', async () => {
    /**
     * Not merely "the body is the live one" — the KEY must be absent. A public
     * response carrying the draft object hands a visitor the entire unpublished
     * page even when the rendered body looks right, which is the quiet version
     * of this failure and the one a body-only assertion misses.
     */
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    const doc = await getCustomPageBySlug('real-slug');
    assert.equal('draft' in doc, false, 'the public read ships the draft object');
    assert.equal(JSON.stringify(doc).includes('DRAFTED BODY'), false,
      'unpublished content appears somewhere in the public payload');
  });

  await t.test('the admin list carries no draft either — payload, not secrecy', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    const { items } = await getCustomPages({ limit: 10 });
    const row = items.find((p) => p._id === PAGE_ID);
    assert.ok(row, 'the seeded page is not in the list');
    assert.equal('draft' in row, false,
      'the admin list ships a full second copy of every page body to the browser');
  });

  await t.test('the EDITOR read still carries it — the deliberate exception', async () => {
    // The other direction, so "no read carries a draft" cannot be satisfied by
    // stripping everywhere and quietly breaking the editor.
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    const doc = await getCustomPageById(PAGE_ID);
    assert.equal(doc.draft.body, DRAFT_BODY,
      'the editor read was stripped — the author would be shown published content '
      + 'and their next save would write it back over their own pending work');
  });

  await t.test('the PREVIEW composition resolves to the drafted body', async () => {
    /**
     * The other half of the round's headline case: the public URL keeps the old
     * content (asserted above) and the preview link shows the new. This runs the
     * exact composition the catch-all runs — getCustomPageBySlugAny, then
     * composeWorkingView — so the two cannot pass while disagreeing. That the
     * ROUTE calls this pair is pinned from source in
     * test/pure/customPagePreviewBanner.
     */
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    const stored = await getCustomPageBySlugAny('real-slug');
    const previewed = composeWorkingView(stored);
    assert.equal(previewed.body, DRAFT_BODY,
      'the preview shows the published body — the author cannot see their pending edits');
    assert.equal('draft' in previewed, false,
      'the composed view still carries .draft — two answers to "what is the body"');
    assert.equal(previewed.slug, 'real-slug', 'the composed view lost a live-only key');
  });

  await t.test('with NO draft, the preview composition equals the live content', async () => {
    // The honest answer for a published page with nothing pending — not an empty
    // page, and not an error.
    seedPage();
    const stored = await getCustomPageBySlugAny('real-slug');
    assert.equal(composeWorkingView(stored).body, LIVE_BODY);
  });

  // ── 6. CONTROLS ─────────────────────────────────────────────────────────

  await t.test('CONTROL: the harness really would SEE a live write', async () => {
    /**
     * Every "the live body did not change" assertion above is satisfiable by a
     * fake that never writes at all. This proves the opposite case is visible:
     * a publish DOES move the same field, through the same harness.
     */
    seedPage();
    assert.equal(pageNow().body, LIVE_BODY);
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    await publishCustomPage(PAGE_ID);
    assert.equal(pageNow().body, DRAFT_BODY,
      'the harness cannot observe a live write, so the no-change assertions prove nothing');
  });

  await t.test('CONTROL: a rejected save leaves both the live page and the draft alone', async () => {
    // An empty body fails customPageSchema's min(1). Nothing may be written.
    seedPage();
    const res = await saveCustomPageDraft(PAGE_ID, formOf({ body: '' }));
    assert.equal(res.ok, false, 'an empty body was accepted');
    assert.equal(pageNow().body, LIVE_BODY);
    assert.equal(pageNow().draft, null, 'a rejected save still created a draft');
  });
});
