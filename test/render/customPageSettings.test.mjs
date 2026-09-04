import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PageSettingsBody } from '@/components/pageBuilder/editor/PageSettingsDialog';
import {
  CustomPageSettingsBody, customPageSaveStateText,
} from '@/app/admin/pages/_components/CustomPageSettingsBody';
import { PAGE_SETTINGS_SECTIONS } from '@/components/admin/pageSettings/SettingsShell';
// ADDED beside the statements above rather than folded into any — the standing
// rule. The activity section delegates to the builder's, so the delegation is
// asserted against the builder's own render rather than a transcription of it.
import { ActivitySection as BuilderActivitySection } from '@/components/pageBuilder/editor/PageSettingsDialog';
import { AUDIT_TRAIL_EMPTY } from '@/lib/pageBuilder/auditTrail';
import { readSource } from '../sourceScan.mjs';

/**
 * THE TWO PAGE-SETTINGS DIALOGS ARE ONE OBJECT — asserted, not claimed.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The requirement was that the Advanced HTML editor get the SAME ตั้งค่าหน้า
 * dialog as the Page Builder, not one that looks like it. "Same" was delivered
 * by extracting the frame, the header band, the menu and the footer band into
 * one shared module — but a shared module is only shared until someone copies a
 * className out of it, and nothing about a screenshot can tell the two cases
 * apart. So the parts that must NOT diverge are pinned here as a comparison
 * between the two live renders rather than as a claim in a commit message.
 *
 * ── WHAT IS PINNED, AND WHAT IS DELIBERATELY LEFT FREE ────────────────────
 * Pinned: the menu's ids, labels and ORDER (one array, not two); the nav's
 * rendered markup byte-for-byte at the same section and preview status; and the
 * footer band's wrapper classes.
 *
 * Free: the footer's TEXT and the section bodies. Those SHOULD differ — the
 * builder autosaves and this editor does not, and the two page types store
 * different fields. A test that pinned those would be demanding the two dialogs
 * lie about their own pages, which is the opposite of the point.
 *
 * ── WHY THE BODIES AND NOT THE DIALOGS ────────────────────────────────────
 * Same two walls as test/render/pageDialogs: a Radix `Dialog.Portal` renders
 * zero bytes here, and CustomPageForm cannot be imported into this tier at all
 * because it calls `useEditor()` from @tiptap/react. Both bodies are exported
 * for exactly this reason and take plain props.
 */

const noop = () => {};

const BUILDER_PAGE = {
  title: 'หน้าทดสอบ', slug: 'test-page', pageType: 'general', theme: 'default',
  status: 'draft', sections: [],
  seo: { metaTitle: 'ชื่อ', metaDescription: 'คำอธิบาย', canonicalUrl: '', ogImage: '', noIndex: false },
  jsonLd: {},
};

const builderBody = (over = {}) => renderToStaticMarkup(createElement(PageSettingsBody, {
  page: BUILDER_PAGE, pageId: 'p1', dispatch: noop, open: true,
  dirty: false, saving: false, ...over,
}));

/** Every prop CustomPageSettingsBody reads, at values that exercise each section. */
const CUSTOM_PROPS = (over = {}) => ({
  isEdit: true, isSuperAdmin: false,
  title: 'หน้าทดสอบ', onTitleChange: noop,
  slug: 'test-page', onSlugChange: noop,
  status: 'draft', setStatus: noop,
  metaTitle: 'ชื่อ', setMetaTitle: noop,
  metaDescription: 'คำอธิบาย', setMetaDescription: noop,
  canonicalUrl: '', setCanonicalUrl: noop,
  noIndex: false, setNoIndex: noop,
  ogTitle: '', setOgTitle: noop,
  ogDescription: '', setOgDescription: noop,
  ogType: 'website', setOgType: noop,
  ogImage: '', onOgImageChange: noop,
  twitterCard: 'summary_large_image', setTwitterCard: noop,
  jsonLdEnabled: true, setJsonLdEnabled: noop,
  schemaType: 'WebPage', setSchemaType: noop,
  jsonLdOverrides: {}, setJsonLdOverrides: noop,
  rawOverride: '', setRawOverride: noop,
  rawOverrideEnabled: false, setRawOverrideEnabled: noop,
  jsonLdStatus: { status: 'unchecked', message: '' },
  onJsonLdPreview: noop, onJsonLdCopy: noop,
  previewToken: 'tok-123', draftPreviewUrl: '/test-page?preview=tok-123', copied: false,
  onCopyPreviewUrl: noop, onRegenerateToken: noop,
  ...over,
});

