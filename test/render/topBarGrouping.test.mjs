import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { EditorTopBar } from '@/components/pageBuilder/editor/EditorTopBar';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this repo.
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 41, commit 3 — the top bar, regrouped.
 *
 * NOTHING HERE RE-TESTS K's FOUR CONSTRAINTS. Each already has an owner and a
 * parallel assertion would be a second authority over the same rule:
 *
 *   · no second save vocabulary        → test/render/publishedViewEntry
 *                                        ("the requirement's second sentence is
 *                                        NOT shipped") and test/pure/draftSaver.
 *   · the chip is server-confirmed     → test/render/draftVisibility
 *                                        ("the chip renders … when the STORED
 *                                        page has a draft", and the no-draft
 *                                        case) over hasPendingDraft.
 *   · ทิ้งฉบับร่าง keeps its confirmation → test/fs/draftVisibilityWiring and
 *                                        test/render/draftVisibility's
 *                                        disabled-state cases.
 *   · the link's three conditions      → test/render/publishedViewEntry's
 *                                        three-condition block.
 *
 * All four passed UNMODIFIED across this commit; that is the evidence they
 * still hold. This file covers only what is new: the arrangement, and the fact
 * that rearranging changed no write.
 */

const SRC = 'src/components/pageBuilder/editor/EditorTopBar.jsx';
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const noop = () => {};

const PAGE = (over = {}) => ({
  slug: 'live-slug', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  publishedVersion: 3,
  preview: { enabled: true, passwordHash: 'x' },
  draft: { title: 'Live Title', sections: [], savedAt: 'T', savedBy: { id: 'u', name: 'Editor B' } },
  ...over,
});

const topBar = (page = PAGE()) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(
  createElement(EditorProvider, { page, pageId: 'p1', updatedAt: 'T0', tier: TIER, currentUserName: 'Current C' },
    createElement(EditorTopBar, {
      onSave: noop, onOpenSettings: noop, onOpenPreview: noop, onPublish: noop, onDiscard: noop,
    }))
)}</body>`).window.document;

const buttonLabels = (doc) => [...doc.querySelectorAll('button')]
  .map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

// ── J: the inventory survives the regrouping ───────────────────────────────

/**
 * Every element the bar carried before this commit, with the round that added
 * it. The regrouping MOVED things; it removed nothing, and this is the list
 * that makes that checkable rather than asserted in prose.
 */
const INVENTORY = Object.freeze([
  ['the page name',            'the editor’s original bar', (d) => d.body.textContent.includes('Live Title')],
  ['the status chip',          'the editor’s original bar', (d) => [...d.querySelectorAll('span')].some((s) => s.textContent.trim() === 'เผยแพร่แล้ว')],
  ['the pending-draft chip',   'round 5',  (d) => d.querySelector('[data-testid="pending-draft-chip"]') !== null],
  ['the published-view link',  'round 36', (d) => d.querySelector('[data-testid="view-published-link"]') !== null],
  ['the saver line',           'round 34', (d) => d.querySelector('[data-testid="draft-saver-line"]') !== null],
  ['the save-state line',      'round 5',  (d) => d.querySelector('[data-testid="editor-state-line"]') !== null],
  ['ตั้งค่าหน้า',                'the editor’s original bar', (d) => buttonLabels(d).includes('ตั้งค่าหน้า')],
  ['บันทึกฉบับร่าง',             'the editor’s original bar', (d) => buttonLabels(d).includes('บันทึกฉบับร่าง')],
  ['ทิ้งฉบับร่าง',               'round 5',  (d) => buttonLabels(d).includes('ทิ้งฉบับร่าง')],
  ['Preview',                  'the editor’s original bar', (d) => buttonLabels(d).includes('Preview')],
  ['เผยแพร่',                    'the editor’s original bar', (d) => buttonLabels(d).includes('เผยแพร่')],
]);

test('every element the bar carried is still in it — nothing was removed', () => {
  const doc = topBar();
  for (const [what, added, present] of INVENTORY) {
    assert.equal(present(doc), true,
      `"${what}" (${added}) is gone from the top bar. Round 41 REGROUPED the bar; anything `
      + 'removed needs somewhere else for its information to live, and this one has nowhere.');
  }
  assert.equal(buttonLabels(doc).length, 5, 'the bar does not carry exactly five buttons');
});

test('CONTROL: the same inventory DOES notice an absence', () => {
  // Without this, the sweep above passes for a checker that inspects nothing.
  // A page with no pending draft loses the chip, the saver line, the link and
  // the discard button — four of the eleven, by their own conditions.
  const doc = topBar(PAGE({ draft: null }));
  const missing = INVENTORY.filter(([, , present]) => !present(doc)).map(([what]) => what);
  assert.deepEqual(missing.sort(),
    ['the pending-draft chip', 'the published-view link', 'the saver line', 'ทิ้งฉบับร่าง'].sort());
});

// ── the arrangement ────────────────────────────────────────────────────────

test('the page name LEADS — it is no longer fifth of six', () => {
  const doc = topBar();
  const left = doc.querySelector('header > div');
  const firstLine = left.querySelector('div');
  assert.ok(firstLine.textContent.startsWith('Live Title'),
    'the first line of the bar does not begin with the page name');
  // …and the chips follow it on that same line rather than preceding it.
  assert.ok(firstLine.querySelector('[data-testid="pending-draft-chip"]'),
    'the pending-draft chip left the identity line');
  assert.equal(firstLine.textContent.indexOf('Live Title')
    < firstLine.textContent.indexOf('มีฉบับร่างที่ยังไม่เผยแพร่'), true,
    'the chip still comes before the name it qualifies');
});

test('the three state elements sit on ONE line, in their own elements', () => {
  const line = topBar().querySelector('[data-testid="editor-state-line"]');
  assert.ok(line, 'the state line is gone');
  for (const id of ['view-published-link', 'draft-saver-line']) {
    assert.ok(line.querySelector(`[data-testid="${id}"]`), `${id} is not on the state line`);
  }
  // The saver line is still its own element with its own exact text — round 34's
  // claim, which a merged sentence would have destroyed.
  assert.equal(line.querySelector('[data-testid="draft-saver-line"]').textContent.trim(),
    'แก้ไขล่าสุดโดย Editor B');
});

test('no THIRD sentence was written to join the two — only a separator', () => {
  /**
   * Round 27's rule, at the place it would break. The saver line and the
   * save-state line are one vocabulary produced by two functions; a line that
   * reworded either into a combined sentence would be the second vocabulary.
   */
  const { code } = readSource(SRC);
  assert.match(code, /draftSaverLine\(editor\)/, 'the bar no longer calls draftSaverLine');
  assert.match(code, /statusLine\(editor\)/, 'the bar no longer calls statusLine');
  for (const invented of ['บันทึกแล้วเมื่อ', 'โดย ', 'ล่าสุด ', 'และ ']) {
    assert.equal(code.includes(`'${invented}`) || code.includes(`\`${invented}`), false,
      `the top bar composes "${invented}" itself — editorStatus.js owns both sentences`);
  }
});

