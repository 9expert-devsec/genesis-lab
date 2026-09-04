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
   * The composed view carries the fourteen content keys plus slug/status/
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

// ── promotion mode: the four controls, and the two that are shared ──────────

const BODY = 'src/app/admin/pages/_components/CustomPageSettingsBody.jsx';
const SHELL = 'src/components/admin/pageSettings/SettingsShell.jsx';
const BUILDER_DIALOG = 'src/components/pageBuilder/editor/PageSettingsDialog.jsx';

test('ชนิดหน้า offers CUSTOM_PAGE_TYPES, never the builder’s eight', () => {
  const { code, withImports } = readSource(BODY);
  assert.match(withImports, /import \{ CUSTOM_PAGE_TYPES \} from '@\/lib\/schemas\/customPage'/,
    'the dialog does not import the Advanced HTML type list');
  assert.doesNotMatch(withImports,
    /import \{[^}]*\bPAGE_TYPES\b[^}]*\} from '@\/lib\/schemas\/pageBuilder'/,
    'the dialog imports the BUILDER’s eight-value list — six of them are storable '
    + 'values nothing reads on a CustomPage');
  assert.match(code, /CUSTOM_PAGE_TYPES\.map\(/,
    'the select does not map over CUSTOM_PAGE_TYPES');
});

test('CONTROL: that probe would CATCH the builder list being used here', () => {
  const planted = "import { PAGE_TYPES } from '@/lib/schemas/pageBuilder';\nPAGE_TYPES.map((t) => t)";
  assert.match(planted, /import \{[^}]*\bPAGE_TYPES\b[^}]*\} from '@\/lib\/schemas\/pageBuilder'/,
    'the probe cannot see the builder import even when it is plainly there');
  assert.equal(/CUSTOM_PAGE_TYPES\.map\(/.test(planted), false,
    'the map probe matches source that does not contain it');
});

