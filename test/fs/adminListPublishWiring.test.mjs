import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOT, readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * The admin list's publish/unpublish toggle goes through publishPageStatus.
 *
 * ── WHY THIS IS A SOURCE SCAN AND NOT AN EXECUTION TEST ─────────────────────
 * The behaviour it guards — that publishing from the list no longer archives a
 * pending draft — IS executed, in test/fs/pageBuilderDraftActions: the pair
 * "THE TRAP" / "THE FIX" runs both actions against byte-identical fixtures and
 * shows the snapshot differ. What a scan adds, and the only thing it adds, is
 * the link between that proven action and this caller. A React client component
 * with useTransition and Radix imports is not callable under the loader, so
 * which function the toggle NAMES is a source fact.
 *
 * ── WHY THE TOGGLE MOVED ────────────────────────────────────────────────────
 * updatePageStatus snapshots doc.toObject() on publish, which since round 1
 * carries `draft`. Toggling publish from this list would archive an unpublished
 * edit as though it had once been live, while NOT promoting it — so the stale
 * content went public at the same moment the new content was filed in history.
 * Wrong in both directions at once. It also had no conflict check at all.
 */

const CLIENT = 'src/app/admin/pages/_components/CustomPagesAdminClient.jsx';

test('the admin list imports publishPageStatus, and no longer names updatePageStatus', () => {
  const { withImports, code } = readSource(CLIENT);
  // withImports, because the CODE view strips import statements — a guard about
  // an import read from `code` matches nothing on a correct file.
  assert.match(
    withImports,
    /import \{[\s\S]*?\bpublishPageStatus\b[\s\S]*?\} from '@\/lib\/actions\/pageBuilder'/,
    'the list no longer imports publishPageStatus'
  );
  assert.equal(
    withImports.includes('updatePageStatus'), false,
    'the list still names updatePageStatus — the retired path is back'
  );
  // And it is actually CALLED, not merely imported. That is the defect class
  // this repo has shipped before: an import that satisfies a guard while the
  // call site still uses the old function.
  assert.equal(countCallSites(code, 'publishPageStatus'), 1);
});

test('CONTROL: the import scan reads a view that HAS imports', () => {
  // Without this the two assertions above could both pass against a view where
  // no import line exists at all — the false-green shape this repo has hit.
  const { code, withImports } = readSource(CLIENT);
  assert.equal(
    /from '@\/lib\/actions\/pageBuilder'/.test(code), false,
    'the code view now retains imports; the guard above is reading the wrong view'
  );
  assert.equal(/from '@\/lib\/actions\/pageBuilder'/.test(withImports), true);
});

test('the toggle hands over the conflict token and the whole publish window', () => {
  const { code } = readSource(CLIENT);
  assert.match(code, /publishPageStatus\(/, 'the toggle does not call publishPageStatus');
  assert.match(
    code, /publishStartDate: p\.publishStartDate/,
    'the toggle omits publishStartDate — publishPageStatus defaults it to null, '
    + "so a status toggle would silently WIPE a scheduled page's window"
  );
  assert.match(code, /publishEndDate: p\.publishEndDate/, 'the toggle omits publishEndDate');
  assert.match(
    code, /\bp\.updatedAt\b/,
    'the toggle passes no expectedUpdatedAt — the conflict check is the reason it moved'
  );
});

test('the advanced_html branch is untouched — CustomPage keeps its own action', () => {
  // CustomPage has no draft, no snapshot and no conflict token, so nothing about
  // this round applies to it. Guarding this is what stops a future "tidy-up"
  // from routing it through an action built for a different model.
  const { code, withImports } = readSource(CLIENT);
  assert.match(withImports, /toggleCustomPageStatus/, 'the CustomPage action was removed');
  assert.equal(countCallSites(code, 'toggleCustomPageStatus'), 1);
});

test('updatePageStatus has NO caller anywhere in src/', () => {
  // The retirement claim, checked against the whole tree rather than the one
  // file this round edited. `code` throughout: an import alone must not satisfy
  // it, and the definition itself lives behind `export async function`.
  const callers = walkSources('src')
    .filter(({ rel }) => rel !== 'src/lib/actions/pageBuilder.js')
    .filter(({ code }) => countCallSites(code, 'updatePageStatus') > 0)
    .map(({ rel }) => rel);
  assert.deepEqual(callers, [], 'updatePageStatus has a live caller again — read its doc block first');
});

test('CONTROL: that scan CAN find a caller — it finds publishPageStatus', () => {
  // A walk that matched nothing would make the assertion above vacuous. Same
  // walk, same matcher, a function that genuinely is called.
  const callers = walkSources('src')
    .filter(({ rel }) => rel !== 'src/lib/actions/pageBuilder.js')
    .filter(({ code }) => countCallSites(code, 'publishPageStatus') > 0)
    .map(({ rel }) => rel);
  assert.deepEqual(callers, [CLIENT], 'the caller scan cannot see the caller that exists');
});

test('updatePageStatus is still exported, and still documents why it is unused', () => {
  // Retired, not deleted: it stays as a narrow primitive. The doc block is the
  // only thing standing between the next reader and re-wiring the trap, so its
  // presence is asserted rather than assumed. Read from `raw` — the subject IS
  // a comment, which is the one documented exception to scrubbing first.
  const { code, raw } = readSource('src/lib/actions/pageBuilder.js');
  assert.match(code, /export async function updatePageStatus\(id, status\)/, 'it was deleted or resignatured');
  const at = raw.indexOf('export async function updatePageStatus');
  const doc = raw.slice(Math.max(0, at - 1800), at);
  assert.match(doc, /NO LIVE CALLER/, 'the retirement is undocumented');
  assert.match(doc, /NO CONFLICT CHECK/, 'the missing conflict check is undocumented');
  assert.match(doc, /SNAPSHOT A PENDING DRAFT/, 'the snapshot trap is undocumented');
});

test('all three narrow write actions exist and are derived from one page schema', () => {
  // Together saveDraftContent (9 keys), publishPageStatus (3) and
  // updatePageIdentity (4) cover every editable key. Each validates through a
  // .pick() of pageBuilderSchema rather than a hand-written twin, so a rule
  // change reaches all three with no second edit.
  const { code } = readSource('src/lib/actions/pageBuilder.js');
  for (const fn of ['saveDraftContent', 'publishPageStatus', 'updatePageIdentity']) {
    assert.match(code, new RegExp(`export async function ${fn}\\(`), `${fn} is missing`);
  }
  assert.match(code, /const identitySchema = pageBuilderSchema\.pick\(/, 'identitySchema is hand-written');
  assert.match(code, /const statusSchema = pageBuilderSchema\.pick\(/, 'statusSchema is hand-written');
  assert.equal(
    /const identitySchema = z\.object\(/.test(code), false,
    'identitySchema was rebuilt as its own z.object — it will drift from the page schema'
  );
  assert.ok(ROOT.length > 0);
});
