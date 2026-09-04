import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resetFakeDb, seed, all, setSessionUser } from '../fakeDb.mjs';
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

  await t.test('the draft holds exactly the thirteen content keys plus its stamps', async () => {
    seedPage();
    await saveCustomPageDraft(PAGE_ID, formOf({ body: DRAFT_BODY }));
    assert.deepEqual(
      Object.keys(pageNow().draft).sort(),
      [...CUSTOM_PAGE_DRAFT_KEYS, 'savedAt', 'savedBy'].sort()
    );
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
