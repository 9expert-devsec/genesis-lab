import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * The Advanced HTML editor's header controls, after the draft split.
 *
 * ── WHY SOURCE AND NOT RENDER ──────────────────────────────────────────────
 * CustomPageForm calls `useEditor()` from @tiptap/react at the top of its body,
 * so importing the module drags the whole Tiptap graph in and the component
 * cannot be rendered in this suite at all. That is a measured wall, not a
 * preference — it is the same one that put the settings BODY in its own file.
 *
 * So these are shape claims, and every one is paired with a control asserting
 * the same probe comes out the other way on the pre-change shape. The BEHAVIOUR
 * underneath is tested for real in test/fs/customPageDraftActions, which
 * executes the three actions these buttons call.
 */

const FORM = 'src/app/admin/pages/_components/CustomPageForm.jsx';
const form = () => readSource(FORM);

// ── the button pair ─────────────────────────────────────────────────────────

test('the single save button became a PAIR, with the builder’s labels', () => {
  const { code } = form();
  assert.match(code, /บันทึกฉบับร่าง/, 'the draft-save label is gone');
  assert.match(code, /เผยแพร่/, 'the publish label is gone');
  assert.match(code, /ทิ้งฉบับร่าง/, 'the discard label is gone');
  assert.equal(code.includes('บันทึกอัปเดต'), false,
    'the old single save button survives — two paths would now write the page');
});

test('each button calls its OWN action, and none calls the live-write one', () => {
  const { code, withImports } = form();
  assert.match(code, /onClick=\{submit\}/);
  assert.match(code, /onClick=\{publish\}/);
  assert.match(code, /onClick=\{discardDraft\}/);

  assert.match(code, /saveCustomPageDraft\(storedPage\._id, fd\)/,
    'the save button no longer writes a draft');
  assert.match(code, /publishCustomPage\(storedPage\._id\)/,
    'the publish button no longer publishes');
  assert.match(code, /discardCustomPageDraft\(storedPage\._id\)/,
    'the discard button no longer discards');

  // The one that must NOT be reachable any more.
  assert.equal(/import[\s\S]{0,200}?updateCustomPage[\s\S]{0,80}?from '@\/lib\/actions\/customPages'/.test(withImports), false,
    'the editor imports updateCustomPage again — that action writes content '
    + 'straight to the live fields, which is the behaviour this work removed');
});

test('เผยแพร่ SAVES FIRST, so it publishes what is on screen', () => {
  /**
   * An author who edits and presses เผยแพร่ without pressing บันทึกฉบับร่าง
   * expects to publish what they are looking at. Publishing without saving would
   * promote the PREVIOUS draft and silently drop the edits in front of them.
   * The order is the claim.
   */
  const { code } = form();
  const body = code.slice(code.indexOf('const publish ='), code.indexOf('const discardDraft ='));
  assert.ok(body.length > 0, 'the publish handler is gone');
  const savedAt = body.indexOf('saveCustomPageDraft');
  const publishedAt = body.indexOf('publishCustomPage');
  assert.ok(savedAt > -1, 'publish no longer saves first — it would publish stale content');
  assert.ok(publishedAt > savedAt, 'publish runs before the save it depends on');
});

test('CONTROL: the ordering probe can tell the two orders apart', () => {
  const good = 'await saveCustomPageDraft(x); await publishCustomPage(x);';
  const bad = 'await publishCustomPage(x); await saveCustomPageDraft(x);';
  const order = (s) => s.indexOf('publishCustomPage') > s.indexOf('saveCustomPageDraft');
  assert.equal(order(good), true);
  assert.equal(order(bad), false, 'the probe reports the wrong order as correct');
});

// ── the state the buttons are gated on ──────────────────────────────────────