const customBody = (over = {}) =>
  renderToStaticMarkup(createElement(CustomPageSettingsBody, CUSTOM_PROPS(over)));

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

/** The `<nav>` element's markup, as a string, for a byte comparison. */
function navMarkup(html) {
  const start = html.indexOf('<nav');
  assert.notEqual(start, -1, 'no <nav> in the rendered body');
  const end = html.indexOf('</nav>', start);
  assert.notEqual(end, -1, 'the <nav> is unterminated');
  return html.slice(start, end + '</nav>'.length);
}

const footerOf = (html) => docOf(html).querySelector('[data-testid="settings-save-state"]');
const menuLabels = (html) =>
  [...docOf(html).querySelectorAll('nav button')].map((b) => b.textContent.trim());

// ── 1. one menu, not two ───────────────────────────────────────────────────

test('both dialogs read the SAME menu array — ids, labels and order', () => {
  /**
   * The strongest form of this claim is that there is only ONE array, so it is
   * asserted against PAGE_SETTINGS_SECTIONS rather than by comparing the two
   * renders to each other: two renders agreeing could mean two copies that
   * happen to match today.
   */
  const expected = PAGE_SETTINGS_SECTIONS.map((s) => s.label);
  assert.deepEqual(menuLabels(builderBody()), expected);
  assert.deepEqual(menuLabels(customBody()), expected);
  assert.deepEqual(menuLabels(builderBody()), menuLabels(customBody()));

  // The six, named, so a silent addition or removal has to be typed here too.
  assert.deepEqual(PAGE_SETTINGS_SECTIONS.map((s) => s.id),
    ['general', 'seo', 'jsonld', 'preview', 'history', 'activity']);
});

test('the nav markup is BYTE-IDENTICAL at the same section and preview status', () => {
  /**
   * Labels alone would pass on two navs with different geometry, different
   * glyphs or a different active treatment. This compares the whole element,
   * which is what "the same menu" has to mean if it means anything.
   *
   * Both are rendered at their default section and with no preview status: the
   * builder's dot reports a server-read preview-access state that CustomPage has
   * none of, so `null` is the only value both can legitimately be at.
   */
  assert.equal(navMarkup(customBody()), navMarkup(builderBody()));
});

test('CONTROL: the nav comparison sees a one-label difference', () => {
  // Without this, byte-equality could be two empty strings or a reader that
  // returns the same slice regardless of input.
  const a = navMarkup(builderBody());
  const planted = a.replace('SEO', 'SEO ');
  assert.notEqual(planted, a, 'the fixture did not change, so the check below proves nothing');
  assert.notEqual(planted, navMarkup(customBody()));
});

// ── 2. one footer band, two sentences ──────────────────────────────────────

test('the footer band is the same band, and says different things', () => {
  /**
   * The geometry is shared and the claim is not. `min-h-[66px]`, the border and
   * the muted surface come from one component, so the two bands must carry
   * identical wrapper classes; the SENTENCE must differ, because the builder
   * autosaves on a five-second debounce and this form persists nothing until its
   * save button is pressed. A band that told the Advanced HTML author their work
   * was being saved automatically would be false.
   */
  const b = footerOf(builderBody());
  const c = footerOf(customBody());
  assert.ok(b && c, 'one of the two bodies rendered no footer band');
  assert.equal(c.className, b.className,
    'the two footer bands no longer share their geometry — one of them stopped using the shared band');
  assert.notEqual(c.textContent.trim(), b.textContent.trim(),
    'both bands now say the same thing; one of the two is claiming the wrong save behaviour');
});

