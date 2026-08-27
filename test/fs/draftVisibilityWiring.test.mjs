import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The two surfaces whose content lives inside a Radix `Dialog.Portal`.
 *
 * A portal renders NOTHING under renderToStaticMarkup, and mounting a root is
 * forbidden in this runner (isolation:'none', one shared process). So these
 * claims can only be made against shape — the same compromise, for the same
 * reason, as test/fs/pageBuilderDeleteConfirm, and stated here rather than
 * left for a reader to discover.
 *
 * WHAT MAKES EACH PROBE HONEST: every assertion is paired with a
 * DISCRIMINATION control asserting the same probe comes out the OTHER way on
 * the pre-change shape. A probe that cannot tell the old shape from the new one
 * is green about nothing.
 *
 * The behaviour underneath is tested for real elsewhere: the condition in
 * test/pure/editorStatus (hasPendingDraft / canDiscardDraft), and the action it
 * reaches in test/fs/pageBuilderDraftActions (discardDraftContent).
 */

const PUBLISH = 'src/components/pageBuilder/editor/PublishDialog.jsx';
const TOPBAR = 'src/components/pageBuilder/editor/EditorTopBar.jsx';
const SHELL = 'src/components/pageBuilder/editor/EditorShell.jsx';

const NOTE = 'การเผยแพร่จะใช้เนื้อหาฉบับร่างล่าสุด ไม่ใช่เนื้อหาที่เผยแพร่อยู่ในขณะนี้';
const CONFIRM = 'ทิ้งฉบับร่างที่ยังไม่เผยแพร่ทั้งหมด และกลับไปใช้เนื้อหาที่เผยแพร่อยู่ตอนนี้ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้';

// ── PublishDialog's informational line ──────────────────────────────────────

test('the publish dialog carries the note, GATED on a pending draft', () => {
  const { code, withImports } = readSource(PUBLISH);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bhasPendingDraft\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/,
    'the dialog does not import the shared condition'
  );
  // The literal and the gate in ONE expression, so a note that rendered
  // unconditionally cannot satisfy this.
  assert.match(
    code,
    new RegExp(`hasPendingDraft\\(editor\\) && \\([\\s\\S]{0,200}?${NOTE}`),
    'the note is missing, or is not gated on a pending draft'
  );
});

test('CONTROL: the probe rejects an UNGATED note', () => {
  // The pre-change shape this round could have shipped by mistake.
  const ungated = `<Warn tone="info">${NOTE}</Warn>`;
  assert.equal(
    new RegExp(`hasPendingDraft\\(editor\\) && \\([\\s\\S]{0,200}?${NOTE}`).test(ungated), false,
    'the probe accepts a note that always renders'
  );
});

test('the note reuses the file own Warn/info tone, not a new component', () => {
  const { code } = readSource(PUBLISH);
  assert.match(code, new RegExp(`<Warn tone="info">${NOTE}</Warn>`));
});

test('the round did NOT touch the readiness logic', () => {
  // Explicitly out of scope: OPTIONS, the radios, willBeVisible/invisibleReason
  // and publishBlockers all stay exactly as they were.
  const { code, withImports } = readSource(PUBLISH);
  assert.match(withImports, /import \{ publishBlockers \} from '@\/lib\/pageBuilder\/publishReadiness'/);
  assert.match(withImports, /import \{ isPubliclyVisible, invisibleReason \} from '@\/lib\/pageBuilder\/visibility'/);
  assert.equal(countCallSites(code, 'publishBlockers'), 1, 'publishBlockers is called a different number of times');
  assert.equal(countCallSites(code, 'isPubliclyVisible'), 1);
  assert.equal(countCallSites(code, 'invisibleReason'), 1);
  assert.match(code, /const blocked = messages\.length > 0;/, 'the blocked rule changed');
});

// ── the discard confirm ─────────────────────────────────────────────────────

test('the confirm dialog carries the exact destructive copy and label', () => {
  const { code } = readSource(TOPBAR);
  assert.ok(code.includes(CONFIRM), 'the confirm copy is missing or reworded');
  assert.match(code, /bg-red-600[\s\S]{0,120}?ทิ้งฉบับร่าง/, 'the confirm button is not in the destructive tone');
});

