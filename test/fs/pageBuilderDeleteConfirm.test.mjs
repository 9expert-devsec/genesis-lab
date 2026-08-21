import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readSource, sourceExists, ROOT } from '../sourceScan.mjs';

/**
 * THE SEAM test/pure/sectionDescendants.test.mjs CANNOT REACH.
 *
 * The pure file proves the COUNT is right. It says nothing about whether the
 * delete button ever asks — and the whole point of the round is the wiring: a
 * row's ลบ must open the confirm, not dispatch REMOVE_SECTION. StructurePanel
 * is a client component wired to a reducer through context, so this claim can
 * only be made against shape; that is a compromise, stated here so the next
 * reader knows it. (Mounting a React root to test it for real is forbidden in
 * this runner — `isolation: 'none'`, one shared process.)
 *
 * WHAT MAKES THE PROBE HONEST: every assertion below is paired with a
 * DISCRIMINATION control that runs the same probe over the PRE-CHANGE literal
 * and asserts it comes out the other way. A probe that cannot tell the old
 * shape from the new one is green about nothing (defect 7, face three — see
 * sourceScan.mjs).
 */

const PANEL = 'src/components/pageBuilder/editor/StructurePanel.jsx';

/**
 * The ลบ row control, from its label to the end of its element. Bounded on
 * `</IconButton>` rather than on `>` on purpose: the arrow function in the
 * onClick contains a `>`, so an attribute-region match would stop inside it —
 * the same class of mistake as bounding a statement on `)` (defect 6).
 */
function deleteControl(code) {
  const start = code.indexOf('label="ลบ"');
  if (start < 0) return '';
  const end = code.indexOf('</IconButton>', start);
  return end < 0 ? '' : code.slice(start, end);
}

// The exact control as it stood BEFORE this round — a single click dispatching
// straight into the reducer. Kept as a literal so the probes can be shown to
// reject it.
const OLD_CONTROL = `label="ลบ" danger onClick={() => dispatch({ type: 'REMOVE_SECTION', path })}>
            <Trash2 className="h-3.5 w-3.5" />
          `;

test('CONTROL: the file under scan exists and was really read', () => {
  assert.ok(sourceExists(PANEL), `${PANEL} is missing`);
  assert.ok(readSource(PANEL).code.length > 2000, `${PANEL} scanned to almost nothing`);
  // Every "does not contain" assertion below passes vacuously against an empty
  // string, and so does every slice taken from one.
  assert.ok(deleteControl(readSource(PANEL).code).length > 20, 'the ลบ control was not located');
});

// ── 1. the delete control asks; it does not delete ──────────────────────────

