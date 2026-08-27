import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { backupCanPreserve, unsavedNotBackedUpNote, restoreWouldLoseWork } from '@/lib/pageBuilder/editorStatus';
import { VersionHistory } from '@/components/pageBuilder/editor/VersionHistory';
import { DRAFT_BACKUP_LABEL } from '@/lib/pageBuilder/versionLabel';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * ROUND 37, commit 2 — the choice offered at restore time.
 *
 * The dialog is a Radix portal and renders zero bytes here, and the runner
 * never mounts a React root, so the ORDERING and the DEFAULT are asserted from
 * the source and from the two pure predicates. What actually happens to a
 * draft in each case is DRIVEN in the suite's single fakeDb owner.
 */

const SRC = 'src/components/pageBuilder/editor/VersionHistory.jsx';

test('the two predicates ask different questions, and must', async (t) => {
  const state = (over = {}) => ({
    hadDraft: false, contentDirty: false, identityDirty: false, ...over,
  });

  await t.test('restoreWouldLoseWork covers BOTH losses — unchanged from round 34', () => {
    assert.equal(restoreWouldLoseWork(state({ hadDraft: true })), true);
    assert.equal(restoreWouldLoseWork(state({ contentDirty: true })), true);
    assert.equal(restoreWouldLoseWork(state({ identityDirty: true })), true);
    assert.equal(restoreWouldLoseWork(state()), false);
  });

  await t.test('backupCanPreserve covers only the STORED draft', () => {
    // The backup reads the page document on the SERVER. Keystrokes inside the
    // 5s debounce have never been sent, so there is nothing there to copy.
    assert.equal(backupCanPreserve(state({ hadDraft: true })), true);
    assert.equal(backupCanPreserve(state({ contentDirty: true })), false,
      'the UI would offer to preserve work the server has never seen');
    assert.equal(backupCanPreserve(state({ identityDirty: true })), false);
    assert.equal(backupCanPreserve(state()), false);
  });

  await t.test('CONTROL: the two genuinely disagree, on a state that matters', () => {
    // Local edits only: something WOULD be lost, and the backup cannot save it.
    // If these two ever agreed everywhere, one of them would be redundant and
    // the honest caveat below would have no subject.
    const localOnly = state({ contentDirty: true });
    assert.equal(restoreWouldLoseWork(localOnly), true);
    assert.equal(backupCanPreserve(localOnly), false);
    assert.notEqual(restoreWouldLoseWork(localOnly), backupCanPreserve(localOnly));
  });

  await t.test('the caveat appears exactly when the backup cannot reach the work', () => {
    assert.equal(unsavedNotBackedUpNote(state({ contentDirty: true })),
      'การแก้ไขที่ยังไม่บันทึกในแท็บนี้จะไม่ถูกสำรอง เพราะยังไม่ได้ส่งไปที่เซิร์ฟเวอร์');
    assert.equal(unsavedNotBackedUpNote(state({ identityDirty: true })).length > 0, true);
    assert.equal(unsavedNotBackedUpNote(state({ hadDraft: true })), '',
      'a stored draft IS backed up — the caveat must not claim otherwise');
    assert.equal(unsavedNotBackedUpNote(state()), '');
    assert.equal(unsavedNotBackedUpNote(null), '');
  });
});