test('the Advanced HTML band names the buttons that actually save and publish', () => {
  /**
   * Not merely "different from the builder's" — different in the specific way
   * that is true, and the truth changed with the draft split.
   *
   * It used to name บันทึกอัปเดต, the single save button. That button no longer
   * exists: EDIT mode now has a PAIR, and a band naming the old one would send
   * an author looking for a control that is gone and imply that saving is what
   * makes a change public. It is not — บันทึกฉบับร่าง stores the work and
   * เผยแพร่ is the only thing that moves the live page, so the band names both.
   *
   * CREATE mode still has one button, and the sentence still names only it:
   * there is no draft to save on a document that does not exist yet.
   */
  assert.match(customPageSaveStateText(true), /บันทึกฉบับร่าง/,
    'the edit-mode band does not name the button that stores the work');
  assert.match(customPageSaveStateText(true), /เผยแพร่/,
    'the edit-mode band does not name the button that makes a change public');
  assert.doesNotMatch(customPageSaveStateText(true), /บันทึกอัปเดต/,
    'the band still names the single save button the draft split removed');

  assert.match(customPageSaveStateText(false), /“บันทึก”/,
    'the create-mode band no longer names its one button');
  assert.doesNotMatch(customPageSaveStateText(false), /เผยแพร่/,
    'create mode offers no publish button, so the band must not name one');

  // Neither mode may promise an automatic save this form does not perform.
  for (const isEdit of [true, false]) {
    assert.match(customPageSaveStateText(isEdit), /ไม่มีการบันทึกอัตโนมัติ/,
      'the band stopped saying there is no autosave, which is still true');
  }
  assert.match(footerOf(customBody()).textContent, /ไม่มีการบันทึกอัตโนมัติ/);
  assert.match(footerOf(builderBody()).textContent, /บันทึกแล้ว|อัตโนมัติ|กำลังบันทึก/);
});

test('CONTROL: the band’s two modes really do differ', () => {
  // Without this, a function returning one string for both would satisfy every
  // "match" above that the shared tail happens to cover.
  assert.notEqual(customPageSaveStateText(true), customPageSaveStateText(false));
});

// ── 3. the union set survived the move out of the sidebar ─────────────────

/**
 * Every control the deleted `<aside>` carried, by the label it is now reachable
 * under, and the section it lives in.
 *
 * TRANSCRIBED BY HAND from the sidebar as it stood before the move, NOT
 * recomputed from the component — a set derived from the thing under test
 * agrees with whatever it finds. This is the check that catches a field landing
 * in NO section, which looks like nothing at all from inside every section.
 */
const UNION = {
  general: ['ชื่อหน้า', 'URL (slug)', 'สถานะ'],
  seo: [
    'Meta title', 'Meta description', 'Canonical URL',
    'OG title', 'OG description', 'OG type', 'OG image', 'Twitter card',
  ],
  jsonld: [
    'ประเภท Schema', 'Name', 'Description', 'Image URL',
    'Date Published', 'Date Modified',
  ],
};

const labelsIn = (html) =>
  [...docOf(html).querySelectorAll('label')].map((l) => l.textContent.trim());

test('every field the sidebar carried is reachable in the dialog', () => {
  for (const [section, fields] of Object.entries(UNION)) {
    const labels = labelsIn(customBody({ initialSection: section }));
    for (const f of fields) {
      assert.ok(labels.some((l) => l.startsWith(f)),
        `"${f}" is in no section of the dialog — it was in the sidebar and the sidebar is gone. `
        + `Section "${section}" renders: ${JSON.stringify(labels)}`);
    }
  }
});

test('the two checkbox controls and the superadmin gate are reachable too', () => {
  // These are `<label><input>text</label>`, not `<Field>`, so the reader above
  // finds them by a different shape and they are asserted separately rather
  // than being quietly absent from the union.
  assert.match(customBody({ initialSection: 'seo' }), /noindex/);
  assert.match(customBody({ initialSection: 'jsonld' }), /เปิดใช้ JSON-LD/);

  const superadmin = customBody({ initialSection: 'jsonld', isSuperAdmin: true });
  assert.match(superadmin, /Advanced: Raw JSON Override/);
  assert.doesNotMatch(customBody({ initialSection: 'jsonld' }), /Advanced: Raw JSON Override/,
    'the raw-override gate renders for a non-superadmin — it is a gate on a field that '
    + 'writes straight into the page head');
});

test('CONTROL: the union reader would NOTICE a dropped field', () => {
  // The failure mode this file exists for, proved rather than assumed: a label
  // that is not rendered must not be found.
  const labels = labelsIn(customBody({ initialSection: 'general' }));
  assert.equal(labels.some((l) => l.startsWith('ชนิดหน้า')), false,
    'the reader claims to see a field that is deliberately not built');
  assert.equal(labels.some((l) => l.startsWith('ชื่อหน้า')), true,
    'the reader cannot see a field that IS there, so every assertion above is vacuous');
});

// ── 4. the two empty histories state the truth and build nothing ──────────

