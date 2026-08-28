import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { VersionHistory } from '@/components/pageBuilder/editor/VersionHistory';
import { DRAFT_BACKUP_LABEL } from '@/lib/pageBuilder/versionLabel';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this repo.
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 41, commit 2 — ประวัติการเผยแพร่ as a timeline and a detail panel.
 *
 * Rows and the SELECTION are both seeded, for round 34's reason: the list
 * arrives from a useEffect, a click is what sets the selection, and the runner
 * neither runs effects nor mounts a root. test/render/versionRestore pins that
 * production passes neither seed.
 *
 * Everything about the restore control's BEHAVIOUR stays in
 * test/render/versionRestore; this file is about the shape, the selection and
 * the two surfaces the round declined.
 */

const SRC = 'src/components/pageBuilder/editor/VersionHistory.jsx';
const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const ROWS = [
  { _id: 'v3', label: 'publish', actor: { name: 'Publisher B' }, versionNumber: 3, createdAt: '2026-08-26T11:41:02.774Z' },
  { _id: 'v2', label: 'publish', actor: { name: 'Author A' },    versionNumber: 2, createdAt: '2026-07-20T09:19:43.071Z' },
  { _id: 'v1', label: 'publish', actor: { name: 'Author A' },    versionNumber: 1, createdAt: '2026-07-16T07:54:09.251Z' },
];

/** Round 37's shape: a backup written at restore time, NEWER than the publish. */
const WITH_BACKUP = [
  { _id: 'bk', label: DRAFT_BACKUP_LABEL, actor: { name: 'Restorer C' }, versionNumber: null, createdAt: '2026-08-27T02:00:00.000Z' },
  ...ROWS,
];

const EDITOR = (over = {}) => ({
  pageId: 'p1', savedUpdatedAt: 'T0', dispatch: () => {},
  saving: false, conflict: null, hadDraft: false,
  contentDirty: false, identityDirty: false,
  page: { status: 'published', slug: 'live-slug' },
  publishedVersion: 3, previewEnabled: true,
  ...over,
});

const historyDoc = (over = {}) => docOf(renderToStaticMarkup(createElement(VersionHistory, {
  pageId: 'p1', open: true, editor: EDITOR(), initialRows: ROWS, ...over,
})));

const entries = (doc) => [...doc.querySelectorAll('[data-testid="version-entry"]')];
const detail = (doc) => doc.querySelector('[data-testid="version-detail"]');
const detailField = (doc, name) => detail(doc)
  ?.querySelector(`[data-testid="version-detail-${name}"]`)?.textContent?.trim() ?? null;
const dotKinds = (doc) => [...doc.querySelectorAll('[data-testid="version-dot"]')]
  .map((d) => d.getAttribute('data-kind'));

// ── E: the two-column shape ────────────────────────────────────────────────

test('the section is a timeline of entries beside one detail panel', async (t) => {
  await t.test('one entry per row, and exactly one panel', () => {
    const doc = historyDoc();
    assert.equal(doc.querySelectorAll('li').length, 3, 'the timeline stopped rendering its rows');
    assert.equal(entries(doc).length, 3, 'there is not one selectable entry per version');
    assert.equal(doc.querySelectorAll('[data-testid="version-detail"]').length, 1,
      'the detail panel is not exactly one');
  });

  await t.test('the panel is a SIBLING of the list, not inside it', () => {
    // A panel nested in the <ul> would be a fourth row, and every count of
    // versions in this suite would silently start including it.
    const doc = historyDoc();
    assert.equal(doc.querySelector('ul').contains(detail(doc)), false,
      'the detail panel renders inside the timeline list');
  });

  await t.test('each entry carries a status dot, its number, its date and its kind', () => {
    const doc = historyDoc();
    assert.deepEqual(dotKinds(doc), ['version', 'version', 'version']);
    const first = entries(doc)[0].textContent.replace(/\s+/g, ' ').trim();
    assert.ok(first.includes('เวอร์ชัน 3'), 'the entry lost its number');
    assert.ok(first.includes('2569'), 'the entry lost its date');
    assert.ok(first.includes('เผยแพร่'), 'the entry lost its kind');
    assert.ok(first.includes('Publisher B'), 'the entry lost its actor');
  });

  await t.test('CONTROL: an empty list renders neither a timeline nor a panel', () => {
    // Without this, "one panel" would pass for a component that renders a fixed
    // panel unrelated to the data.
    const doc = historyDoc({ initialRows: [] });
    assert.deepEqual(entries(doc), []);
    assert.equal(detail(doc), null);
  });
});

