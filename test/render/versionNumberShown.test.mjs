import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { VersionHistory, restoreWarning } from '@/components/pageBuilder/editor/VersionHistory';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 35, commit 2 — the number, RENDERED.
 *
 * Rows are seeded through `initialRows` for round 34's reason: the list arrives
 * from a useEffect, effects do not run under renderToStaticMarkup, and the
 * runner never mounts a React root. The confirmation is a Radix portal and
 * renders zero bytes here, so its text is asserted through the exported
 * `restoreWarning` and the descriptor that feeds it.
 */

const SRC = 'src/components/pageBuilder/editor/VersionHistory.jsx';

const numbered = [
  { _id: 'v3', label: 'publish', actor: { name: 'Publisher B' }, versionNumber: 3, createdAt: '2026-08-26T11:41:02.774Z' },
  { _id: 'v2', label: 'publish', actor: { name: 'Author A' }, versionNumber: 2, createdAt: '2026-07-20T09:19:43.071Z' },
  { _id: 'v1', label: 'publish', actor: { name: 'Author A' }, versionNumber: 1, createdAt: '2026-07-16T07:54:09.251Z' },
];

/** The pre-backfill state — which, until the migration runs, is every row. */
const unnumbered = numbered.map(({ versionNumber, ...rest }) => ({ ...rest, versionNumber: null }));

const EDITOR = (over = {}) => ({
  pageId: 'p1', savedUpdatedAt: 'T0', dispatch: () => {},
  saving: false, conflict: null, hadDraft: false,
  contentDirty: false, identityDirty: false,
  page: { status: 'published' },
  ...over,
});

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const historyDoc = (over = {}) => docOf(renderToStaticMarkup(createElement(VersionHistory, {
  pageId: 'p1', open: true, editor: EDITOR(), initialRows: numbered, ...over,
})));

const numbersIn = (doc) => [...doc.querySelectorAll('[data-testid="version-number"]')]
  .map((el) => el.textContent.replace(/\s*·\s*$/, '').trim());
const liveMarkers = (doc) => [...doc.querySelectorAll('[data-testid="version-live-marker"]')];

test('the history list names each version by number', async (t) => {
  await t.test('every row carries its own number, in list order', () => {
    assert.deepEqual(numbersIn(historyDoc()), ['เวอร์ชัน 3', 'เวอร์ชัน 2', 'เวอร์ชัน 1']);
  });

  await t.test('the number is the ROW’s, not its position', () => {
    // A page whose oldest rows were pruned: the numbers survive the gap. A
    // position-derived label would read 3,2,1 here and be wrong on every row.
    const gapped = [
      { ...numbered[0], versionNumber: 12 },
      { ...numbered[1], versionNumber: 9 },
    ];
    assert.deepEqual(numbersIn(historyDoc({ initialRows: gapped })), ['เวอร์ชัน 12', 'เวอร์ชัน 9']);
  });

  await t.test('CONTROL: a position-derived label WOULD disagree with that fixture', () => {
    // Without this, "12, 9" could be read as a coincidence of the fixture.
    const byPosition = [1, 2].map((_, i) => `เวอร์ชัน ${2 - i}`);
    assert.deepEqual(byPosition, ['เวอร์ชัน 2', 'เวอร์ชัน 1']);
    assert.notDeepEqual(byPosition, ['เวอร์ชัน 12', 'เวอร์ชัน 9']);
  });

  await t.test('the date, label and actor are all still there', () => {
    // The number is added beside what round 34 rendered, not in place of it.
    const text = historyDoc().body.textContent;
    assert.equal(text.includes('เผยแพร่'), true, 'the label is gone');
    assert.equal(text.includes('Publisher B'), true, 'the actor is gone');
    assert.equal(text.includes('2569'), true, 'the Thai-year date is gone');
  });
});

test('an unnumbered row shows no number — never "undefined"', async (t) => {
  await t.test('the segment is absent entirely, and so is its element', () => {
    const doc = historyDoc({ initialRows: unnumbered });
    assert.deepEqual(numbersIn(doc), [], 'a number rendered for an unnumbered row');
    assert.equal(doc.querySelectorAll('li').length, 3, 'the rows themselves stopped rendering');
  });

  await t.test('and the words undefined / null / NaN appear nowhere', () => {
    const text = historyDoc({ initialRows: unnumbered }).body.textContent;
    for (const bad of ['undefined', 'null', 'NaN', 'เวอร์ชัน ']) {
      assert.equal(text.includes(bad), false, `the pre-backfill list renders "${bad}"`);
    }
  });

  await t.test('an un-migrated list still shows date, label and actor', () => {
    // The fallback degrades to round 34's exact rendering rather than a broken
    // one — which is the whole reason the segment is omitted instead of dashed.
    const text = historyDoc({ initialRows: unnumbered }).body.textContent;
    assert.equal(text.includes('เผยแพร่'), true);
    assert.equal(text.includes('Author A'), true);
  });

  await t.test('a PARTIALLY backfilled page numbers only what it can', () => {
    const mixed = [numbered[0], { ...numbered[1], versionNumber: null }];
    assert.deepEqual(numbersIn(historyDoc({ initialRows: mixed })), ['เวอร์ชัน 3']);
  });
});