test('the DEFAULT path preserves', async (t) => {
  const src = readSource(SRC).withImports;

  await t.test("restore's own signature defaults to backup", () => {
    // A default that lives only in the markup is one the next caller forgets.
    // This one means restore(version) preserves, and destroying takes saying so.
    assert.match(
      src, /const restore = useCallback\(async \(version, mode = 'backup'\)/,
      'restore no longer defaults to the preserving path'
    );
  });

  await t.test('the confirmation calls it with NO mode — so the default is what fires', () => {
    assert.match(src, /onConfirm=\{\(mode\) => restore\(pending, mode\)\}/);
    assert.match(src, /onClick=\{\(\) => onConfirm\(\)\}/,
      'the primary button now names a mode explicitly instead of taking the default');
  });

  await t.test('the destructive path must be aimed at, by name', () => {
    assert.match(src, /data-testid="confirm-restore-replace"[\s\S]{0,200}?onClick=\{\(\) => onConfirm\('replace'\)\}/,
      'the replace path is no longer an explicit, separately-named choice');
    assert.ok(src.includes('เขียนทับโดยไม่สำรอง'), 'the replace button copy changed');
    assert.ok(src.includes('สำรองฉบับร่างเดิมไว้ แล้วกู้คืน'), 'the preserving button copy changed');
  });

  await t.test('CONTROL: a replace-by-default signature would NOT satisfy that', () => {
    const flipped = "const restore = useCallback(async (version, mode = 'replace') => {";
    assert.equal(
      /const restore = useCallback\(async \(version, mode = 'backup'\)/.test(flipped), false,
      'the default-path matcher cannot tell backup from replace'
    );
  });

  await t.test('the second button is offered ONLY when there is something to preserve', () => {
    // With nothing stored, both paths do the same thing, and a choice between
    // two identical outcomes teaches the author the distinction is decorative.
    assert.match(src, /\{canBackup && \(\s*<button[\s\S]{0,200}?confirm-restore-replace/,
      'the replace choice is no longer gated on a draft existing');
    assert.match(src, /canBackup=\{backupCanPreserve\(editor\)\}/);
  });
});

test('F — the backup is strictly before the write that destroys, and aborts', async (t) => {
  const src = readSource(SRC).withImports;

  await t.test('the order in the source is read, then back up, then overwrite', () => {
    const fetchAt = src.indexOf('getPageVersionSnapshot(version._id)');
    const backupAt = src.indexOf('backupDraftBeforeRestore(pageId');
    const writeAt = src.indexOf('saveDraftContent(pageId');
    assert.ok(fetchAt > -1 && backupAt > -1 && writeAt > -1, 'one of the three steps is gone');
    assert.ok(fetchAt < backupAt, 'a backup row is written before the version is known to exist');
    assert.ok(backupAt < writeAt, 'the draft is overwritten before it is backed up — the loss this round prevents');
  });

  await t.test('a failed backup RETURNS rather than falling through', () => {
    // The whole ordering argument is worthless if the failure branch continues.
    assert.match(
      src, /if \(!backup\?\.ok\) \{[\s\S]{0,400}?setBusy\(null\);\s*return;\s*\}/,
      'a failed backup no longer aborts the restore'
    );
  });

  await t.test('CONTROL: the order probe can come out the other way', () => {
    const bad = 'await saveDraftContent(pageId, x, t);\nawait backupDraftBeforeRestore(pageId, t);';
    assert.equal(
      bad.indexOf('backupDraftBeforeRestore(pageId') < bad.indexOf('saveDraftContent(pageId'), false,
      'the ordering probe accepts a backup written after the overwrite'
    );
  });

  await t.test('G — saveDraftContent is still called from exactly one place here', () => {
    // The backup is NOT a second write path into the draft: it writes to
    // page_versions and nothing else.
    assert.equal(countCallSites(readSource(SRC).code, 'saveDraftContent'), 1,
      'the restore gained a second draft write');
    assert.equal(countCallSites(readSource(SRC).code, 'backupDraftBeforeRestore'), 1,
      'the backup action is called from more than one place');
  });

  await t.test('the backup action writes no draft of its own', () => {
    const actions = readSource('src/lib/actions/pageBuilder.js').raw;
    const at = actions.indexOf('export async function backupDraftBeforeRestore(');
    const body = actions.slice(at, actions.indexOf('\nexport async function ', at + 1));
    assert.equal(/\$set:\s*\{\s*draft/.test(body), false, 'the backup action writes the draft');
    assert.equal(body.includes('findByIdAndUpdate'), false, 'the backup action mutates the page document');
    assert.equal(body.includes('backupDraftVersion('), true, 'the backup action no longer writes a backup');
  });
});

/**
 * ── B, RENDERED — the case the first cut of this round MISSED ──────────────
 * Commit 1 asserted the marker RULE by re-deriving it inside the test
 * (`rows.find(v => !isDraftBackup(v))`). That is a test asserting its own
 * arithmetic: pointing the component back at `rows[0]` reddened NOTHING, which
 * was found by running the control the brief asked for rather than by reading.
 *
 * These read the rendered DOM instead, on a fixture where the two rules
 * genuinely disagree — a backup newer than the publish it protects, which is
 * the state every restore produces.
 */
const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const ROWS_BACKUP_NEWEST = [
  { _id: 'v-backup', label: DRAFT_BACKUP_LABEL, actor: { name: 'Restorer C' }, versionNumber: null, createdAt: '2026-08-27T02:00:00.000Z' },
  { _id: 'v-pub', label: 'publish', actor: { name: 'Publisher B' }, versionNumber: 2, createdAt: '2026-08-20T02:00:00.000Z' },
];

const EDITOR = (over = {}) => ({
  pageId: 'p1', savedUpdatedAt: 'T0', dispatch: () => {},
  saving: false, conflict: null, hadDraft: false, contentDirty: false, identityDirty: false,
  page: { status: 'published', slug: 'live-slug' },
  publishedVersion: 2, previewEnabled: true, ...over,
});

const historyDoc = (over = {}) => docOf(renderToStaticMarkup(createElement(VersionHistory, {
  pageId: 'p1', open: true, editor: EDITOR(), initialRows: ROWS_BACKUP_NEWEST, ...over,
})));

test('B — the ปัจจุบัน marker lands on the VERSION, not the newer backup', async (t) => {
  await t.test('the marker is on the publish row', () => {
    const doc = historyDoc();
    const rows = [...doc.querySelectorAll('li')];
    assert.equal(rows.length, 2, 'the fixture stopped rendering both rows');
    const marker = doc.querySelector('[data-testid="version-live-marker"]');
    assert.ok(marker, 'no current-version marker rendered');
    assert.equal(rows[1].contains(marker), true,
      'the live marker is on the BACKUP row — a row that was never public is named as live');
    assert.equal(rows[0].contains(marker), false);
  });

  await t.test('CONTROL: the backup really IS the newer row in this fixture', () => {
    // Without this, "the marker is on row 2" would pass for a fixture in which
    // row 2 is simply the only candidate.
    assert.equal(ROWS_BACKUP_NEWEST[0].label, DRAFT_BACKUP_LABEL);
    assert.ok(new Date(ROWS_BACKUP_NEWEST[0].createdAt) > new Date(ROWS_BACKUP_NEWEST[1].createdAt),
      'the fixture does not put a backup ahead of the publish — it proves nothing');
  });

  await t.test('the backup row reads as a backup, not as an unlabelled row', () => {
    const doc = historyDoc();
    const text = [...doc.querySelectorAll('li')][0].textContent;
    assert.ok(text.includes('สำรองฉบับร่าง'), 'the backup row lost its leading label');
    assert.ok(text.includes('สำรองไว้ก่อนกู้คืน'), 'the backup row lost its kind label');
    assert.equal(text.includes('draft-backup'), false,
      'the raw ASCII label leaked into a Thai list');
    assert.equal(text.includes('เวอร์ชัน'), false, 'the backup row claims a version number');
  });

  await t.test('and the publish row still carries its number', () => {
    const text = [...historyDoc().querySelectorAll('li')][1].textContent;
    assert.ok(text.includes('เวอร์ชัน 2'), 'the published version lost its number');
  });

  await t.test('a page whose ONLY rows are backups marks nothing as live', () => {
    const doc = historyDoc({ initialRows: [ROWS_BACKUP_NEWEST[0]] });
    assert.equal(doc.querySelector('[data-testid="version-live-marker"]'), null,
      'a page that has never published marks a backup as the live version');
  });
});
