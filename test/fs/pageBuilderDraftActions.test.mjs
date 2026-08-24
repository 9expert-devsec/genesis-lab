import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resetFakeDb, seed, all, count, setSessionUser,
} from '../fakeDb.mjs';
import { _calls as revalidations } from '../stub-next-cache.mjs';
import { DRAFT_CONTENT_KEYS, LIVE_ONLY_KEYS } from '@/lib/schemas/pageBuilder';
import {
  saveDraftContent,
  publishPageStatus,
  discardDraftContent,
  getPageBuilderPageBySlug,
  getPageBuilderPageBySlugAny,
  duplicatePageBuilderPage,
  updatePageIdentity,
  updatePageStatus,
  createPageBuilderPage,
} from '@/lib/actions/pageBuilder';
import { getActiveBuilderPromotions } from '@/lib/promotions/getPromotions';
import { publishBlockers } from '@/lib/pageBuilder/publishReadiness';

/**
 * Round 2 — the server action layer of the draft/published split, EXECUTED.
 *
 * ── WHY THIS FILE LOOKS UNLIKE EVERY OTHER ACTION TEST HERE ─────────────────
 * Until now nothing in this repo ran a server action. Every action was guarded
 * by source-scanning — reading the real source text and asserting its shape —
 * and the test/stub-*.mjs files exist to make actions UNREACHABLE from render
 * tests, not to make them testable. That was fine while the claims were
 * structural. The claims here are not: "a publish promotes the draft exactly
 * once", "a snapshot never carries a pending edit", "a draft save revalidates
 * nothing" are statements about what the code DOES, and a shape check cannot
 * tell a correct implementation from a merely plausible one.
 *
 * So test/fakeDb.mjs provides in-memory stand-ins for the page models, and
 * test/loader.mjs maps them (plus dbConnect, requireAdmin and the Cloudinary
 * SDK) at resolve time. Everything else — the real actions, the real
 * tierSanitize, the real publishReadiness, the real pageAudit, the real
 * slugGuard — runs for real.
 *
 * ── WHY EVERY CASE IS A SUBTEST OF ONE PARENT ───────────────────────────────
 * MEASURED, not stylistic. The runner calls run({ isolation: 'none',
 * concurrency: true }), which makes root-level tests run CONCURRENTLY. Every
 * other test in this suite is synchronous and stateless, so that has never
 * mattered. These cases are async and share one module-level fake database, so
 * as root tests they interleaved and reset each other's fixtures mid-flight —
 * 24 of 32 failed, all with nonsense diffs. Awaited subtests of a single parent
 * are sequential, which is the guarantee this file needs. Do not flatten them.
 *
 * ── WHAT THE HARNESS CANNOT SEE, said plainly ───────────────────────────────
 * It is not Mongo. It implements the query surface these actions use and THROWS
 * on anything else rather than answering emptily. It does not enforce the
 * Mongoose schema, so nothing here can prove a cast or a required-field rule.
 */

const PAGE_ID = 'page-under-test';
const MARKER = 'DRAFT_LEAK_MARKER_R2';

/** A live section, in the shape the section union actually validates. */
function section(id, type = 'heading') {
  return {
    id, type, name: '', enabled: true, sortOrder: 0,
    settings: {}, layout: {}, style: {}, content: {},
    advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  };
}

/** The nine draft-content keys, all present, distinguishable from the live half. */
function draftContent(overrides = {}) {
  return {
    title: 'Drafted Title',
    sections: [section('s-draft', 'rich_text')],
    theme: 'ai_purple',
    showHeader: false,
    showFooter: true,
    showStickyCta: true,
    seo: { metaTitle: 'draft meta' },
    jsonLd: { mode: 'off' },
    promotionCover: 'https://example.com/draft-cover.jpg',
    ...overrides,
  };
}

function seedPage(overrides = {}) {
  return seed('PageBuilder', {
    _id: PAGE_ID,
    slug: 'real-slug',
    title: 'Live Title',
    pageType: 'general',
    status: 'draft',
    theme: 'default',
    showHeader: true,
    showFooter: true,
    showStickyCta: false,
    publishStartDate: null,
    publishEndDate: null,
    promotionId: '',
    promotionOrder: 0,
    promotionCover: '',
    sections: [section('s-live')],
    seo: { metaTitle: 'live meta' },
    jsonLd: { mode: 'auto' },
    slugHistory: [],
    preview: { enabled: false },
    createdBy: { id: '', name: '' },
    updatedBy: { id: '', name: '' },
    draft: null,
    ...overrides,
  });
}

const row = () => all('PageBuilder').find((p) => String(p._id) === PAGE_ID);
const token = (r) => new Date(r.updatedAt).toISOString();
const copy = (v) => JSON.parse(JSON.stringify(v));