test('the list marks which version the public is reading', async (t) => {
  await t.test('exactly one marker, on the newest row', () => {
    const doc = historyDoc();
    const marks = liveMarkers(doc);
    assert.equal(marks.length, 1, 'the live marker is not on exactly one row');
    const firstRow = doc.querySelectorAll('li')[0];
    assert.equal(firstRow.contains(marks[0]), true, 'the marker is not on the newest row');
    assert.equal(marks[0].textContent.trim(), 'ปัจจุบัน');
  });

  await t.test('a scheduled page is live too', () => {
    assert.equal(liveMarkers(historyDoc({ editor: EDITOR({ page: { status: 'scheduled' } }) })).length, 1);
  });

  await t.test('NO marker when the page is not live — history outlives publication', () => {
    // A page that has been unpublished still has versions. Marking its newest
    // row "ปัจจุบัน" would claim something is public that is not.
    for (const status of ['draft', 'closed', 'archived']) {
      const doc = historyDoc({ editor: EDITOR({ page: { status } }) });
      assert.equal(liveMarkers(doc).length, 0, `a ${status} page marks a version as live`);
      assert.equal(doc.querySelectorAll('li').length, 3, `the rows stopped rendering for ${status}`);
    }
  });

  await t.test('CONTROL: the same fixture DOES mark one when published', () => {
    // Proves the three cases above are about the status, not about a fixture
    // that can never produce a marker.
    assert.equal(liveMarkers(historyDoc({ editor: EDITOR({ page: { status: 'published' } }) })).length, 1);
  });

  await t.test('no marker when the editor is not threaded at all', () => {
    assert.equal(liveMarkers(historyDoc({ editor: null })).length, 0);
  });
});

test('the restore confirmation names the version', async (t) => {
  const src = readSource(SRC).withImports;

  await t.test('the descriptor carries the number alongside the date', () => {
    assert.match(src, /function versionDescriptor\(version\)/, 'the descriptor is gone');
    assert.match(src, /restoreWarning\(losesWork, versionDescriptor\(version\)\)/,
      'the confirmation no longer receives the descriptor');
  });

  await t.test('round 34’s sentence is untouched — only its argument got richer', () => {
    // The exact strings restoreWarning produces are asserted in
    // test/pure/versionRestore, unmodified this round. Feeding it a richer
    // descriptor was chosen precisely so that guard did not have to move.
    const WHEN = '16 ก.ค. 2569 14:54 (เวอร์ชัน 1)';
    assert.equal(
      restoreWarning(false, WHEN),
      `นำเนื้อหาของเวอร์ชันวันที่ ${WHEN} มาเป็นฉบับร่าง — หน้าที่เผยแพร่อยู่ตอนนี้ยังไม่เปลี่ยน จนกว่าจะกด “เผยแพร่”`
    );
    assert.equal(restoreWarning(false, WHEN).includes('เวอร์ชัน 1'), true,
      'the confirmation does not say which version');
  });

  await t.test('an unnumbered version still identifies itself by date alone', () => {
    assert.equal(restoreWarning(true, '16 ก.ค. 2569 14:54').includes('undefined'), false);
    assert.equal(restoreWarning(true, '16 ก.ค. 2569 14:54').includes('16 ก.ค. 2569'), true);
  });
});

test('the number has ONE definition, and this file is not it', async (t) => {
  await t.test('VersionHistory imports versionName and formats no label of its own', () => {
    const src = readSource(SRC).withImports;
    assert.match(src, /import \{ versionName \} from '@\/lib\/pageBuilder\/versionLabel'/,
      'the shared label helper is no longer imported');
    // Step 5's published-version view will need the identical answer; a second
    // formatter here is what would drift from it.
    assert.equal(/`เวอร์ชัน \$\{/.test(src), false,
      'VersionHistory builds its own version label — versionLabel.js owns that');
  });

  await t.test('CONTROL: the matcher does recognise an inline label', () => {
    assert.equal(/`เวอร์ชัน \$\{/.test('const s = `เวอร์ชัน ${n}`;'), true,
      'the inline-label matcher does not work, so the check above means nothing');
  });
});