test('discard and the chip are gated on a PENDING DRAFT, not on status', () => {
  const { code } = form();
  assert.match(code, /\{isEdit && hasDraft && \(/,
    'the discard button is no longer gated on there being something to discard');
  assert.match(code, /\{hasDraft && \(/, 'the pending-draft chip lost its gate');
});

test('hasDraft is read from the STORED document, never the composed view', () => {
  /**
   * composeWorkingView has already unwrapped the draft, so asking IT whether a
   * draft exists would always answer no and the chip would never appear. This is
   * the one place the distinction between the two objects is load-bearing.
   */
  const { code } = form();
  assert.match(code, /useState\(\(\) => hasUnpublishedDraft\(storedPage\)\)/,
    'the pending-draft flag is derived from the wrong object');
  assert.equal(/hasUnpublishedDraft\(page\)/.test(code), false,
    'hasUnpublishedDraft is being asked of the composed view, which never has a draft');
});

test('every server-managed field is read from the STORED document', () => {
  /**
   * The composed view carries the thirteen content keys plus slug/status/
   * slugHistory — and NOTHING else. `_id`, `previewToken` and `createdAt` are
   * not in it, so reading them off `page` is silently undefined: a broken
   * preview-link section and actions called with an undefined id.
   */
  const { code } = form();
  for (const field of ['_id', 'previewToken', 'createdAt']) {
    assert.equal(code.includes(`page?.${field}`) || code.includes(`page.${field}`), false,
      `${field} is read off the composed view, where it does not exist`);
  }
  assert.match(code, /storedPage\._id/, 'nothing reads the id from the stored document');
  assert.match(code, /storedPage\?\.previewToken/, 'the preview token is not read from the stored document');
});

test('CONTROL: that probe would SEE a read off the composed view', () => {
  const planted = 'const t = page?.previewToken ?? "";';
  assert.equal(planted.includes('page?.previewToken'), true,
    'the probe cannot see the pattern it is meant to ban');
});

// ── the editor opens the draft ──────────────────────────────────────────────

test('the editor initialises from the COMPOSED view, so a draft reopens', () => {
  const { code, withImports } = form();
  assert.match(withImports, /composeWorkingView[\s\S]{0,90}from '@\/lib\/pages\/customPageDraft'/,
    'the form no longer imports the composed view');
  assert.match(code, /const page = composeWorkingView\(storedPage \?\? \{\}\)/,
    'the form no longer composes what it opens — an author would be shown the '
    + 'published page and their next save would write it back over their draft');
  assert.match(code, /content: page\?\.body \?\? ''/,
    'the Tiptap editor no longer seeds from the composed body');
});

// ── the status badge speaks the builder's vocabulary ────────────────────────

test('the status badge uses the builder’s words, not English', () => {
  const { code } = form();
  assert.match(code, /label: 'เผยแพร่แล้ว'/, 'the published badge is not the builder’s word');
  assert.match(code, /label: 'ฉบับร่าง'/, 'the draft badge is not the builder’s word');
  for (const old of ["label: 'Published'", "label: 'Draft'"]) {
    assert.equal(code.includes(old), false, `the badge still says ${old}`);
  }
});

test('the chip is the builder’s chip — same words, same testid', () => {
  const { code } = form();
  const builder = readSource('src/components/pageBuilder/editor/EditorTopBar.jsx').code;
  assert.match(code, /มีฉบับร่างที่ยังไม่เผยแพร่/);
  assert.match(builder, /มีฉบับร่างที่ยังไม่เผยแพร่/,
    'the builder changed its phrase — the two editors have drifted apart');
  assert.match(code, /data-testid="pending-draft-chip"/);
  assert.match(builder, /data-testid="pending-draft-chip"/);
});

test('CONTROL: the badge and the chip are DIFFERENT elements', () => {
  /**
   * Thai negates by prefix and these labels overlap by design: 'ฉบับร่าง' is a
   * substring of 'มีฉบับร่างที่ยังไม่เผยแพร่'. A combined badge string would
   * satisfy both matches above, so this pins that the chip is its own element
   * rendered under its own condition.
   */
  const { code } = form();
  assert.ok('มีฉบับร่างที่ยังไม่เผยแพร่'.includes('ฉบับร่าง'),
    'the fixture is wrong: these labels no longer overlap, so this control is moot');
  const chipAt = code.indexOf('data-testid="pending-draft-chip"');
  const badgeAt = code.indexOf('statusBadge.label');
  assert.ok(chipAt > -1 && badgeAt > -1);
  assert.notEqual(chipAt, badgeAt, 'the chip and the badge are the same element');
});

// ── the two OTHER publish paths ─────────────────────────────────────────────

/**
 * After the draft split, exactly ONE thing may make a CustomPage public:
 * publishCustomPage, which promotes the pending draft first. Anything else that
 * sets `status: 'published'` would put the STALE live content in front of
 * visitors while the author's edits sat unpromoted beside it.
 *
 * Three surfaces could do that, and all three are pinned here: the editor's
 * button (above), the settings dialog's สถานะ select, and the admin list's
 * eye toggle.
 */

test('the สถานะ select cannot publish — it can only take a page DOWN', () => {
  const { code } = readSource('src/app/admin/pages/_components/CustomPageSettingsBody.jsx');
  // The เผยแพร่ option is disabled while the page is not already published…
  assert.match(code, /disabled=\{isEdit && status !== 'published'\}/,
    'the published option is selectable from a draft page — a second publish path');
  // …and the only action the select can take in edit mode is the takedown.
  assert.match(code, /if \(next === 'draft' && status === 'published'\) onUnpublish\(\)/,
    'the select no longer routes its one edit-mode action to the unpublish handler');
  assert.equal(/onUnpublish\(\)[\s\S]{0,40}publish/.test(code), false,
    'the select reaches a publish path');
});

test('the select says WHY publishing is elsewhere, and names the button', () => {
  // A disabled control with no reason is a puzzle. The hint has to point at the
  // thing that does work, and say what it buys.
  const { code } = readSource('src/app/admin/pages/_components/CustomPageSettingsBody.jsx');
  assert.match(code, /การเผยแพร่ทำได้จากปุ่ม “เผยแพร่” ด้านบนเท่านั้น/,
    'the disabled option gives no reason');
  assert.match(code, /ฉบับร่างที่ค้างอยู่จะไม่ถูกลบ/,
    'the takedown does not say it keeps the pending draft');
});

test('the editor’s unpublish writes STATUS ONLY and leaves the draft alone', () => {
  const { code } = form();
  const body = code.slice(code.indexOf('const unpublish ='), code.indexOf('const discardDraft ='));
  assert.ok(body.length > 0, 'the unpublish handler is gone');
  assert.match(body, /toggleCustomPageStatus\(storedPage\._id, 'draft'\)/,
    'unpublish no longer calls the status-only action');
  for (const forbidden of ['discardCustomPageDraft', 'setHasDraft', 'saveCustomPageDraft']) {
    assert.equal(body.includes(forbidden), false,
      `unpublish also calls ${forbidden} — a takedown must not touch pending work`);
  }
});

test('the admin list publishes through publishCustomPage, and only unpublishes through the status action', () => {
  const { code, withImports } = readSource('src/app/admin/pages/_components/CustomPagesAdminClient.jsx');
  assert.match(withImports, /publishCustomPage/,
    'the list cannot reach the promoting publish action');
  assert.match(code, /next === 'published'\s*\?\s*await publishCustomPage\(p\._id\)\s*:\s*await toggleCustomPageStatus\(p\._id, next\)/,
    'the list still publishes with the status-only action — it would make stale '
    + 'content public past a pending draft');
});

test('CONTROL: the list probe would MISS nothing — the old single-call shape fails it', () => {
  // The shape this replaced, asserted against planted source so the probe is
  // proven to discriminate rather than merely to match the new text.
  const before = ': await toggleCustomPageStatus(p._id, next);';
  const after = "next === 'published' ? await publishCustomPage(p._id) : await toggleCustomPageStatus(p._id, next)";
  const probe = /next === 'published'\s*\?\s*await publishCustomPage\(p\._id\)/;
  assert.equal(probe.test(before), false, 'the probe passes on the pre-split shape');
  assert.equal(probe.test(after), true, 'the probe does not recognise the shape it requires');
});

test('the list’s stale comment is gone — it claimed CustomPage has no draft', () => {
  // The note said "CustomPage has no draft, no snapshot and no conflict token".
  // The first clause stopped being true and the comment was the only thing
  // telling the next reader the branch was safe.
  const { raw } = readSource('src/app/admin/pages/_components/CustomPagesAdminClient.jsx');
  assert.equal(raw.includes('The advanced_html branch is untouched'), false,
    'the list still claims its advanced_html branch is untouched, which is now false');
  assert.match(raw, /BECAUSE CustomPage NOW HAS A DRAFT/,
    'nothing in the list explains why the two directions take different paths');
});