test('the draft/publish action layer', async (t) => {
  /** One case, with the shared fake database reset first. */
  const scenario = (name, fn) => t.test(name, async () => {
    resetFakeDb();
    revalidations.length = 0;
    setSessionUser({ id: 'u1', name: 'Dev', tier: 'developer' });
    await fn();
  });

  // ── saveDraftContent ──────────────────────────────────────────────────────

  await scenario('saveDraftContent writes the draft and touches NOTHING else', async () => {
    const before = copy(seedPage());
    const res = await saveDraftContent(PAGE_ID, draftContent(), token(before));
    assert.equal(res.ok, true, res.error);

    const after = row();
    // The FULL set of untouched keys, not a sample: everything except the two
    // fields a draft save is allowed to move.
    const movable = new Set(['draft', 'updatedAt']);
    const changed = Object.keys(after).filter(
      (k) => !movable.has(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k])
    );
    assert.deepEqual(changed, [], 'a draft save moved fields it must not touch');

    // And by name, so a failure says WHICH key moved.
    for (const key of LIVE_ONLY_KEYS) {
      assert.deepEqual(after[key], before[key], `live-only key ${key} moved on a draft save`);
    }
    // The LIVE content half must not move either — that is the whole feature.
    for (const key of DRAFT_CONTENT_KEYS) {
      assert.deepEqual(after[key], before[key], `live content ${key} moved on a draft save`);
    }
  });

  await scenario('CONTROL: the draft save really did store the nine content keys', async () => {
    // Without this, the "nothing moved" case passes for a save that did nothing.
    const before = copy(seedPage());
    await saveDraftContent(PAGE_ID, draftContent(), token(before));
    const { draft } = row();
    assert.deepEqual(
      Object.keys(draft).sort(),
      [...DRAFT_CONTENT_KEYS, 'savedAt', 'savedBy'].sort()
    );
    assert.equal(draft.title, 'Drafted Title');
    assert.equal(draft.theme, 'ai_purple');
  });

  await scenario('saveDraftContent revalidates NOTHING and snapshots nothing', async () => {
    const before = copy(seedPage({ status: 'published' }));
    await saveDraftContent(PAGE_ID, draftContent(), token(before));
    assert.deepEqual(revalidations, [], 'a draft save busted a cache; the edit would go public');
    assert.equal(count('PageVersion'), 0, 'a draft save wrote a snapshot');
  });

  await scenario('CONTROL: a publish on the same fixture DOES revalidate', async () => {
    // Proves the empty-revalidations assertion above is observable, not vacuous.
    const before = copy(seedPage({ status: 'published' }));
    await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.ok(revalidations.length > 0, 'the revalidation recorder never sees anything');
  });

  await scenario('saveDraftContent audits a PRESENCE FLAG, never the content', async () => {
    const before = copy(seedPage());
    await saveDraftContent(PAGE_ID, draftContent(), token(before));
    const [entry] = all('PageAuditLog');
    assert.equal(entry.action, 'draft.save');
    assert.deepEqual(entry.before, { hadDraft: false });
    assert.deepEqual(entry.after, { hasDraft: true });
    assert.ok(!JSON.stringify(entry).includes('Drafted Title'), 'the audit row carries the draft body');
  });

  await scenario('saveDraftContent rejects a stale expectedUpdatedAt', async () => {
    const before = copy(seedPage());
    const stale = new Date(new Date(before.updatedAt).getTime() - 5000).toISOString();
    const res = await saveDraftContent(PAGE_ID, draftContent(), stale);
    assert.equal(res.ok, false);
    assert.equal(res.conflict, true);
    assert.equal(row().draft, null, 'a conflicting save still wrote the draft');
  });

  await scenario('saveDraftContent is uniform — an unpublished page drafts the same way', async () => {
    const before = copy(seedPage({ status: 'draft' }));
    const res = await saveDraftContent(PAGE_ID, draftContent(), token(before));
    assert.equal(res.ok, true, res.error);
    assert.equal(row().draft.title, 'Drafted Title');
    assert.equal(row().status, 'draft', 'a draft save changed the status');
  });

  // ── tier sanitisation reaches draft saves ─────────────────────────────────

  await scenario('a non-developer draft save has a NEW custom_html section stripped', async () => {
    const before = copy(seedPage());
    setSessionUser({ id: 'u2', name: 'Editor', tier: 'editor' });
    const res = await saveDraftContent(
      PAGE_ID,
      draftContent({ sections: [section('s-draft', 'rich_text'), section('adv-1', 'custom_html')] }),
      token(before)
    );
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(
      row().draft.sections.map((s) => s.type), ['rich_text'],
      'an editor smuggled an advanced section into the draft'
    );
  });

  await scenario('CONTROL: a developer draft save KEEPS the same custom_html section', async () => {
    // Same input, same code path, tier flipped — so the strip above is the tier
    // gate doing its job, not the section being dropped for some other reason.
    const before = copy(seedPage());
    const res = await saveDraftContent(
      PAGE_ID,
      draftContent({ sections: [section('s-draft', 'rich_text'), section('adv-1', 'custom_html')] }),
      token(before)
    );
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(row().draft.sections.map((s) => s.type), ['rich_text', 'custom_html']);
  });

  await scenario('a draft save renumbers sortOrder from array position', async () => {
    const before = copy(seedPage());
    const a = { ...section('a', 'heading'), sortOrder: 7 };
    const b = { ...section('b', 'rich_text'), sortOrder: 3 };
    await saveDraftContent(PAGE_ID, draftContent({ sections: [a, b] }), token(before));
    assert.deepEqual(row().draft.sections.map((s) => s.sortOrder), [0, 1]);
  });

  // ── publishPageStatus: the publish branch ─────────────────────────────────

  await scenario('publish promotes the draft EXACTLY once and clears it', async () => {
    const before = copy(seedPage({ status: 'draft', draft: draftContent() }));
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, true, res.error);

    const after = row();
    const expected = draftContent();
    for (const key of DRAFT_CONTENT_KEYS) {
      assert.deepEqual(after[key], expected[key], `${key} was not promoted`);
    }
    assert.equal(after.draft, null, 'the draft survived its own promotion');
    assert.equal(after.status, 'published');
  });

  await scenario('publish leaves every live-only field except status/dates alone', async () => {
    const before = copy(seedPage({ status: 'draft', draft: draftContent() }));
    await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    const after = row();
    const moved = new Set(['status', 'publishStartDate', 'publishEndDate']);
    for (const key of LIVE_ONLY_KEYS) {
      if (moved.has(key)) continue;
      assert.deepEqual(after[key], before[key], `publish moved live-only key ${key}`);
    }
  });

  await scenario('publish snapshots on EVERY call — including a republish with no draft', async () => {
    // The behaviour change from "snapshot only on the transition into published".
    const first = copy(seedPage({ status: 'published', draft: draftContent() }));
    const r1 = await publishPageStatus(PAGE_ID, { status: 'published' }, token(first));
    assert.equal(r1.ok, true, r1.error);
    assert.equal(count('PageVersion'), 1, 'the first publish did not snapshot');

    const second = row();
    assert.equal(second.draft, null, 'precondition: the second publish has NO draft pending');
    assert.equal(second.status, 'published', 'precondition: the page is ALREADY published');

    const r2 = await publishPageStatus(PAGE_ID, { status: 'published' }, token(second));
    assert.equal(r2.ok, true, r2.error);
    assert.equal(
      count('PageVersion'), 2,
      'a republish of an already-published page with no draft did NOT snapshot'
    );
  });

  await scenario('the snapshot never carries a draft — not even when the page had one', async () => {
    const before = copy(seedPage({ status: 'draft', draft: draftContent({ title: MARKER }) }));
    await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));

    const [version] = all('PageVersion');
    assert.equal('draft' in version.snapshot, false, 'the snapshot carries a draft key');
    // The promoted title IS expected here — it is live content now, not a draft.
    assert.equal(version.snapshot.title, MARKER);
    assert.equal(version.label, 'publish');
  });

  await scenario('publish audits as `publish` with presence flags only', async () => {
    const before = copy(seedPage({ status: 'draft', draft: draftContent() }));
    await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    const [entry] = all('PageAuditLog');
    assert.equal(entry.action, 'publish');
    assert.deepEqual(entry.before, { status: 'draft', hadDraft: true });
    assert.deepEqual(entry.after, { status: 'published', hasDraft: false });
  });

  await scenario('publishBlockers judge the RESULTING document, not the stale live one', async () => {
    // The live page has no sections (would be blocked); the draft supplies one.
    // Judging `existing` would block a publish that is actually fine.
    const before = copy(seedPage({ status: 'draft', sections: [], draft: draftContent() }));
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, true, `a publish the draft fixes was blocked: ${res.error}`);
    assert.equal(row().sections.length, 1);
  });

  await scenario('CONTROL: the mirror case — a draft that BREAKS readiness blocks publish', async () => {
    // Live content is publishable; the draft empties the sections. Judging the
    // stale live doc would wave this through — the same bug the other way.
    const before = copy(seedPage({ status: 'draft', draft: draftContent({ sections: [] }) }));
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, false, 'a draft with no sections was published');
    assert.equal(row().status, 'draft', 'the page was published despite the blocker');
  });

  // ── the defence-in-depth re-validation ────────────────────────────────────

  await scenario('a draft carrying a value the page schema rejects cannot be promoted', async () => {
    // `theme` is deliberately the vehicle: publishBlockers does not look at it
    // at all, so ONLY the full-document re-validation can catch this. A draft is
    // stored as a Mixed blob — nothing in the database enforces its shape.
    const before = copy(seedPage({ status: 'draft', draft: draftContent({ theme: 'not-a-real-theme' }) }));
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));

    assert.equal(res.ok, false, 'an invalid theme was promoted onto the live page');
    assert.match(res.error, /^theme:/, `the rejection did not come from the theme rule: ${res.error}`);
    const after = row();
    assert.equal(after.status, 'draft', 'the page published anyway');
    assert.equal(after.theme, 'default', 'the invalid theme reached the live field');
    assert.notEqual(after.draft, null, 'a failed publish cleared the draft');
  });

  await scenario('CONTROL: publishBlockers alone would NOT have caught that theme', async () => {
    // Proves the case above exercises the re-validation rather than riding along
    // on a readiness check that happens to fire. Readiness passes this document.
    const resulting = { ...copy(seedPage()), ...draftContent({ theme: 'not-a-real-theme' }) };
    assert.deepEqual(
      publishBlockers(resulting, 'published'), [],
      'publishBlockers now checks theme, so that case no longer isolates anything'
    );
  });

  // ── publishPageStatus: the non-publish branch ─────────────────────────────

  for (const target of ['draft', 'closed', 'archived']) {
    await scenario(`a ${target} target leaves the draft untouched and snapshots nothing`, async () => {
      const pending = draftContent();
      const before = copy(seedPage({ status: 'published', draft: pending }));
      const res = await publishPageStatus(PAGE_ID, { status: target }, token(before));
      assert.equal(res.ok, true, res.error);

      const after = row();
      assert.equal(after.status, target);
      assert.deepEqual(after.draft, copy(pending), 'the draft moved');
      assert.equal(count('PageVersion'), 0, `a ${target} target wrote a snapshot`);
      assert.equal(after.title, 'Live Title', 'the draft was promoted on a non-publish target');
      assert.equal(all('PageAuditLog')[0].action, 'status', 'wrong audit action off the publish branch');
    });
  }

  await scenario('a tier-downgraded publish lands on the fallback and does NOT promote', async () => {
    const before = copy(seedPage({ status: 'draft', draft: draftContent() }));
    setSessionUser({ id: 'u2', name: 'Editor', tier: 'editor' });
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, true, res.error);

    const after = row();
    assert.equal(after.status, 'draft', 'an editor published');
    assert.equal(after.title, 'Live Title', 'a coerced publish promoted the draft anyway');
    assert.notEqual(after.draft, null, 'a coerced publish cleared the draft');
    assert.equal(count('PageVersion'), 0);
  });

  await scenario('publishPageStatus rejects an unknown status and a stale token', async () => {
    const before = copy(seedPage());
    assert.equal((await publishPageStatus(PAGE_ID, { status: 'nonsense' }, token(before))).ok, false);
    const stale = new Date(new Date(before.updatedAt).getTime() - 5000).toISOString();
    assert.equal((await publishPageStatus(PAGE_ID, { status: 'published' }, stale)).conflict, true);
  });

  // ── retention: the prune is gone ──────────────────────────────────────────

  await scenario('publishing again keeps every earlier snapshot, including the oldest', async () => {
    const before = copy(seedPage({ status: 'published' }));
    for (let i = 0; i < 21; i += 1) {
      seed('PageVersion', {
        _id: `v${i}`, pageId: PAGE_ID, snapshot: { marker: `snapshot-${i}` },
        label: 'publish', actor: { id: '', name: '' },
        createdAt: new Date(1_600_000_000_000 + i * 1000),
      });
    }
    assert.equal(count('PageVersion'), 21, 'fixture did not seed 21 rows');

    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, true, res.error);

    assert.equal(count('PageVersion'), 22, 'the publish pruned rows instead of appending');
    const ids = all('PageVersion').map((v) => String(v._id));
    // The OLDEST specifically — a prune to the newest 20 takes v0 and v1 first.
    assert.ok(ids.includes('v0'), 'the oldest snapshot was pruned; a Cloudinary asset is now stranded');
    assert.ok(ids.includes('v1'), 'the second-oldest snapshot was pruned');
    const seeded = ids.filter((id) => /^v\d+$/.test(id));
    assert.equal(seeded.length, 21, 'not every seeded row survived');
  });

  // ── discardDraftContent ───────────────────────────────────────────────────

  await scenario('discardDraftContent clears the draft and nothing else', async () => {
    const before = copy(seedPage({ status: 'published', draft: draftContent() }));
    const res = await discardDraftContent(PAGE_ID, token(before));
    assert.equal(res.ok, true, res.error);

    const after = row();
    assert.equal(after.draft, null);
    const movable = new Set(['draft', 'updatedAt']);
    const changed = Object.keys(after).filter(
      (k) => !movable.has(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k])
    );
    assert.deepEqual(changed, [], 'discarding a draft moved something else');
    assert.deepEqual(revalidations, [], 'discarding a draft busted a public cache');
    assert.equal(count('PageVersion'), 0);
    assert.equal(all('PageAuditLog')[0].action, 'draft.discard');
  });

  await scenario('discardDraftContent is idempotent when there is nothing pending', async () => {
    const before = copy(seedPage({ draft: null }));
    const res = await discardDraftContent(PAGE_ID, token(before));
    assert.equal(res.ok, true, res.error);
    assert.equal(row().draft, null);
  });

  // ── item F: a draft must not leave the database on a public read ──────────

  await scenario('getPageBuilderPageBySlug (public) never returns the draft', async () => {
    seedPage({ status: 'published', draft: draftContent({ title: MARKER }) });
    const got = await getPageBuilderPageBySlug('real-slug');
    assert.ok(got, 'fixture did not resolve');
    assert.equal('draft' in got, false, 'the public read carried a draft key');
    assert.ok(!JSON.stringify(got).includes(MARKER), 'the draft body leaked through the public read');
  });

  await scenario('getActiveBuilderPromotions never returns the draft', async () => {
    seedPage({
      status: 'published', pageType: 'promotion', promotionCover: 'https://x/live.png',
      draft: draftContent({ title: MARKER }),
    });
    const got = await getActiveBuilderPromotions();
    assert.equal(got.length, 1, 'fixture did not survive the visibility gate');
    assert.equal('draft' in got[0], false, 'the promotions grid read carried a draft key');
    assert.ok(!JSON.stringify(got).includes(MARKER), 'the draft body leaked into the promotions grid');
  });

  await scenario('getActiveBuilderPromotions still returns what the card needs', async () => {
    // The projection is only safe if it is COMPLETE — a narrower one blanks the
    // grid instead of leaking, which is a different failure, not a fix.
    seedPage({
      status: 'published', pageType: 'promotion', promotionOrder: 3,
      promotionCover: 'https://x/live.png', draft: draftContent(),
    });
    const [got] = await getActiveBuilderPromotions();
    for (const key of ['_id', 'slug', 'title', 'pageType', 'status', 'promotionOrder', 'promotionCover', 'createdAt']) {
      assert.ok(key in got, `the projection dropped ${key}, which the grid reads`);
    }
  });

  await scenario('CONTROL: the any-status reader still DOES carry the draft', async () => {
    // The strip is targeted, not global. /preview/[slug] and previewAccess share
    // this reader and are allowed to see a draft — round 3 makes preview render
    // it. If this ever passes by stripping, the preview feature is broken.
    seedPage({ status: 'published', draft: draftContent({ title: MARKER }) });
    const got = await getPageBuilderPageBySlugAny('real-slug');
    assert.ok(JSON.stringify(got).includes(MARKER), 'the any-status reader lost the draft');
  });

  // ── item H: a duplicate must not inherit a pending draft ──────────────────

  await scenario('duplicatePageBuilderPage does not copy the source draft', async () => {
    seedPage({ status: 'published', draft: draftContent({ title: MARKER }) });
    const res = await duplicatePageBuilderPage(PAGE_ID);
    assert.equal(res.ok, true, res.error);

    const dupe = all('PageBuilder').find((p) => String(p._id) !== PAGE_ID);
    assert.ok(dupe, 'no copy was created');
    assert.equal(dupe.draft, undefined, 'the copy inherited the source draft');
    assert.ok(!JSON.stringify(dupe).includes(MARKER), 'the draft body reached the copy');
    // The source keeps its own draft — the strip is on the copy, not a move.
    assert.equal(row().draft.title, MARKER, 'duplicating stole the source page draft');
  });

  // ══ ROUND 3: identity writes, and retiring the list's old publish path ══
  //
  // These live inside the SAME parent test as everything above, and that is
  // load-bearing rather than tidy: a second file with its own root test would
  // run CONCURRENTLY with this one (run() uses concurrency:true) while sharing
  // the one module-level fake database, and the two would reset each other's
  // fixtures mid-flight. One parent, one sequence, one owner of the fake db.

  await scenario('updatePageIdentity changes exactly the four keys, and nothing else', async () => {
    const before = copy(seedPage({ draft: draftContent() }));
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'promotion', promotionId: 'PROMO-9', promotionOrder: 4,
    }, token(before));
    assert.equal(res.ok, true, res.error);

    const after = row();
    assert.equal(after.slug, 'renamed-slug');
    assert.equal(after.pageType, 'promotion');
    assert.equal(after.promotionId, 'PROMO-9');
    assert.equal(after.promotionOrder, 4);

    // EXACT set of what moved — never a sample. slugHistory is here because
    // this call renamed; the case below pins that it stays put when it does not.
    const moved = Object.keys(after).filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])
    ).sort();
    assert.deepEqual(
      moved,
      ['pageType', 'promotionId', 'promotionOrder', 'slug', 'slugHistory', 'updatedAt'],
      'an identity update moved fields outside its four keys'
    );
  });

  await scenario('updatePageIdentity leaves slugHistory alone when the slug does not change', async () => {
    const before = copy(seedPage({ slugHistory: ['older-slug'] }));
    const res = await updatePageIdentity(PAGE_ID, {
      slug: before.slug, pageType: 'general', promotionId: '', promotionOrder: 7,
    }, token(before));
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(row().slugHistory, ['older-slug'], 'a non-rename rewrote slugHistory');
    assert.equal(row().promotionOrder, 7);
  });

  await scenario('a rename retires the old slug and never leaves the new one in history', async () => {
    const before = copy(seedPage({ slug: 'first-slug', slugHistory: ['renamed-slug', 'older'] }));
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, true, res.error);
    // Deduped, old slug added, NEW slug removed — a 301 that resolved to itself
    // would loop. Exact set, order-independent.
    assert.deepEqual(
      [...row().slugHistory].sort(), ['first-slug', 'older'],
      'slugHistory is wrong after the rename'
    );
  });

  await scenario('a draft survives an identity rename byte-identical', async () => {
    const pending = draftContent({ title: MARKER });
    const before = copy(seedPage({ status: 'published', draft: pending }));
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(row().draft, copy(pending), 'the pending draft was disturbed by a rename');
    assert.equal(count('PageVersion'), 0, 'an identity update snapshotted');
  });

  await scenario('a rename revalidates BOTH the old and the new public URL', async () => {
    // No existing test covered this call shape — the whole-page save has the
    // same `bustCaches(updated, existing.slug)` line and nothing asserted it.
    // Missing the OLD slug leaves the previous URL serving from cache.
    const before = copy(seedPage({ slug: 'first-slug' }));
    await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    const paths = revalidations.filter((c) => c.kind === 'path').map((c) => c.path).sort();
    assert.deepEqual(paths, ['/admin/pages', '/first-slug', '/renamed-slug']);
    assert.deepEqual(revalidations.filter((c) => c.kind === 'tag').map((c) => c.tag), ['page-builder']);
  });

  await scenario('a promotion rename also revalidates /promotions', async () => {
    const before = copy(seedPage({ slug: 'first-slug', pageType: 'promotion' }));
    await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'promotion', promotionId: '', promotionOrder: 0,
    }, token(before));
    const paths = revalidations.filter((c) => c.kind === 'path').map((c) => c.path).sort();
    assert.deepEqual(paths, ['/admin/pages', '/first-slug', '/promotions', '/renamed-slug']);
  });

  await scenario('updatePageIdentity rejects a slug already taken by another builder page', async () => {
    const before = copy(seedPage());
    seed('PageBuilder', { _id: 'other', slug: 'taken-slug', title: 'Other', status: 'draft', slugHistory: [] });
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'taken-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, false, 'a colliding slug was accepted');
    assert.equal(res.error, 'Slug นี้ถูกใช้แล้ว');
    assert.equal(row().slug, 'real-slug', 'the page was renamed despite the collision');
  });

  await scenario('CONTROL: the same slug on the page ITSELF is not a collision', async () => {
    // excludeBuilderId is what makes this true; without it every save of an
    // unchanged slug would report a collision with itself.
    const before = copy(seedPage());
    const res = await updatePageIdentity(PAGE_ID, {
      slug: before.slug, pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, true, `a page collided with its own slug: ${res.error}`);
  });

  await scenario('updatePageIdentity rejects a slug already taken by a CustomPage', async () => {
    const before = copy(seedPage());
    seed('CustomPage', { _id: 'cp1', slug: 'taken-slug', slugHistory: [] });
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'taken-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, false, 'the cross-collection guard did not run');
    assert.equal(res.error, 'Slug นี้ถูกใช้แล้ว');
  });

  await scenario('a PROMOTION page also gets the /promotions namespace guard', async () => {
    const before = copy(seedPage());
    seed('PromotionConfig', { _id: 'pc1', url_slug: 'promo-taken' });
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'promo-taken', pageType: 'promotion', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, false, 'a promotion page took a slug an MSDB promotion already claims');
    assert.equal(row().slug, 'real-slug');
  });

  await scenario('CONTROL: the promotion guard is SCOPED — a general page may use that slug', async () => {
    // Proves the case above is the scoped guard firing and not the general one.
    // Same fixture, same slug, only pageType differs.
    const before = copy(seedPage());
    seed('PromotionConfig', { _id: 'pc1', url_slug: 'promo-taken' });
    const res = await updatePageIdentity(PAGE_ID, {
      slug: 'promo-taken', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(res.ok, true, `the promotion guard leaked onto a general page: ${res.error}`);
    assert.equal(row().slug, 'promo-taken');
  });

  await scenario('updatePageIdentity rejects a malformed slug and a stale token', async () => {
    const before = copy(seedPage());
    const bad = await updatePageIdentity(PAGE_ID, {
      slug: 'NOT A SLUG!!', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, token(before));
    assert.equal(bad.ok, false);
    assert.match(bad.error, /^slug:/);

    const stale = new Date(new Date(before.updatedAt).getTime() - 5000).toISOString();
    const conflicted = await updatePageIdentity(PAGE_ID, {
      slug: 'renamed-slug', pageType: 'general', promotionId: '', promotionOrder: 0,
    }, stale);
    assert.equal(conflicted.conflict, true);
    assert.equal(row().slug, 'real-slug');
  });

  // ── the regression the admin-list repoint fixes ───────────────────────────

  await scenario('THE TRAP: updatePageStatus snapshots the pending draft (unchanged)', async () => {
    // This is the OLD list path, pinned rather than fixed. It is why the toggle
    // moved, and pinning it stops anyone wiring it back up thinking it is safe.
    // updatePageStatus itself is untouched by this round — this documents its
    // behaviour, it does not change it.
    seedPage({ status: 'draft', draft: draftContent({ title: MARKER }) });
    const res = await updatePageStatus(PAGE_ID, 'published');
    assert.equal(res.ok, true, res.error);

    const [version] = all('PageVersion');
    assert.equal('draft' in version.snapshot, true, 'the trap is gone — update the comment that describes it');
    assert.equal(version.snapshot.draft.title, MARKER, 'the unpublished edit is in the archive');
    // And it did NOT promote: the live page went public with the stale content
    // while the archive recorded the new. Wrong in both directions at once.
    assert.equal(row().title, 'Live Title', 'updatePageStatus started promoting drafts');
    assert.equal(row().draft.title, MARKER, 'updatePageStatus started clearing drafts');
  });

  await scenario('THE FIX: publishPageStatus on the SAME fixture snapshots no draft', async () => {
    // Byte-for-byte the same starting page as the case above; only the action
    // differs. That is the whole of what the admin-list repoint buys.
    const before = copy(seedPage({ status: 'draft', draft: draftContent({ title: MARKER }) }));
    const res = await publishPageStatus(PAGE_ID, {
      status: 'published',
      publishStartDate: before.publishStartDate,
      publishEndDate: before.publishEndDate,
    }, token(before));
    assert.equal(res.ok, true, res.error);

    const [version] = all('PageVersion');
    assert.equal('draft' in version.snapshot, false, 'the snapshot carries a draft key');
    assert.equal(version.snapshot.title, MARKER, 'the promoted content is what was archived');
    assert.equal(row().title, MARKER, 'the draft was not promoted');
    assert.equal(row().draft, null, 'the draft was not cleared');
  });

  await scenario('the list toggle passes the window through, so a schedule is not wiped', async () => {
    // publishPageStatus validates the WHOLE window and both dates default to
    // null when absent — so a toggle that omitted them would silently clear a
    // scheduled page's dates. The list reads whole documents and passes both.
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-30T00:00:00.000Z';
    const before = copy(seedPage({ status: 'scheduled', publishStartDate: start, publishEndDate: end }));
    const res = await publishPageStatus(PAGE_ID, {
      status: 'published',
      publishStartDate: before.publishStartDate,
      publishEndDate: before.publishEndDate,
    }, token(before));
    assert.equal(res.ok, true, res.error);
    assert.equal(new Date(row().publishStartDate).toISOString(), start, 'the schedule start was wiped');
    assert.equal(new Date(row().publishEndDate).toISOString(), end, 'the schedule end was wiped');
  });

  await scenario('CONTROL: omitting the window IS what would wipe it', async () => {
    // Proves the case above is the pass-through doing the work, not the action
    // happening to preserve dates on its own.
    const before = copy(seedPage({
      status: 'scheduled',
      publishStartDate: '2026-09-01T00:00:00.000Z',
      publishEndDate: '2026-09-30T00:00:00.000Z',
    }));
    const res = await publishPageStatus(PAGE_ID, { status: 'published' }, token(before));
    assert.equal(res.ok, true, res.error);
    assert.equal(row().publishStartDate, null, 'omitting the window no longer clears it');
    assert.equal(row().publishEndDate, null);
  });

  await scenario('updatePageStatus still has NO conflict check — unchanged, and why it is unused', async () => {
    // Pinned because the function now has no caller, and an uncalled function
    // is exactly the one that rots unnoticed. It takes no token at all.
    seedPage({ status: 'draft' });
    assert.equal(updatePageStatus.length, 2, 'updatePageStatus grew or lost a parameter');
    const res = await updatePageStatus(PAGE_ID, 'published');
    assert.equal(res.ok, true, 'it stopped working');
    assert.deepEqual(Object.keys(res).sort(), ['ok', 'status'], 'its return shape changed');
    assert.equal(row().status, 'published');
  });

  // ══ ROUND 4: creating a page puts its content in the DRAFT ══════════════
  //
  // HARNESS LIMIT, stated because it shapes what these can claim: the fake does
  // not apply Mongoose defaults, so a content field the create simply does not
  // write is ABSENT here where production would show the schema default. That
  // is the claim anyway — "not written live" — so the assertions below check
  // absence rather than a defaulted value.

  await scenario('creating a page stores the authored content in .draft, not live', async () => {
    const authored = {
      slug: 'fresh-slug',
      title: 'Authored Title',
      pageType: 'general',
      promotionId: '',
      promotionOrder: 0,
      ...draftContent({ title: 'Authored Title' }),
    };
    const res = await createPageBuilderPage(authored);
    assert.equal(res.ok, true, res.error);

    const doc = all('PageBuilder').find((p) => p.slug === 'fresh-slug');
    assert.ok(doc, 'no document was created');

    // The eight content keys other than `title` are not written live at all.
    for (const key of DRAFT_CONTENT_KEYS) {
      if (key === 'title') continue;
      assert.equal(key in doc, false, `${key} was written to the LIVE document on create`);
    }
    // `title` is the documented exception — the model requires it.
    assert.equal(doc.title, 'Authored Title');

    // …and the whole authored content half is in the draft.
    assert.deepEqual(
      Object.keys(doc.draft).sort(),
      [...DRAFT_CONTENT_KEYS, 'savedAt', 'savedBy'].sort()
    );
    assert.equal(doc.draft.theme, 'ai_purple');
    assert.equal(doc.draft.title, 'Authored Title');
    assert.deepEqual(doc.draft.sections.map((s) => s.type), ['rich_text']);
  });

  await scenario('creating a page NEVER publishes it, whatever the input says', async () => {
    const res = await createPageBuilderPage({
      slug: 'fresh-slug', title: 'T', pageType: 'general', promotionId: '', promotionOrder: 0,
      status: 'published', // the editor's local state can say anything
      ...draftContent({ title: 'T' }),
    });
    assert.equal(res.ok, true, res.error);
    const doc = all('PageBuilder').find((p) => p.slug === 'fresh-slug');
    assert.equal(doc.status, 'draft', 'a create published the page directly');
    assert.equal(count('PageVersion'), 0, 'a create wrote a snapshot; only a publish may');
  });

  await scenario('CONTROL: the same input DOES publish through publishPageStatus', async () => {
    // Proves the case above is create refusing to publish, not the fixture being
    // unpublishable. Same page, one extra call, and now it is live.
    const created = await createPageBuilderPage({
      slug: 'fresh-slug', title: 'T', pageType: 'general', promotionId: '', promotionOrder: 0,
      ...draftContent({ title: 'T' }),
    });
    assert.equal(created.ok, true, created.error);
    const res = await publishPageStatus(created.id, { status: 'published' }, created.updatedAt);
    assert.equal(res.ok, true, res.error);
    const doc = all('PageBuilder').find((p) => String(p._id) === String(created.id));
    assert.equal(doc.status, 'published');
    assert.equal(doc.title, 'T', 'the draft was not promoted onto the live fields');
    assert.equal(doc.draft, null);
    assert.equal(count('PageVersion'), 1, 'the first publish did not snapshot');
  });

  await scenario('a created draft goes through the SAME tier gate every later save does', async () => {
    // Otherwise this would be the one authored payload in the system that never
    // met sanitizePageForTier — and it would be the first one.
    setSessionUser({ id: 'u2', name: 'Editor', tier: 'editor' });
    const res = await createPageBuilderPage({
      slug: 'fresh-slug', title: 'T', pageType: 'general', promotionId: '', promotionOrder: 0,
      ...draftContent({
        title: 'T',
        sections: [section('keep', 'rich_text'), section('adv', 'custom_html')],
      }),
    });
    assert.equal(res.ok, true, res.error);
    const doc = all('PageBuilder').find((p) => p.slug === 'fresh-slug');
    assert.deepEqual(
      doc.draft.sections.map((s) => s.type), ['rich_text'],
      'an editor smuggled an advanced section into a brand-new page draft'
    );
    assert.deepEqual(doc.draft.sections.map((s) => s.sortOrder), [0], 'sortOrder was not renumbered');
  });

  await scenario('CONTROL: a developer creating the same page KEEPS the advanced section', async () => {
    setSessionUser({ id: 'u1', name: 'Dev', tier: 'developer' });
    const res = await createPageBuilderPage({
      slug: 'fresh-slug', title: 'T', pageType: 'general', promotionId: '', promotionOrder: 0,
      ...draftContent({
        title: 'T',
        sections: [section('keep', 'rich_text'), section('adv', 'custom_html')],
      }),
    });
    assert.equal(res.ok, true, res.error);
    const doc = all('PageBuilder').find((p) => p.slug === 'fresh-slug');
    assert.deepEqual(doc.draft.sections.map((s) => s.type), ['rich_text', 'custom_html']);
  });

  await scenario('a create returns the token the editor needs for its next save', async () => {
    const res = await createPageBuilderPage({
      slug: 'fresh-slug', title: 'T', pageType: 'general', promotionId: '', promotionOrder: 0,
      ...draftContent({ title: 'T' }),
    });
    assert.equal(res.ok, true, res.error);
    assert.ok(res.id, 'no id came back to adopt');
    assert.ok(res.updatedAt, 'no token came back; the first autosave would be rejected');
    // And that token actually works against the very next save.
    const next = await saveDraftContent(res.id, draftContent({ title: 'Second' }), res.updatedAt);
    assert.equal(next.ok, true, `the create token was rejected: ${next.error}`);
  });
});
