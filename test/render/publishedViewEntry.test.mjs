import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { EditorTopBar } from '@/components/pageBuilder/editor/EditorTopBar';
import { VersionHistory } from '@/components/pageBuilder/editor/VersionHistory';
import { canOfferPublishedView, publishedViewHref } from '@/lib/pageBuilder/previewMode';
import { readSource, countCallSites, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 36, commit 2 — the two ways into the published view.
 *
 * Both are plain anchors to one URL built by one helper, and both are gated on
 * conditions that decide whether the destination can honour the click. A link
 * to a dead end is the inert-control class round 18 exists to catch, so the
 * gating is the substance here, not the markup.
 */

const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

const PAGE = (over = {}) => ({
  slug: 'live-slug', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  publishedVersion: 3,
  preview: { enabled: true, passwordHash: 'x' },
  draft: { title: 'Drafted', sections: [], savedAt: 'T', savedBy: { id: 'u', name: 'Editor B' } },
  ...over,
});

const noop = () => {};
const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const topBar = (page) => docOf(renderToStaticMarkup(
  createElement(EditorProvider, { page, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(EditorTopBar, {
      onSave: noop, onOpenSettings: noop, onOpenPreview: noop, onPublish: noop, onDiscard: noop,
    }))
));

const links = (doc) => [...doc.querySelectorAll('[data-testid="view-published-link"]')];

test('the editor offers the published view, on three conditions', async (t) => {
  await t.test('it renders, pointing at the published mode of this page', () => {
    const [a] = links(topBar(PAGE()));
    assert.ok(a, 'no link to the published view');
    assert.equal(a.getAttribute('href'), '/preview/live-slug?mode=published');
    assert.equal(a.textContent.trim(), 'ดูเวอร์ชันที่เผยแพร่อยู่');
  });

  await t.test('it opens in a new tab and leaks no referer', () => {
    // The editor must never be navigated away from with unsaved work, and the
    // admin URL must not reach the destination.
    const [a] = links(topBar(PAGE()));
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noreferrer');
  });

  await t.test('NO link with no pending draft — there is nothing to contrast', () => {
    for (const draft of [null, undefined, {}]) {
      assert.deepEqual(links(topBar(PAGE({ draft }))), [],
        'the link is offered with no pending draft');
    }
  });

  await t.test('NO link on a page that has never been published', () => {
    // The destination would be the unpublished dead end.
    for (const publishedVersion of [undefined, null, 0]) {
      assert.deepEqual(links(topBar(PAGE({ publishedVersion }))), [],
        `the link is offered at publishedVersion ${String(publishedVersion)}`);
    }
  });

  await t.test('NO link when the preview link is off or revoked', () => {
    // The published view sits behind the same cookie gate as the draft view, so
    // with no preview link the destination is the revoked dead end.
    for (const preview of [undefined, { enabled: false, passwordHash: 'x' }, { enabled: true, passwordHash: '' }]) {
      assert.deepEqual(links(topBar(PAGE({ preview }))), [],
        `the link is offered with preview ${JSON.stringify(preview)}`);
    }
  });

  await t.test('CONTROL: the same fixture DOES offer it when all three hold', () => {
    // Proves the three cases above are about their conditions and not about a
    // fixture that can never produce a link.
    assert.equal(links(topBar(PAGE())).length, 1, 'the link never renders at all');
  });

  await t.test('the requirement’s second sentence is NOT shipped', () => {
    // Round 27's rule: the pending-draft chip already says the change is not
    // live. A banner repeating it would be a fourth save vocabulary.
    const text = topBar(PAGE()).body.textContent;
    assert.equal(text.includes('การเปลี่ยนแปลงนี้บันทึกแล้ว'), false,
      'a second save sentence was added to the top bar');
    assert.equal(text.includes('คุณกำลังแก้ไขฉบับร่างล่าสุด'), false,
      'a second draft sentence was added to the top bar');
    // …and the chip that DOES carry the fact is still there.
    assert.equal(text.includes('มีฉบับร่างที่ยังไม่เผยแพร่'), true, 'the pending-draft chip is gone');
  });
});

test('the current version row links to the same view, and no other row does', async (t) => {
  const ROWS = [
    { _id: 'v3', label: 'publish', actor: { name: 'B' }, versionNumber: 3, createdAt: '2026-08-26T11:41:02.774Z' },
    { _id: 'v2', label: 'publish', actor: { name: 'A' }, versionNumber: 2, createdAt: '2026-07-20T09:19:43.071Z' },
  ];
  const EDITOR = (over = {}) => ({
    pageId: 'p1', savedUpdatedAt: 'T0', dispatch: noop,
    saving: false, conflict: null, hadDraft: false, contentDirty: false, identityDirty: false,
    page: { status: 'published', slug: 'live-slug' },
    publishedVersion: 3, previewEnabled: true, ...over,
  });
  const historyDoc = (over = {}) => docOf(renderToStaticMarkup(createElement(VersionHistory, {
    pageId: 'p1', open: true, editor: EDITOR(), initialRows: ROWS, ...over,
  })));

  await t.test('exactly one link, on the row carrying the ปัจจุบัน marker', () => {
    const doc = historyDoc();
    const found = links(doc);
    assert.equal(found.length, 1, 'the published link is not on exactly one row');
    const marked = doc.querySelector('[data-testid="version-live-marker"]');
    assert.ok(marked, 'the current-version marker is gone');
    assert.equal(doc.querySelectorAll('li')[0].contains(found[0]), true,
      'the link is not on the row marked current');
    assert.equal(found[0].getAttribute('href'), '/preview/live-slug?mode=published');
  });

  await t.test('NO link at all when the page is not live', () => {
    // No marker, so no row is the current one.
    for (const status of ['draft', 'closed', 'archived']) {
      assert.deepEqual(links(historyDoc({ editor: EDITOR({ page: { status, slug: 'live-slug' } }) })), [],
        `a ${status} page links a version to the published view`);
    }
  });

  await t.test('NO link when the preview link is off', () => {
    assert.deepEqual(links(historyDoc({ editor: EDITOR({ previewEnabled: false }) })), []);
  });

  await t.test('viewing an ARBITRARY past version is not offered — scope, stated', () => {
    // Rendering a stored snapshot reopens the source question round 36 decided
    // against, and needs its own answers for identity drift and schema movement.
    // Half-building it would put a link on rows that cannot honour it.
    const doc = historyDoc();
    assert.equal(doc.querySelectorAll('li').length, 2, 'the fixture has only one row');
    assert.equal(links(doc).length, 1, 'a non-current row gained a link');
  });
});

test('one URL builder, one restore path', async (t) => {
  await t.test('both entry points call the shared helper — neither builds the URL', () => {
    for (const rel of [
      'src/components/pageBuilder/editor/EditorTopBar.jsx',
      'src/components/pageBuilder/editor/VersionHistory.jsx',
    ]) {
      const src = readSource(rel).withImports;
      assert.match(src, /publishedViewHref\(/, `${rel} does not use the shared href helper`);
      assert.equal(/href=\{`\/preview\//.test(src), false, `${rel} builds the preview URL inline`);
    }
  });

  await t.test('CONTROL: the inline-URL matcher does see one', () => {
    assert.equal(/href=\{`\/preview\//.test('<a href={`/preview/${slug}?mode=published`}>'), true,
      'the inline-URL matcher does not work, so the check above means nothing');
  });

  await t.test('the helper produces the mode param, and encodes the slug', () => {
    assert.equal(publishedViewHref('a b/c'), '/preview/a%20b%2Fc?mode=published');
  });

  /**
   * ── H: ONE RESTORE PATH, COUNTED ──────────────────────────────────────────
   * The requirement's §5 pairs the published view with [สร้าง Draft จากเวอร์ชันนี้]
   * and [กลับไปแก้ไข Draft]. Those are NOT added to the published view: it is a
   * PUBLIC route behind a preview cookie, and a write control there is exactly
   * the read-only violation test/fs/previewPublishedMode enforces. Restore
   * stays where round 34 built it — in the admin version dialog — and this
   * counts the doors, in round 8's shape.
   */
  await t.test('saveDraftContent is still reachable from exactly two modules', () => {
    const ACTIONS = 'src/lib/actions/pageBuilder.js';
    const reachers = walkSources('src')
      .filter((f) => f.rel !== ACTIONS)
      .filter((f) => /import\s*\{[^}]*\bsaveDraftContent\b[^}]*\}\s*from/.test(f.withImports))
      .map((f) => f.rel)
      .sort();
    assert.deepEqual(reachers, [
      'src/components/pageBuilder/editor/VersionHistory.jsx',
      'src/components/pageBuilder/editor/useEditorSave.js',
    ], 'the set of modules that can write a draft changed');
  });

  await t.test('…and exactly ONE of them calls it — still the restore', () => {
    const direct = walkSources('src')
      .filter((f) => f.rel !== 'src/lib/actions/pageBuilder.js')
      .filter((f) => countCallSites(f.code, 'saveDraftContent') > 0)
      .map((f) => f.rel);
    assert.deepEqual(direct, ['src/components/pageBuilder/editor/VersionHistory.jsx']);
  });

  await t.test('the PUBLIC route reaches no restore path at all', () => {
    const route = readSource('src/app/(public)/preview/[slug]/page.jsx').withImports;
    for (const name of ['saveDraftContent', 'getPageVersionSnapshot', 'effectiveContent']) {
      assert.equal(route.includes(name), false, `the published view reaches ${name}`);
    }
  });
});

test('the gate helper is total and its conditions are independent', async (t) => {
  const ok = { pendingDraft: true, publishedVersion: 3, hasVersionRow: false, previewEnabled: true };

  await t.test('all three hold → offered', () => {
    assert.equal(canOfferPublishedView(ok), true);
  });

  await t.test('dropping ANY one of the three refuses', () => {
    assert.equal(canOfferPublishedView({ ...ok, pendingDraft: false }), false, 'no draft still offered');
    assert.equal(canOfferPublishedView({ ...ok, previewEnabled: false }), false, 'no preview link still offered');
    assert.equal(canOfferPublishedView({ ...ok, publishedVersion: 0 }), false, 'never published still offered');
  });

  await t.test('a surviving version row substitutes for the counter', () => {
    // The un-backfilled database: no counter, but history exists.
    assert.equal(canOfferPublishedView({ ...ok, publishedVersion: null, hasVersionRow: true }), true);
    assert.equal(canOfferPublishedView({ ...ok, publishedVersion: null, hasVersionRow: false }), false);
  });
});