test('the promotion fields are GATED on the type, not always rendered', () => {
  const { code } = readSource(BODY);
  // The gate and the fields in ONE expression, so an ungated block cannot pass.
  assert.match(code, /pageType === 'promotion' && \([\s\S]{0,1600}?ลำดับในหน้าโปรโมชัน/,
    'ลำดับในหน้าโปรโมชัน is missing, or renders on every page type');
  assert.match(code, /pageType === 'promotion' && \([\s\S]{0,1600}?<PromoCoverField/,
    'the cover field is missing, or renders on every page type');
});

test('CONTROL: the gate probe rejects an UNGATED promotion block', () => {
  const ungated = '<Field label="ลำดับในหน้าโปรโมชัน"><TextInput /></Field>';
  assert.equal(
    /pageType === 'promotion' && \([\s\S]{0,1600}?ลำดับในหน้าโปรโมชัน/.test(ungated), false,
    'the probe accepts a promotion field that always renders');
});

test('the labels and the uploader are the SHARED ones — not a second copy', () => {
  /**
   * The uploader carries a load-bearing, invisible decision: it discards the
   * endpoint's publicId, because storing an ownership token would wake the
   * Cloudinary GC before it is ready. A second copy that "helpfully" kept the
   * token would hand the GC an asset it cannot own, and nothing would report
   * the divergence. So the count of DEFINITIONS is asserted, not just the use.
   */
  const shell = readSource(SHELL);
  assert.match(shell.code, /export function PromoCoverField\(/,
    'the shared shell does not define the uploader');
  assert.match(shell.code, /export const PAGE_TYPE_LABELS = \{/,
    'the shared shell does not define the labels');

  for (const rel of [BODY, BUILDER_DIALOG]) {
    const { code, withImports } = readSource(rel);
    assert.equal(/function PromoCoverField\(/.test(code), false,
      `${rel} defines its OWN uploader — the publicId decision now lives in two places`);
    assert.equal(/const PAGE_TYPE_LABELS = \{/.test(code), false,
      `${rel} defines its OWN label map — renaming a Thai label would rename it in one dialog`);
    assert.match(withImports,
      /import \{[\s\S]*?PAGE_TYPE_LABELS[\s\S]*?PromoCoverField[\s\S]*?\} from '@\/components\/admin\/pageSettings\/SettingsShell'/,
      `${rel} does not import both from the shared shell`);
  }
});

test('CONTROL: the duplicate-definition probe DOES fire on a second copy', () => {
  const planted = 'function PromoCoverField({ value, onChange }) { return null; }';
  assert.equal(/function PromoCoverField\(/.test(planted), true,
    'the probe cannot see a locally defined uploader, so the assertion above is vacuous');
});

test('ธีม is still absent, and the file says why rather than staying silent', () => {
  /**
   * The premise that kept BOTH controls out — "CustomPage has NEITHER field" —
   * became half false when pageType landed. Amending it would have left a note
   * that reads as an oversight; it was rewritten. This pins the half that is
   * still true, and pins that the reason travels with it.
   */
  const { code, raw } = readSource(BODY);
  assert.equal(raw.includes('CustomPage` has NEITHER field'), false,
    'the stale premise is still in the file — pageType exists now, and the note guards '
    + 'a decision the next reader will otherwise re-litigate or reverse');
  assert.equal(/PAGE_THEMES/.test(code), false,
    'a ธีม control shipped — CustomPageView reads no theme, so it would be wired to nothing');
  assert.match(raw, /CustomPageView` reads no theme/,
    'nothing explains why ธีม is absent while ชนิดหน้า is present');
});

test('the author is told the two timings, and the warning is gated on a LIVE page', () => {
  /**
   * One button, two destinations: pageType and promotionOrder are live-only and
   * apply on บันทึกฉบับร่าง, while the cover drafts. An author who is not told
   * discovers it by watching a published URL start redirecting.
   */
  const { code } = readSource(BODY);
  assert.match(code, /isEdit && status === 'published' && \([\s\S]{0,700}?ชนิดหน้าและลำดับมีผลทันทีที่กดบันทึกฉบับร่าง/,
    'the live-effect warning is missing, or is not gated on an already-published page');
  assert.match(code, /ภาพปกโปรโมชัน” จะยังไม่เปลี่ยนบนหน้าจริงจนกว่าจะกดเผยแพร่/,
    'the warning does not say the cover behaves differently from the other two');
});

test('CONTROL: the warning probe rejects an UNGATED warning', () => {
  const ungated = '<Warn>ชนิดหน้าและลำดับมีผลทันทีที่กดบันทึกฉบับร่าง</Warn>';
  assert.equal(
    /isEdit && status === 'published' && \([\s\S]{0,700}?ชนิดหน้าและลำดับมีผลทันทีที่กดบันทึกฉบับร่าง/.test(ungated),
    false, 'the probe accepts a warning shown on a page that was never published');
});

test('the form posts all three fields and threads them into the dialog', () => {
  const { code } = form();
  for (const f of ['pageType', 'promotionOrder', 'promotionCover']) {
    assert.match(code, new RegExp(`fd\\.set\\('${f}',`),
      `${f} is never posted — the control edits state the server never receives`);
  }
  // …and the state is seeded from the COMPOSED view, like every other field.
  assert.match(code, /useState\(page\?\.pageType \?\? 'general'\)/);
  assert.match(code, /useState\(page\?\.promotionCover \?\? ''\)/);
  assert.match(code, /promotionCover, setPromotionCover,/,
    'the cover is not handed to the settings dialog');
});

test('CONTROL: the post probe would notice a missing field', () => {
  const planted = "fd.set('pageType', pageType);";
  assert.match(planted, /fd\.set\('pageType',/);
  assert.equal(/fd\.set\('promotionCover',/.test(planted), false,
    'the probe reports a field as posted when it is not');
});


// ── the slug row left the main column ───────────────────────────────────────

const BODY_SRC = 'src/app/admin/pages/_components/CustomPageSettingsBody.jsx';
const DIALOG_SRC = 'src/app/admin/pages/_components/CustomPageSettingsDialog.jsx';

test('the main column no longer draws a slug input, a prefix or an error line', () => {
  /**
   * The whole row went: the https://9experttraining.com/ prefix, the input, the
   * red ring and the message under it. Asserted as four separate absences
   * because a partial removal — the input gone but the prefix left behind — is
   * exactly the "empty container" outcome the round is measured against.
   */
  const { code } = form();
  assert.equal(/placeholder="my-page-slug"/.test(code), false,
    'the slug input is still in the editor column');
  assert.equal(/\{SITE_URL\}\//.test(code), false,
    'the https://9experttraining.com/ prefix span is still drawn beside the title');
  assert.equal(/slugValid/.test(code), false,
    'slugValid survives — a derived value the removed input was the only reader of');
  assert.equal(/ห้ามเว้นวรรค\/อักษรไทย/.test(code), false,
    'the main column still carries the slug error line');
});

test('CONTROL: those four probes DO fire on the pre-change markup', () => {
  // The row as it stood, run through the same predicates. Absence checks pass
  // against anything, so each one is proved to discriminate.
  const before = '<span className="font-mono">{SITE_URL}/</span>'
    + '<input placeholder="my-page-slug" className={slugValid ? "a" : "b"} />'
    + '<p>slug ต้องเป็นตัวอักษร a-z ... (ห้ามเว้นวรรค/อักษรไทย)</p>';
  assert.equal(/placeholder="my-page-slug"/.test(before), true);
  assert.equal(/\{SITE_URL\}\//.test(before), true);
  assert.equal(/slugValid/.test(before), true);
  assert.equal(/ห้ามเว้นวรรค\/อักษรไทย/.test(before), true,
    'a probe cannot see the thing it is asserting the absence of');
});

test('SITE_URL survives — it has two readers that are not the removed row', () => {
  // Removing the row must not take the constant with it: the JSON-LD builder and
  // the preview-link copy both use it.
  const { code } = form();
  assert.match(code, /const SITE_URL = 'https:\/\/9experttraining\.com'/);
  assert.match(code, /}, SITE_URL\)/, 'the JSON-LD builder no longer receives the site URL');
  assert.match(code, /writeText\(`\$\{SITE_URL\}\$\{draftPreviewUrl\}`\)/,
    'the preview-link copy no longer uses the site URL');
});

// ── the cascade, both halves ────────────────────────────────────────────────

test('the title → slug cascade survives the removal, and still stops on a hand edit', () => {
  /**
   * With no input in the main column this is the ONLY thing that gives a new
   * page a slug without opening a dialog, so it is the difference between
   * "create still works" and a blocker.
   */
  const { code } = form();
  assert.match(code, /function handleTitleChange\(v\) \{[\s\S]{0,200}?if \(!slugEdited\) setSlug\(asciiSlugify\(v\)\);/,
    'the cascade is gone, or no longer gated on slugEdited — a new page would have no slug '
    + 'and no visible field to type one into');
  // The other half: the dialog's field must still claim the slug by hand.
  assert.match(code, /onSlugChange: \(v\) => \{ setSlugEdited\(true\); setSlug\(v\); \}/,
    'editing the slug in the dialog no longer sets slugEdited, so the next keystroke in the '
    + 'title would overwrite what the author typed');
  // …and a NEW page starts with the cascade armed, an existing one with it off.
  assert.match(code, /useState\(isEdit\)/,
    'slugEdited no longer initialises from isEdit — an existing page would have its slug '
    + 'rewritten by the first title edit');
});

test('CONTROL: the cascade probe rejects an UNGATED cascade', () => {
  const ungated = 'function handleTitleChange(v) { setTitle(v); setSlug(asciiSlugify(v)); }';
  assert.equal(
    /function handleTitleChange\(v\) \{[\s\S]{0,200}?if \(!slugEdited\) setSlug\(asciiSlugify\(v\)\);/.test(ungated),
    false, 'the probe accepts a cascade that overwrites a hand-typed slug forever');
});

// ── a refused save still reaches the author ─────────────────────────────────

test('every save-path refusal goes through failSave, not setError', () => {
  /**
   * THE CASE THIS ROUND OWES. The slug field is behind a dialog that is SHUT
   * when บันทึกฉบับร่าง or เผยแพร่ is pressed, so a refusal that only set the
   * header text would name a field the author cannot see. failSave is the one
   * place that decides whether the dialog opens.
   */
  const { code } = form();
  assert.match(code, /const failSave = useCallback\(\(message\) => \{[\s\S]{0,400}?isSlugError\(text\)[\s\S]{0,200}?setSettingsOpen\(true\)/,
    'failSave does not open the settings dialog on a slug refusal');
  assert.match(code, /setSlugErrorAt\(\(n\) => n \+ 1\)/,
    'the refusal does not bump the nonce, so a second bad slug in a row would do nothing');

  // Both save paths, and the four client-side checks, route through it.
  for (const call of [
    "failSave(res?.error ?? 'บันทึกไม่สำเร็จ')",
    "failSave(saveRes?.error ?? 'บันทึกฉบับร่างไม่สำเร็จ')",
    "failSave(res?.error ?? 'เผยแพร่ไม่สำเร็จ')",
    "failSave('กรุณาใส่ slug')",
    "failSave('slug ต้องเป็น a-z, 0-9 และ - เท่านั้น')",
  ]) {
    assert.ok(code.includes(call),
      `a save refusal still calls setError directly: ${call} is missing`);
  }
});

test('the header band still renders the message — the dialog is an ADDITION', () => {
  // If the dialog were the only surface, a refusal an author dismissed would be
  // unrecoverable. Both read the same `error` state.
  const { code } = form();
  assert.match(code, /\{error && \(/, 'the header error band is gone');
  assert.match(code, /setError\(text\);/, 'failSave no longer sets the header message');
});

test('CONTROL: the failSave probe would MISS the pre-change shape', () => {
  const before = "if (!res || res.ok === false) { setError(res?.error ?? 'บันทึกไม่สำเร็จ'); return; }";
  assert.equal(/failSave\(/.test(before), false,
    'the probe reports failSave present in source that only calls setError');
  assert.equal(before.includes("failSave(res?.error ?? 'บันทึกไม่สำเร็จ')"), false);
});

test('the nonce is RESET on an ordinary open and on close', () => {
  // Otherwise the slug would steal focus every later time the dialog is opened,
  // claiming an error that is no longer being reported.
  const { code } = form();
  assert.match(code, /onClick=\{\(\) => \{ setSlugErrorAt\(0\); setSettingsOpen\(true\); \}\}/,
    'the ตั้งค่าหน้า button does not clear a stale slug refusal');
  assert.match(code, /onClose=\{\(\) => \{ setSettingsOpen\(false\); setSlugErrorAt\(0\); \}\}/,
    'closing the dialog does not clear the slug refusal');
});

test('the dialog REMOUNTS on each refusal — the key carries the nonce', () => {
  /**
   * A remount is what puts the menu back on ข้อมูลหน้า (the body's section
   * initialises from initialSection) and what re-fires autoFocus. Without the
   * nonce in the key, a second bad slug would change nothing on screen.
   */
  const { code } = readSource(DIALOG_SRC);
  assert.match(code, /key=\{`\$\{initialSection \?\? 'general'\}:\$\{slugErrorAt\}`\}/,
    'the dialog body is not keyed on the slug-refusal nonce');
});

test('CONTROL: the key probe rejects the pre-change key', () => {
  const before = "key={initialSection ?? 'general'}";
  assert.equal(
    /key=\{`\$\{initialSection \?\? 'general'\}:\$\{slugErrorAt\}`\}/.test(before), false,
    'the probe accepts a key that cannot remount on a second refusal');
});

test('the slug field takes focus and shows the server message', () => {
  const { code } = readSource(BODY_SRC);
  assert.match(code, /autoFocus=\{slugErrorAt > 0\}/,
    'the slug input does not focus on a refusal, or focuses on every open');
  assert.match(code, /\{slugError && <Warn tone="red">\{slugError\}<\/Warn>\}/,
    'the server refusal is not rendered beside the field it is about');
  assert.match(code, /invalid=\{slugBadFormat \|\| slugReserved \|\| Boolean\(slugError\)\}/,
    'a server-refused slug does not get the invalid ring');
});

test('CONTROL: the autoFocus probe rejects an UNGATED autoFocus', () => {
  assert.equal(/autoFocus=\{slugErrorAt > 0\}/.test('<TextInput autoFocus />'), false,
    'the probe accepts a field that grabs focus on every open');
});