test('the discard button opens the confirm — it never calls onDiscard directly', () => {
  // The defect this shape exists to prevent, and the same one StructurePanel's
  // delete guard pins: a destructive action wired to the click instead of to a
  // confirmed decision.
  const { code } = readSource(TOPBAR);
  assert.match(
    code, /data-testid="discard-draft-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmDiscard\(true\)\}/,
    'the discard button does not open a confirm'
  );
  assert.match(
    code, /onConfirm=\{\(\) => \{ setConfirmDiscard\(false\); onDiscard\?\.\(\); \}\}/,
    'onDiscard is not reached from the confirm'
  );
  // countCallSites is blind to an OPTIONAL call: its regex wants `name(` and
  // this is `onDiscard?.(`, so it reports 0 on a correct file. Counting the
  // real form rather than asserting against a probe that cannot see it.
  const invocations = code.match(/onDiscard\?\.\(/g) ?? [];
  assert.equal(invocations.length, 1, 'onDiscard is invoked from more than one place');
});

test('CONTROL: the probe rejects a button wired straight to onDiscard', () => {
  const direct = 'data-testid="discard-draft-button"\n onClick={onDiscard}';
  assert.equal(
    /data-testid="discard-draft-button"[\s\S]{0,200}?onClick=\{\(\) => setConfirmDiscard\(true\)\}/.test(direct),
    false,
    'the probe accepts a discard wired to the click'
  );
});

test('the discard button is gated by the shared predicate, not a local rule', () => {
  const { code, withImports } = readSource(TOPBAR);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bcanDiscardDraft\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/,
    'the top bar does not import canDiscardDraft'
  );
  assert.match(code, /disabled=\{!canDiscardDraft\(editor\)\}/, 'the disabled rule is written out locally');
});

test('the top bar reads the status line from the shared module', () => {
  const { code, withImports } = readSource(TOPBAR);
  assert.match(
    withImports,
    /import \{[\s\S]*?\bstatusLine\b[\s\S]*?\} from '@\/lib\/pageBuilder\/editorStatus'/
  );
  assert.equal(
    /function savedAgo\(/.test(code), false,
    'the retired savedAgo() is still in the file beside its replacement'
  );
  assert.equal(
    code.includes('บันทึกอัตโนมัติเมื่อ'), false,
    'the retired copy is still in the source'
  );
});

test('CONTROL: that import guard must read withImports', () => {
  // scrubSource strips imports from `code`, so the same regex against `code`
  // matches nothing on a correct file — the vacuous shape this repo has hit.
  const { code, withImports } = readSource(TOPBAR);
  assert.equal(/from '@\/lib\/pageBuilder\/editorStatus'/.test(code), false);
  assert.equal(/from '@\/lib\/pageBuilder\/editorStatus'/.test(withImports), true);
});

// ── the shell hands discard down ────────────────────────────────────────────

test('EditorShell wires round 4 discard() to the top bar', () => {
  const { code } = readSource(SHELL);
  assert.match(code, /const \{ saveNow, publish, discard \} = useEditorSave\(\);/);
  assert.match(code, /onDiscard=\{discard\}/, 'the top bar never receives discard');
});

// ── the preview route ───────────────────────────────────────────────────────

test('the preview route renders the composed view, and gates BEFORE it', () => {
  const { code, withImports } = readSource('src/app/(public)/preview/[slug]/page.jsx');
  assert.match(
    withImports,
    /import \{[\s\S]*?\bcomposeWorkingView\b[\s\S]*?\} from '@\/lib\/pageBuilder\/draftState'/
  );
  assert.match(code, /<PageBuilderView page=\{composeWorkingView\(page\)\} \/>/, 'the route still renders the raw doc');

  // ORDER, asserted rather than assumed: every terminal gate returns before the
  // content is composed. An unauthenticated response must contain only the gate.
  const gateAt = code.lastIndexOf('PreviewGate');
  const composeAt = code.indexOf('composeWorkingView(page)');
  assert.ok(gateAt > -1 && composeAt > -1);
  assert.ok(gateAt < composeAt, 'the content is composed before the cookie gate returns');
});

/**
 * ── RE-POINTED IN ROUND 36, AND FLAGGED RATHER THAN QUIETLY EDITED ─────────
 * Round 5 wrote this against the route file, where both banner strings were
 * inline ternary branches. Round 36 added a THIRD state (the published view),
 * and three states written inline is exactly the shape that lets two of them be
 * reachable at once — so the set moved to lib/pageBuilder/previewMode.js as one
 * frozen object selected by a total function.
 *
 * The GUARANTEE is unchanged and is asserted in the same two halves: the exact
 * strings still exist, and the banner is still driven by the STORED draft
 * rather than by anything local to the tab. What moved is which file owns the
 * strings — and that they now partition, which the route file could never have
 * shown, is proven in test/pure/previewMode.
 */
test('the banner states WHICH case the reader is looking at', () => {
  const { code } = readSource('src/app/(public)/preview/[slug]/page.jsx');
  const banners = readSource('src/lib/pageBuilder/previewMode.js').code;

  assert.ok(banners.includes('ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — ห้ามแชร์ลิงก์นี้ต่อ'), 'the draft banner text changed');
  assert.ok(
    banners.includes('หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้'),
    'the no-draft banner text is missing'
  );
  // Round 36's third state, pinned beside the two it joined.
  assert.ok(
    banners.includes('กำลังดูเวอร์ชันที่เผยแพร่อยู่ — ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้'),
    'the published banner text is missing'
  );

  // Still driven by the stored draft, and the route still reads it — the half
  // of the original assertion that was never about where the strings live.
  assert.match(code, /const pending = hasUnpublishedDraft\(page\);/, 'the banner is not driven by the stored draft');
  assert.match(code, /previewBanner\(\{ mode, pending \}\)/, 'the route no longer selects the banner by mode + pending');
});