test('COLOUR comes from tokens — no hex is read out of the design', () => {
  /**
   * Rounds 28/30/39's standing rule. The version-history frames carry their own
   * palette; what is taken from them is the SHAPE. A literal hex in this file
   * would be a colour that cannot follow the theme and that no token owns.
   */
  const { code } = readSource(SRC);
  const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hexes, [], `VersionHistory names raw colours: ${hexes.join(', ')}`);
});

test('CONTROL: the hex matcher does see one', () => {
  assert.deepEqual('bg-[#1A2D42]'.match(/#[0-9a-fA-F]{3,8}\b/g), ['#1A2D42'],
    'the hex matcher does not work, so the check above means nothing');
});

// ── the selection drives the panel ─────────────────────────────────────────

test('the SELECTED entry is what the detail panel describes', async (t) => {
  await t.test('a selection that is not the newest is what renders', () => {
    const doc = historyDoc({ initialSelectedId: 'v1' });
    assert.equal(detailField(doc, 'title'), 'เวอร์ชัน 1');
    assert.equal(detailField(doc, 'actor'), 'Author A');
  });

  await t.test('CONTROL: the newest row would say something ELSE', () => {
    // Without this, "เวอร์ชัน 1" could be read as a fixture in which every row
    // says the same thing — and a panel hardcoded to rows[0] would pass.
    const hardcodedToNewest = historyDoc();
    assert.equal(detailField(hardcodedToNewest, 'title'), 'เวอร์ชัน 3');
    assert.equal(detailField(hardcodedToNewest, 'actor'), 'Publisher B');
    assert.notEqual(detailField(historyDoc({ initialSelectedId: 'v1' }), 'title'),
      detailField(hardcodedToNewest, 'title'));
  });

  await t.test('every row is selectable, and each one describes itself', () => {
    for (const [id, title, actor] of [['v3', 'เวอร์ชัน 3', 'Publisher B'], ['v2', 'เวอร์ชัน 2', 'Author A'], ['v1', 'เวอร์ชัน 1', 'Author A']]) {
      const doc = historyDoc({ initialSelectedId: id });
      assert.equal(detailField(doc, 'title'), title, `${id} did not drive the panel`);
      assert.equal(detailField(doc, 'actor'), actor, `${id} named the wrong publisher`);
    }
  });

  await t.test('the selected entry is marked in the timeline, and only it', () => {
    const doc = historyDoc({ initialSelectedId: 'v2' });
    const marked = entries(doc).filter((b) => b.getAttribute('data-selected') === 'true');
    assert.equal(marked.length, 1, 'the timeline does not mark exactly one entry as selected');
    assert.equal(entries(doc)[1], marked[0], 'the wrong entry is marked selected');
  });

  await t.test('with nothing selected the NEWEST stands in — a default, not a hardcode', () => {
    assert.equal(detailField(historyDoc(), 'title'), 'เวอร์ชัน 3');
    assert.equal(entries(historyDoc())[0].getAttribute('data-selected'), 'true');
  });

  await t.test('a selection naming a row that is gone falls back rather than emptying', () => {
    // The reload case: the list is refetched and the row the id named is no
    // longer in it. A panel keyed off a held object would render a version that
    // is not in the list beside it.
    const doc = historyDoc({ initialSelectedId: 'no-such-row' });
    assert.equal(detailField(doc, 'title'), 'เวอร์ชัน 3');
    assert.equal(detail(doc).textContent.includes('undefined'), false);
  });

  await t.test('the click on an entry SELECTS — it does not write', () => {
    const src = readSource(SRC).withImports;
    assert.match(src, /data-testid="version-entry"[\s\S]{0,240}?onClick=\{\(\) => setSelectedId\(v\._id\)\}/,
      'the timeline entry no longer selects');
    assert.equal(/onClick=\{\(\) => restore\(/.test(src), false,
      'a control calls restore() directly, so the confirmation can be bypassed');
  });
});

// ── F: where each field comes from ─────────────────────────────────────────

test('every field in the panel is the ROW’s own — PageVersion, not the audit log', async (t) => {
  await t.test('number, kind, date and publisher all read from the selected row', () => {
    const doc = historyDoc({ initialSelectedId: 'v2' });
    assert.equal(detailField(doc, 'title'), 'เวอร์ชัน 2');     // versionNumber
    assert.equal(detailField(doc, 'kind'), 'เผยแพร่');          // label
    assert.ok(detailField(doc, 'when').includes('2569'));       // createdAt
    assert.equal(detailField(doc, 'actor'), 'Author A');        // actor
  });

  await t.test('the section reaches for no audit-log read at all', () => {
    /**
     * Round 38 measured that no audit row carries a version number or a version
     * id, so a publish row cannot be joined to the version it produced.
     * PageVersion.actor is the authority for "who published version N" (round
     * 36); a second answer sourced here could disagree and nothing could
     * arbitrate between them.
     */
    const { withImports } = readSource(SRC);
    for (const name of ['getPageAuditLog', 'auditRowLine', 'auditActorName', 'PageAuditLog']) {
      assert.equal(withImports.includes(name), false,
        `VersionHistory reaches for '${name}' — the audit log cannot name a version, and this `
        + 'panel would then carry a second answer to who published one');
    }
  });

  await t.test('CONTROL: the same reader DOES see a name that is present', () => {
    assert.equal(readSource(SRC).withImports.includes('getPageVersions'), true,
      'the scanner is reading the wrong file');
  });

  await t.test('an unnamed publisher renders NO field rather than a placeholder', () => {
    // Round 26's rule, repeated by auditActorName: an invented placeholder is
    // worse than an absent one because it looks like data.
    const doc = historyDoc({ initialRows: [{ ...ROWS[0], actor: { name: '' } }] });
    assert.equal(detailField(doc, 'actor'), null, 'an empty publisher field rendered');
    for (const bad of ['undefined', 'null', 'ไม่ทราบ', '—']) {
      assert.equal(detail(doc).textContent.includes(bad), false, `the panel prints "${bad}"`);
    }
  });

  await t.test('an unnumbered version names itself by kind, never "เวอร์ชัน" alone', () => {
    // The pre-backfill state, which until the migration runs is every row.
    const doc = historyDoc({ initialRows: ROWS.map(({ versionNumber, ...r }) => ({ ...r, versionNumber: null })) });
    assert.equal(detailField(doc, 'title'), 'เผยแพร่');
    assert.equal(detail(doc).textContent.includes('เวอร์ชัน '), false,
      'the panel prints an empty version number');
  });
});

// ── H: round 37's backup rows and round 35's marker both survive ───────────

test('a backup renders as a backup, and the ปัจจุบัน marker steps over it', async (t) => {
  const backupDoc = (over = {}) => historyDoc({ initialRows: WITH_BACKUP, ...over });

  await t.test('CONTROL: the backup really IS the newest row in this fixture', () => {
    assert.equal(WITH_BACKUP[0].label, DRAFT_BACKUP_LABEL);
    assert.ok(new Date(WITH_BACKUP[0].createdAt) > new Date(WITH_BACKUP[1].createdAt),
      'the fixture does not put a backup ahead of the publish — it proves nothing');
  });

  await t.test('its DOT differs from a version’s', () => {
    // It was never public and it carries no number, so it cannot be told from a
    // version by its leading text alone.
    assert.deepEqual(dotKinds(backupDoc()), ['backup', 'version', 'version', 'version']);
  });

  await t.test('its ENTRY leads with the backup word and claims no number', () => {
    const first = entries(backupDoc())[0].textContent.replace(/\s+/g, ' ').trim();
    assert.ok(first.includes('สำรองฉบับร่าง'), 'the backup entry lost its leading label');
    assert.ok(first.includes('สำรองไว้ก่อนกู้คืน'), 'the backup entry lost its kind label');
    assert.equal(first.includes('เวอร์ชัน'), false, 'the backup entry claims a version number');
    assert.equal(first.includes(DRAFT_BACKUP_LABEL), false, 'the raw ASCII label leaked into a Thai list');
  });

  await t.test('its PANEL names the dates and the actor in backup terms', () => {
    // 'วันที่เผยแพร่' would be false of a row that was never published, and
    // 'ผู้เผยแพร่' would name somebody as a publisher who restored.
    const doc = backupDoc();
    assert.equal(detailField(doc, 'title'), 'สำรองฉบับร่าง');
    assert.equal(detailField(doc, 'kind'), 'สำรองไว้ก่อนกู้คืน');
    assert.equal(detailField(doc, 'actor'), 'Restorer C');
    const panel = detail(doc).textContent;
    assert.ok(panel.includes('วันที่สำรอง'), 'the backup panel dates it as a publication');
    assert.equal(panel.includes('วันที่เผยแพร่'), false, 'the backup panel says it was published');
    assert.equal(panel.includes('ผู้เผยแพร่'), false, 'the backup panel names a publisher');
  });

  await t.test('CONTROL: a VERSION’s panel uses the publish wording', () => {
    const panel = detail(historyDoc()).textContent;
    assert.ok(panel.includes('วันที่เผยแพร่'));
    assert.ok(panel.includes('ผู้เผยแพร่'));
  });

  await t.test('the ปัจจุบัน marker takes the newest NON-backup row', () => {
    const doc = backupDoc();
    const marker = doc.querySelector('[data-testid="version-live-marker"]');
    assert.ok(marker, 'no current-version marker rendered');
    const rows = [...doc.querySelectorAll('li')];
    assert.equal(rows[1].contains(marker), true,
      'the live marker is on the BACKUP row — a row that was never public is named as live');
    assert.equal(rows[0].contains(marker), false);
  });

  await t.test('a page whose ONLY rows are backups marks nothing as live', () => {
    const doc = historyDoc({ initialRows: [WITH_BACKUP[0]] });
    assert.equal(doc.querySelector('[data-testid="version-live-marker"]'), null,
      'a page that has never published marks a backup as the live version');
  });
});

// ── G: the two surfaces this round declines ───────────────────────────────

/**
 * Round 33's don't-build list, each with the measurement that declined it, held
 * as an ABSENCE in the rendered output and in the source. The failure worth
 * catching is a later round adding one back without adding the data behind it —
 * round 27's JSON-LD claim-vocabulary shape.
 */
const DECLINED = Object.freeze([
  ['the semantic change summary',
    ['สรุปการเปลี่ยนแปลง', 'สิ่งที่เปลี่ยน', 'เปลี่ยนจาก'],
    'audit before/after are PRESENCE FLAGS — round 38 measured 23 of 25 update rows with '
    + 'before identical to after, and the read does not even ship the two fields'],
  ['the page snapshot thumbnail',
    ['thumbnail', 'ภาพตัวอย่างหน้า', 'screenshot', '<img'],
    'nothing in this repo can rasterise a page (no puppeteer, playwright, sharp or satori) and '
    + 'a thumbnail would be an asset owned by a row that nothing may delete'],
]);

test('the timeline claims neither declined surface', () => {
  const doc = historyDoc({ initialRows: WITH_BACKUP });
  const text = doc.body.textContent.replace(/\s+/g, ' ');
  const { code } = readSource(SRC);
  for (const [what, vocabulary, evidence] of DECLINED) {
    for (const claim of vocabulary) {
      assert.equal(text.includes(claim), false,
        `the version history renders "${claim}", which belongs to the declined surface "${what}". `
        + `It was declined because ${evidence}.`);
      assert.equal(code.includes(claim), false,
        `VersionHistory.jsx contains "${claim}" — see "${what}": ${evidence}.`);
    }
  }
  // …and no image element of any kind reached the markup.
  assert.deepEqual([...doc.querySelectorAll('img, canvas, picture, svg image')], []);
});

test('CONTROL: the same reader DOES catch each declined claim when planted', () => {
  // Without this, the sweep above passes for a reader that sees nothing. One
  // planted claim per declined surface, so no branch of the list is untested.
  for (const [, vocabulary] of DECLINED) {
    const planted = docOf(`<p>${vocabulary[0]}</p><img alt="" src="x" />`);
    assert.equal(planted.body.textContent.includes(vocabulary[0]), true,
      'the reader cannot see planted markup');
    assert.equal(planted.querySelectorAll('img').length, 1,
      'the image reader cannot see a planted thumbnail');
  }
  // …and it is reading the rendered text, not an empty string.
  assert.ok(historyDoc().body.textContent.includes('เผยแพร่'));
});

test('nothing in the repo could rasterise a page, so the thumbnail has no source', () => {
  // The measurement behind the second declined surface, held rather than
  // restated: if one of these ever lands, the claim above needs re-deciding
  // rather than silently continuing to be true for a different reason.
  const pkg = JSON.parse(readSource('package.json').raw);
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const renderer of ['puppeteer', 'playwright', 'sharp', 'satori', 'puppeteer-core', '@sparticuz/chromium']) {
    assert.equal(deps.includes(renderer), false,
      `${renderer} is now a dependency — the page-snapshot thumbnail was declined partly because `
      + 'nothing here can rasterise a page, and that reason has changed');
  }
  assert.ok(deps.length > 20, 'the dependency reader found almost nothing — it is not working');
});