test('ประวัติการเผยแพร่ says what is not recorded, and offers no control', () => {
  /**
   * `CustomPage` has no version model — `PageVersion` snapshots builder pages
   * only and there is no equivalent anywhere in the repo. So this section has
   * nothing to show, and the honest response — the one the builder's JSON-LD
   * tab already establishes — is to keep the menu item and say so in words.
   *
   * A spinner would claim a fetch, a table header would claim a shape, and an
   * empty list would claim the query ran and found nothing. All three would be
   * false, so none of them is here.
   *
   * ── ONE SECTION NOW, NOT TWO ──────────────────────────────────────────────
   * ประวัติการดำเนินการ was asserted by this same loop until the audit round,
   * on the stated grounds that customPages.js "calls recordAdminAction zero
   * times". That is no longer the claim: the file records a PageAuditLog row per
   * mutation and the section renders the builder's real ActivityTrail. The loop
   * kept PASSING across that change — ActivityTrail's unsaved-page message also
   * contains "ยังไม่มีการ" — which is precisely why it had to be split rather
   * than left: it would have gone on reporting green about a claim it had
   * stopped testing. The activity section's own case is below.
   */
  const afterNav = customBody({ initialSection: 'history' }).split('</nav>')[1];
  const doc = docOf(afterNav);
  assert.equal(doc.querySelectorAll('table, ul, ol').length, 0,
    'the history section renders a list — there is no data behind it');
  assert.equal(doc.querySelectorAll('input, select, textarea, button').length, 0,
    'the history section renders a control for data that is not recorded');
  assert.match(afterNav, /ยังไม่มีการเก็บประวัติเวอร์ชัน/,
    'the history section no longer states that no version history is kept');
});

test('ประวัติการดำเนินการ delegates to the builder’s trail, and is not a second one', () => {
  /**
   * The section stopped being a placeholder when customPages.js started writing
   * PageAuditLog rows tagged `pageType: 'advanced_html'` — the half of that enum
   * that was modelled from the start and had never been written to.
   *
   * It renders the BUILDER's component. `getPageAuditLog` filters on pageId
   * alone with no pageType clause, so no fork was needed on either side, and
   * this asserts that no fork was made: the section's markup must be the same
   * markup the builder's ActivitySection produces for the same props.
   */
  const custom = customBody({ initialSection: 'activity' }).split('</nav>')[1];
  const builder = renderToStaticMarkup(
    createElement(BuilderActivitySection, { pageId: '', open: false })
  );
  assert.ok(custom.includes(builder),
    'the activity section no longer renders the builder’s ActivitySection markup — '
    + 'one of the two grew its own trail, which is the fork this delegation exists to prevent');
});

test('an UNSAVED page is told why the trail is empty, not shown an empty trail', () => {
  // The render tier always sees pageId:'' (a page that has never been saved),
  // and that state must not read as "nobody has touched this page".
  const afterNav = customBody({ initialSection: 'activity' }).split('</nav>')[1];
  assert.match(afterNav, /ยังไม่ได้บันทึกหน้านี้/,
    'an unsaved page no longer explains why there is nothing — it just looks empty');
  assert.equal(docOf(afterNav).querySelectorAll('table, ul, ol').length, 0,
    'a page with no id renders a list, which would claim a query that never ran');
});

test('CONTROL: the activity assertions distinguish the two empty states', () => {
  /**
   * Both messages contain "ยังไม่มีการ", which is exactly how the old loop kept
   * passing across the change. So the control proves the two readers above
   * separate them rather than both matching whichever string is present.
   */
  const unsaved = 'ยังไม่ได้บันทึกหน้านี้ — ยังไม่มีการดำเนินการที่บันทึกไว้';
  const savedButEmpty = AUDIT_TRAIL_EMPTY;
  assert.match(unsaved, /ยังไม่มีการ/);                 // both contain the loose token…
  assert.match(savedButEmpty, /ยังไม่มีการ/);
  assert.match(unsaved, /ยังไม่ได้บันทึกหน้านี้/);        // …only the probe used above separates them
  assert.doesNotMatch(savedButEmpty, /ยังไม่ได้บันทึกหน้านี้/);
});

test('CONTROL: the no-list reader DOES see a list when one is planted', () => {
  const doc = docOf('<div><ul><li>a version</li></ul></div>');
  assert.equal(doc.querySelectorAll('table, ul, ol').length, 1);
  // …and the nav's own <ul> is why the assertion above slices the section body
  // rather than the whole render.
  assert.ok(navMarkup(customBody()).includes('<ul'),
    'the nav stopped using a <ul>, so the section check above may be reading the wrong thing');
});

