import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { VersionHistory } from '@/components/pageBuilder/editor/VersionHistory';
import { HistorySection } from '@/components/pageBuilder/editor/PageSettingsDialog';
import { readSource, countCallSites, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 34, commit 2 — the restore control, and the wire behind it.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE, STATED FIRST ───────────────────────
 * The runner renders STATIC markup and never mounts a React root (round 32:
 * with isolation:'none' one leaked root breaks unrelated files). Two things
 * follow, and both shape this file rather than being worked around:
 *
 *   · the list arrives from a useEffect, which does not run — so rows are
 *     seeded through `initialRows`, exactly as round 32 seeded `initialExpanded`
 *     to reach an open container. The last case here asserts HistorySection
 *     passes nothing, which is what keeps these claims about production.
 *   · the confirmation is a Radix `Dialog.Portal`, which renders ZERO BYTES
 *     under renderToStaticMarkup (round 27 measured it). Its TEXT is asserted
 *     by value in test/pure/versionRestore via the exported restoreWarning; its
 *     POSITION IN THE FLOW — that the button opens it rather than restoring —
 *     is asserted from the source below, because there is no other way to reach
 *     it and "the button restores directly" is precisely the defect that would
 *     make the confirmation decorative.
 */

const SRC = 'src/components/pageBuilder/editor/VersionHistory.jsx';
const SETTINGS = 'src/components/pageBuilder/editor/PageSettingsDialog.jsx';
const ACTIONS = 'src/lib/actions/pageBuilder.js';

const ROWS = [
  { _id: 'v2', label: 'publish', actor: { name: 'Publisher B' }, createdAt: '2026-08-02T03:00:00.000Z' },
  { _id: 'v1', label: 'publish', actor: { name: 'Author A' }, createdAt: '2026-08-01T03:00:00.000Z' },
];

const EDITOR = (over = {}) => ({
  pageId: 'p1', savedUpdatedAt: 'T0', dispatch: () => {},
  saving: false, conflict: null, hadDraft: false,
  contentDirty: false, identityDirty: false, ...over,
});

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const historyDoc = (over = {}) => docOf(renderToStaticMarkup(createElement(VersionHistory, {
  pageId: 'p1', open: true, editor: EDITOR(), initialRows: ROWS, ...over,
})));

const restoreButtons = (doc) => [...doc.querySelectorAll('[data-testid="restore-version-button"]')];

test('every version row carries its own restore control', async (t) => {
  await t.test('one restore button per row, and the rows are still there', () => {
    const doc = historyDoc();
    assert.equal(doc.querySelectorAll('li').length, 2, 'the list stopped rendering its rows');
    assert.equal(restoreButtons(doc).length, 2, 'there is not one restore control per version');
  });

  await t.test('CONTROL: no rows means no restore controls', () => {
    // Without this, "2 buttons" would pass for a component that renders a fixed
    // pair of buttons unrelated to the data.
    const doc = historyDoc({ initialRows: [] });
    assert.equal(restoreButtons(doc).length, 0, 'a restore control rendered with no versions');
    assert.equal(
      doc.body.textContent.includes('ยังไม่มีประวัติ'), true,
      'the empty state stopped saying that history is written on publish'
    );
  });

  await t.test('the control is enabled on a clean saved page', () => {
    for (const b of restoreButtons(historyDoc())) {
      assert.equal(b.hasAttribute('disabled'), false, 'restore is disabled when it should be offered');
    }
  });

  await t.test('and disabled mid-save, after a conflict, and with no editor at all', () => {
    const cases = [
      ['mid-save', { editor: EDITOR({ saving: true }) }],
      ['after a conflict', { editor: EDITOR({ conflict: { message: 'x' } }) }],
      ['with no editor threaded', { editor: null }],
    ];
    for (const [name, over] of cases) {
      const buttons = restoreButtons(historyDoc(over));
      assert.equal(buttons.length, 2, `the rows stopped rendering ${name}`);
      for (const b of buttons) {
        assert.equal(b.hasAttribute('disabled'), true, `restore is offered ${name}`);
      }
    }
  });

  await t.test('the restore control is offered when NO draft exists', () => {
    // The behaviour canRestoreVersion exists to keep distinct from discard:
    // restoring onto a clean page is the harmless case and the common one.
    for (const b of restoreButtons(historyDoc({ editor: EDITOR({ hadDraft: false }) }))) {
      assert.equal(b.hasAttribute('disabled'), false, 'restore requires a draft to exist');
    }
  });

  await t.test('the footnote says a restore does not change the published page', () => {
    assert.equal(
      historyDoc().body.textContent.includes('ไม่เปลี่ยนหน้าที่เผยแพร่อยู่ทันที'), true,
      'the list no longer says a restore writes a draft rather than publishing'
    );
  });
});

test('the restore goes through the confirmation, and through saveDraftContent', async (t) => {
  // `withImports` and not `code`: two of the claims below are about the CALL
  // (defect 5 — an imports-stripped read can be satisfied by the import line),
  // and one is about JSX nowhere near an import. readSource already scrubs
  // comments, so no matcher can be satisfied by prose about the code.
  const src = readSource(SRC).withImports;

  await t.test('the row button OPENS the confirmation — it does not restore', () => {
    // The claim the portal makes unreachable by rendering. If the button called
    // restore directly the dialog would still render, still be correct, and
    // still be bypassed on every click.
    assert.match(
      src, /data-testid="restore-version-button"[\s\S]{0,200}?onClick=\{\(\) => setPending\(v\)\}/,
      'the restore button no longer opens the confirmation'
    );
    assert.equal(
      /onClick=\{\(\) => restore\(/.test(src), false,
      'a control calls restore() directly, so the confirmation can be bypassed'
    );
  });

  /**
   * ── AMENDED IN ROUND 37, FLAGGED NOT QUIETLY EDITED ──────────────────────
   * Round 34 matched `onConfirm={() => restore(pending)}` exactly. Round 37
   * gave restore a second parameter — which path the author chose — so the
   * arrow is now `(mode) => restore(pending, mode)`.
   *
   * The GUARANTEE is untouched and is still asserted in the same two halves:
   * restore() has exactly ONE caller, and that caller is the confirmation. Only
   * the argument list moved. The default itself — that calling with no mode
   * PRESERVES — is asserted separately in test/render/draftBackupChoice.
   */
  await t.test('restore() is reached from exactly ONE place: the confirmation accepting', () => {
    assert.equal(countCallSites(src, 'restore'), 1, 'restore() has more than one caller');
    assert.match(
      src, /onConfirm=\{\(mode\) => restore\(pending, mode\)\}/,
      'the confirmation no longer is what calls restore()'
    );
  });

  await t.test('the write is saveDraftContent with EXACTLY the picked content', () => {
    // No spread, no extra key, and the token in third position. A payload built
    // as {...effectiveContent(x), slug} would still call saveDraftContent.
    assert.match(
      src,
      /saveDraftContent\(\s*pageId,\s*effectiveContent\(snap\.snapshot\),\s*savedUpdatedAt\s*\)/,
      'the restore payload is no longer exactly effectiveContent of the snapshot'
    );
  });

  await t.test('the file declares NO key list of its own', () => {
    // effectiveContent is imported, never restated — the drift draftState.js's
    // header exists to refuse.
    assert.equal(src.includes('DRAFT_CONTENT_KEYS'), false,
      'VersionHistory now names the key list itself; it must import the picker instead');
    for (const key of ['slug', 'promotionId', 'slugHistory']) {
      assert.equal(
        new RegExp(String.raw`snapshot\.${key}`).test(src), false,
        `the restore reads snapshot.${key} — a live-only field is being restored`
      );
    }
  });

  await t.test('a conflict is handed to the banner, not swallowed or retried', () => {
    assert.match(
      src, /res\?\.conflict[\s\S]{0,160}?SAVE_CONFLICT/,
      'a restore conflict no longer reaches the terminal-conflict banner'
    );
  });

  await t.test('success RELOADS rather than rebuilding the tree here', () => {
    // Round 5's decision for discard, and it is stronger here: saveDraftContent
    // answers { ok, updatedAt } with no content, so the restored tree is not in
    // the response. Rebuilding it would be a second seeding path owned by a
    // component that exists to list things.
    assert.match(src, /window\.location\.reload\(\)/, 'the restore no longer reloads on success');
    assert.equal(countCallSites(src, 'PATCH_PAGE'), 0, 'the restore patches the tree client-side');
  });
});

test('restore adds no second write path', async (t) => {
  const actions = readSource(ACTIONS).withImports;

  await t.test('no rollback/restore action was added to the action layer', () => {
    // Round 33's finding built literally: restore is a special case of "save a
    // draft", so there is nothing new on the server. A new export here would be
    // a second way to write a draft, with its own answer to tier sanitisation,
    // the conflict token and the audit row.
    for (const name of ['rollbackPage', 'restorePageVersion', 'restoreVersion', 'rollbackToVersion']) {
      assert.equal(actions.includes(`export async function ${name}`), false,
        `${name} was added — restore must go through saveDraftContent`);
    }
  });

  await t.test('the set of modules that REACH saveDraftContent is exactly two', () => {
    // Round 8's count-the-call-sites shape, and the count corrected by what the
    // code actually does. The first cut of this asserted two CALLERS and went
    // red naming useEditorSave — because useEditorSave never calls it. It
    // INJECTS it: `actions: { saveDraftContent, updatePageIdentity }` handed to
    // savePlan's runSave, which is where the invocation lives so the order and
    // the token chain can be asserted without mounting React.
    //
    // So "how many write paths are there" is a question about who can REACH the
    // action, not who writes the call parens. Two modules import it; a third is
    // a third policy about when a draft may be written.
    const reachers = walkSources('src')
      .filter((f) => f.rel !== ACTIONS)
      .filter((f) => /import\s*\{[^}]*\bsaveDraftContent\b[^}]*\}\s*from/.test(f.withImports))
      .map((f) => f.rel)
      .sort();
    assert.deepEqual(
      reachers,
      [
        'src/components/pageBuilder/editor/VersionHistory.jsx',
        'src/components/pageBuilder/editor/useEditorSave.js',
      ],
      'the set of modules that can write a draft changed'
    );
  });

  await t.test('…and exactly ONE of them calls it directly — the restore', () => {
    // The other half of the same fact, stated so a later reader does not have to
    // rediscover the injection. If useEditorSave ever starts calling it too,
    // that is two invocation sites for one write and this says so.
    const direct = walkSources('src')
      .filter((f) => f.rel !== ACTIONS)
      .filter((f) => countCallSites(f.code, 'saveDraftContent') > 0)
      .map((f) => f.rel);
    assert.deepEqual(direct, ['src/components/pageBuilder/editor/VersionHistory.jsx'],
      'the direct call sites of saveDraftContent changed');

    const orchestrator = readSource('src/components/pageBuilder/editor/useEditorSave.js').withImports;
    assert.match(orchestrator, /actions:\s*\{\s*saveDraftContent,/,
      'useEditorSave no longer injects saveDraftContent into runSave — re-read the write path');
  });

  await t.test('CONTROL: the scanner really does see a third caller', () => {
    // The discrimination form. If a spliced-in call is not counted, the exact
    // set above would stay green through any number of new write paths.
    const parallel = [
      "import { saveDraftContent } from '@/lib/actions/pageBuilder';",
      'export async function somethingElse(id, patch, token) {',
      '  return saveDraftContent(id, patch, token);',
      '}',
    ].join('\n');
    assert.equal(
      countCallSites(parallel, 'saveDraftContent'), 1,
      'the call-site counter does not see a plain call, so the set above means nothing'
    );
  });
});

test('the seed prop is a test seed and production passes nothing', async (t) => {
  await t.test('HistorySection hands VersionHistory no initialRows', () => {
    const settings = readSource(SETTINGS).withImports;
    assert.match(settings, /<VersionHistory pageId=\{pageId\} open=\{open\} editor=\{editor\} \/>/,
      'the production call site changed — re-read what it now passes');
    assert.equal(settings.includes('initialRows'), false,
      'production seeds the list, so every row assertion above is about a fixture');
  });

  await t.test('and unseeded, the component is in its loading state', () => {
    // The production path, rendered: no rows, no restore control, no claim.
    const doc = docOf(renderToStaticMarkup(createElement(HistorySection, { pageId: 'p1', open: true })));
    assert.equal(restoreButtons(doc).length, 0, 'a restore control rendered before the list loaded');
    assert.equal(doc.body.textContent.includes('กำลังโหลด'), true, 'the loading state is gone');
  });

  await t.test('HistorySection renders OUTSIDE a provider, and that is load-bearing', () => {
    // VersionHistory takes the editor as a PROP rather than reading useEditor(),
    // because useEditor() throws outside a provider and round 27's union check
    // renders this section bare. Reading context here would have made that check
    // impossible to keep unmodified.
    const src = readSource(SRC).withImports;
    assert.equal(src.includes('useEditor'), false,
      'VersionHistory reads context again — round 27 union check renders it with no provider');
    assert.doesNotThrow(
      () => renderToStaticMarkup(createElement(HistorySection, { pageId: 'p1', open: true })),
      'HistorySection can no longer render without a provider'
    );
  });
});