test('the ลบ row control goes through the confirm path, not REMOVE_SECTION', () => {
  const code = readSource(PANEL).code;
  const control = deleteControl(code);
  assert.match(control, /requestDelete\(/,
    'the ลบ button no longer calls requestDelete — if it dispatches directly, a '
    + 'single click destroys a section (and every descendant) with no undo anywhere');
  assert.doesNotMatch(control, /REMOVE_SECTION/,
    'the ลบ button dispatches REMOVE_SECTION at the click again — the confirm '
    + 'has been bypassed');
});

test('CONTROL: the same probes REJECT the pre-change control', () => {
  // Discrimination, not existence: the old shape and the new one are put
  // through the identical probe and must come out opposite. If this ever
  // passes for both, the probe has stopped testing the change.
  const old = deleteControl(`${OLD_CONTROL}</IconButton>`);
  assert.ok(old.length > 20, 'the OLD_CONTROL literal did not even parse — the probe is broken');
  assert.doesNotMatch(old, /requestDelete\(/);
  assert.match(old, /REMOVE_SECTION/);
});

// ── 2. there is exactly ONE way to reach REMOVE_SECTION ─────────────────────

test('REMOVE_SECTION is dispatched from exactly one place, and it is the confirm', () => {
  const code = readSource(PANEL).code;
  const sites = code.match(/REMOVE_SECTION/g) ?? [];
  assert.equal(sites.length, 1,
    `REMOVE_SECTION appears ${sites.length} times in the panel; exactly one dispatch `
    + 'site is what keeps the confirm unbypassable');

  // …and that one site sits in confirmDelete, which only the dialog's ลบ calls.
  const i = code.indexOf('const confirmDelete');
  assert.ok(i >= 0, 'confirmDelete is gone — the single dispatch site moved somewhere unnamed');
  const body = code.slice(i, i + 400);
  assert.match(body, /REMOVE_SECTION/,
    'the one REMOVE_SECTION dispatch is no longer inside confirmDelete');
});

test('CONTROL: the count probe can see an added dispatch site', () => {
  // Stated as a DELTA, not an absolute. An absolute ("…now says 2") would itself
  // go red whenever the panel legitimately gains a site, reporting a broken probe
  // when the probe is fine — a control has to survive the very change it exists
  // to make visible.
  const count = (s) => (s.match(/REMOVE_SECTION/g) ?? []).length;
  const code = readSource(PANEL).code;
  assert.equal(count(`${code}\ndispatch({ type: 'REMOVE_SECTION', path });`), count(code) + 1,
    'the counter does not react to an added dispatch site, so its "exactly 1" means nothing');
});

test('the dispatch is NOT made from inside a setState updater', () => {
  // Written after nearly shipping it that way. React may call an updater more
  // than once for a single update — StrictMode does exactly that in dev, on
  // purpose — so a `setPendingDelete(p => { dispatch(REMOVE_SECTION, p.path) })`
  // fires the removal TWICE, and the second one deletes whichever section slid
  // into that index. A confirm dialog that eats two sections is worse than the
  // unconfirmed click it replaced.
  const code = readSource(PANEL).code;
  const i = code.indexOf('const confirmDelete');
  const body = code.slice(i, i + 400);
  assert.doesNotMatch(body, /setPendingDelete\(\s*\(/,
    'confirmDelete passes a FUNCTION to setPendingDelete and dispatches inside '
    + 'it — see above; pass the value instead and read pendingDelete from state');
  assert.match(body, /setPendingDelete\(null\)/, 'the pending row is never cleared');
});

test('CONTROL: the updater probe distinguishes the two shapes', () => {
  const bad = `setPendingDelete((p) => { dispatch({ type: 'REMOVE_SECTION' }); return null; });`;
  const good = `dispatch({ type: 'REMOVE_SECTION' }); setPendingDelete(null);`;
  assert.match(bad, /setPendingDelete\(\s*\(/);
  assert.doesNotMatch(good, /setPendingDelete\(\s*\(/);
});

// ── 3. confirmation for EVERY delete, not only containers ───────────────────

test('the confirm is unconditional — no container-only shortcut around it', () => {
  const code = readSource(PANEL).code;
  // requestDelete stores the pending row and nothing else; a shortcut would
  // look like a countDescendants/slotsOf/isContainer test guarding the dialog.
  const i = code.indexOf('const requestDelete');
  assert.ok(i >= 0, 'requestDelete is gone');
  const body = code.slice(i, i + 200);
  assert.doesNotMatch(body, /isContainer|slotsOf|countDescendants/,
    'requestDelete has grown a condition — the friction exists because there is '
    + 'no undo for ANY delete, not because containers are special (see the '
    + 'round-1 note at ConfirmDeleteDialog)');
});

test('the round-1 relaxation note is present, by name, for whoever adds undo', () => {
  // SUBJECT IS A COMMENT, so this reads `raw` rather than `code` — the scrubber
  // deletes comments, which would delete the thing being asserted. The tell for
  // getting this backwards is a failure on a correct file (see run.mjs).
  const raw = readSource(PANEL).raw;
  assert.match(raw, /ROUND 1/,
    'the comment naming round 1 as the point where this friction may be relaxed '
    + 'is gone — without it the confirm reads as permanent policy rather than as '
    + 'a stand-in for the undo that does not exist yet');
  assert.match(raw, /editorReducer\.js keeps no history/,
    'the stated reason (no undo) is gone from the comment');
});

test('CONTROL: the round-1 note is invisible to the CODE view', () => {
  // Proves the assertion above genuinely needs `raw`. If ROUND 1 ever showed up
  // in `code`, it would mean the subject stopped being a comment and the guard
  // is reading the wrong text.
  assert.doesNotMatch(readSource(PANEL).code, /ROUND 1/);
});

// ── 4. Radix Dialog, and NO new dependency ──────────────────────────────────

test('the confirm is the repo’s Radix Dialog, not window.confirm', () => {
  // IMPORT ASSERTION → withImports. Read from `code` this would pass vacuously:
  // the scrubber removes every import line, so "does it import Dialog" is
  // unanswerable there.
  const { withImports, code } = readSource(PANEL);
  assert.match(withImports, /import \* as Dialog from '@radix-ui\/react-dialog'/,
    'StructurePanel no longer imports the Radix Dialog it confirms with');
  assert.match(code, /<Dialog\.Root/, 'no Dialog.Root is rendered');
  assert.doesNotMatch(code, /window\.confirm|(?<![.\w$])confirm\s*\(/,
    'a native confirm() appeared — it is unstyled, untranslatable and blocks the '
    + 'whole tab, which is why SectionPicker uses the Radix primitive');
});

test('CONTROL: the import assertion really needs withImports', () => {
  // The standing precondition for any import guard in this suite: prove the
  // CODE view has had the subject stripped, so a future edit that switches this
  // assertion to `code` fails loudly instead of passing on nothing.
  const { code } = readSource(PANEL);
  assert.doesNotMatch(code, /import \* as Dialog from '@radix-ui\/react-dialog'/,
    'the CODE view still shows import lines — the withImports assertion above is '
    + 'no longer distinguishable from a code-view one');
});

test('no alert-dialog dependency was added for this', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal('@radix-ui/react-alert-dialog' in deps, false,
    '@radix-ui/react-alert-dialog was added; the ruling was that Dialog already '
    + 'gives the focus trap and Escape, and the one thing AlertDialog adds — '
    + 'default focus placement — is set explicitly via onOpenAutoFocus');
  // CONTROL for the probe above: it is reading a populated dependency map, not
  // an empty object that would make any "not present" claim true.
  assert.ok('@radix-ui/react-dialog' in deps, 'the dependency map read as empty');
});

// ── 5. the destructive button is not the one focus lands on ─────────────────

test('opening the dialog does NOT put focus on the destructive button', () => {
  const code = readSource(PANEL).code;
  assert.match(code, /onOpenAutoFocus=\{\(e\) => \{ e\.preventDefault\(\); cancelRef\.current\?\.focus\(\); \}\}/,
    'the explicit focus placement is gone. Radix focuses the first tabbable '
    + 'child on open, which is how Enter turns the confirm into a second click');
  assert.match(code, /ref=\{cancelRef\}/, 'the cancel button no longer carries the ref focus is sent to');
});