// ── 5. the preview section tells the truth about the link ────────────────

test('the preview section describes a link that works, and drops the Batch 3 claim', () => {
  /**
   * The sidebar said the link "จะเปิดใช้งานใน Batch 3 (ตอนนี้ลิงก์ยังเปิดไม่ได้)".
   * (public)/[...slug]/page.jsx has honoured `?preview=<token>` since
   * resolveCustomPageForRequest landed, so that sentence was false when it
   * moved. Both halves are asserted: the false claim is gone, and the route
   * really does read the token.
   */
  const html = customBody({ initialSection: 'preview' });
  assert.doesNotMatch(html, /Batch 3/, 'the stale "not available yet" claim came along with the move');
  assert.doesNotMatch(html, /ยังเปิดไม่ได้/);
  assert.match(html, /\/test-page\?preview=tok-123/, 'the link itself is not shown');

  const route = readSource('src/app/(public)/[...slug]/page.jsx').code;
  assert.match(route, /previewToken === token/,
    'the public route no longer honours the token — the dialog now claims a link that does nothing');
});

test('in create mode the preview section says the link comes later, and shows none', () => {
  // The block was edit-mode-only in the sidebar and simply vanished on a new
  // page. The menu item is constant now, so the section states why it is empty
  // instead of the menu leading somewhere blank.
  const html = customBody({ initialSection: 'preview', isEdit: false, previewToken: '', draftPreviewUrl: '' });
  assert.match(html, /เมื่อบันทึกหน้านี้ครั้งแรก/);
  assert.equal(docOf(html).querySelectorAll('button').length,
    docOf(html).querySelectorAll('nav button').length,
    'create mode renders a copy or regenerate button for a token that does not exist yet');
});

// ── 6. the dialog is reached, and the shell is not re-implemented ─────────

test('CustomPageForm opens it with the builder’s button, glyph and label', () => {
  const form = readSource('src/app/admin/pages/_components/CustomPageForm.jsx').withImports;
  assert.match(form, /<Settings className="h-4 w-4" \/> ตั้งค่าหน้า/,
    'the entry point no longer matches EditorTopBar’s — same glyph, same size, same label');
  // ADDED, not folded in: the lucide statement the file already had must still
  // be there beside the new one. This repo has a defect class where an edit
  // REPLACED an import and left a call site on a free identifier.
  assert.match(form, /Undo2, Redo2, ChevronLeft/,
    'the original lucide import was rewritten rather than added beside');
  assert.match(form, /import \{ Settings \} from 'lucide-react'/);
});

test('neither dialog re-implements the shell — one frame, one nav, one band', () => {
  /**
   * The whole point of the shared module, as a source claim the render tier
   * cannot make: a second `Dialog.Content`, a second `<nav>` or a second copy
   * of the band's classes anywhere but the shell means the two dialogs have
   * started to drift, whatever they happen to look like today.
   */
  const shell = 'src/components/admin/pageSettings/SettingsShell.jsx';
  for (const f of [
    'src/components/pageBuilder/editor/PageSettingsDialog.jsx',
    'src/app/admin/pages/_components/CustomPageSettingsBody.jsx',
    'src/app/admin/pages/_components/CustomPageSettingsDialog.jsx',
  ]) {
    const { code } = readSource(f);
    assert.equal(code.includes('Dialog.Content'), false, `${f} draws its own dialog frame`);
    assert.equal(code.includes('min-h-[66px]'), false, `${f} carries its own copy of the footer band`);
    assert.equal(code.includes('sm:w-[190px]'), false, `${f} carries its own copy of the menu`);
  }
  const { code } = readSource(shell);
  assert.ok(code.includes('Dialog.Content') && code.includes('min-h-[66px]') && code.includes('sm:w-[190px]'),
    'the shell does not carry the three things the callers were just forbidden to carry, '
    + 'so the assertions above are passing on absence everywhere');
});

test('the Advanced HTML menu is IMPORTED, never retyped', () => {
  // Six Thai labels typed a second time is exactly how two menus drift apart
  // while both look right in review.
  const { code, withImports } = readSource('src/app/admin/pages/_components/CustomPageSettingsBody.jsx');
  assert.match(withImports, /PAGE_SETTINGS_SECTIONS/);
  for (const label of PAGE_SETTINGS_SECTIONS.map((s) => s.label)) {
    assert.equal(code.includes(`label: '${label}'`), false,
      `the menu label "${label}" is declared here as well as in the shell`);
  }
});