test('the primary action stands outside the secondary cluster', () => {
  const doc = topBar();
  const cluster = doc.querySelector('[data-testid="editor-secondary-actions"]');
  const publish = doc.querySelector('[data-testid="publish-button"]');
  assert.ok(cluster, 'the secondary cluster is gone');
  assert.ok(publish, 'the publish button is gone');
  assert.equal(cluster.contains(publish), false,
    'เผยแพร่ is back inside the row of secondary buttons');
  assert.equal(publish.textContent.trim(), 'เผยแพร่');

  // The four that stay: settings, preview, save, discard — and only those.
  assert.deepEqual([...cluster.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    ['ตั้งค่าหน้า', 'Preview', 'บันทึกฉบับร่าง', 'ทิ้งฉบับร่าง']);
});

test('CONTROL: with no draft the cluster is three, and publish is still outside', () => {
  // Proves the grouping is about the cluster and not about a fixed markup shape.
  const doc = topBar(PAGE({ draft: null }));
  const cluster = doc.querySelector('[data-testid="editor-secondary-actions"]');
  assert.deepEqual([...cluster.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    ['ตั้งค่าหน้า', 'Preview', 'บันทึกฉบับร่าง']);
  assert.equal(cluster.contains(doc.querySelector('[data-testid="publish-button"]')), false);
});

// ── L: no button became a fourth write path ────────────────────────────────

/**
 * Every control in the bar, with the prop it dispatches through. This is the
 * whole of L: a regrouping may move a button anywhere it likes and must not
 * change what pressing it does.
 */
const WIRING = Object.freeze([
  ['ตั้งค่าหน้า',     /onClick=\{onOpenSettings\}/],
  ['Preview',       /onClick=\{onOpenPreview\}/],
  ['บันทึกฉบับร่าง',  /onClick=\{onSave\}/],
  ['ทิ้งฉบับร่าง',    /onClick=\{\(\) => setConfirmDiscard\(true\)\}/],
  ['เผยแพร่',        /onClick=\{onPublish\}/],
]);

test('every button dispatches exactly what it dispatched before', () => {
  const src = readSource(SRC).withImports;
  for (const [label, pattern] of WIRING) {
    assert.match(src, pattern, `the ${label} button no longer dispatches through its own prop`);
  }
  // The discard still goes through the confirmation, and the confirmation is
  // what calls the handler — round 5's shape, unmoved.
  assert.match(src, /onConfirm=\{\(\) => \{ setConfirmDiscard\(false\); onDiscard\?\.\(\); \}\}/,
    'the discard no longer runs through its confirmation');
});

test('the bar reaches no action, no dispatch and no model', () => {
  /**
   * The structural half of L. Every write in this editor goes through the three
   * paths rounds 5/34 established; a top-bar button that called an action
   * directly would be a fourth, and it would look exactly like the others.
   */
  const { withImports } = readSource(SRC);
  for (const name of ['@/lib/actions/', 'saveDraftContent', 'publishPageStatus', 'discardDraft', 'dispatch(']) {
    assert.equal(withImports.includes(name), false,
      `EditorTopBar reaches for '${name}'. The bar renders controls and calls the props its `
      + 'parent hands it; a write here would be a fourth write path.');
  }
});

test('CONTROL: the same reader DOES see a name that is present', () => {
  const { withImports } = readSource(SRC);
  assert.equal(withImports.includes('hasPendingDraft'), true,
    'the scanner is reading the wrong file — the chip’s own gate is not in it');
});

test('and no OTHER editor component started writing this round', () => {
  // Round 8's shape: count the doors rather than trusting the one that moved.
  const writers = walkSources('src/components/pageBuilder')
    .filter((f) => /\bsaveDraftContent\b/.test(f.withImports))
    .map((f) => f.rel)
    .sort();
  assert.deepEqual(writers, [
    'src/components/pageBuilder/editor/VersionHistory.jsx',
    'src/components/pageBuilder/editor/useEditorSave.js',
  ], 'the set of editor components that can write a draft changed');
});
