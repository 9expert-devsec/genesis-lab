import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import {
  PageSettingsBody, PAGE_SETTINGS_SECTIONS,
  GeneralSection, SeoSection, JsonLdSection, HistorySection,
} from '@/components/pageBuilder/editor/PageSettingsDialog';
import { PreviewSection } from '@/components/pageBuilder/editor/PageSettingsDialog';
// Round 28. ADDED beside the two statements above rather than folded into
// either — the standing rule, and the one panelPolish's lucide scanner had to
// be rewritten for.
import { SettingsNav } from '@/components/pageBuilder/editor/PageSettingsDialog';
// Round 38, ADDED beside the statements above rather than folded into any.
import { ActivitySection } from '@/components/pageBuilder/editor/PageSettingsDialog';
import { ActivityTrail } from '@/components/pageBuilder/editor/ActivityTrail';
import { AUDIT_TRAIL_NOTE, AUDIT_TRAIL_EMPTY } from '@/lib/pageBuilder/auditTrail';
import { PreviewBody } from '@/components/pageBuilder/editor/PreviewDialog';
import { readSource } from '../sourceScan.mjs';

/**
 * THE UNION CHECK for the two page-level dialogs — round 27 commit 1.
 *
 * ── WHY IT EXISTS, AND WHY IT EXISTS *FIRST* ───────────────────────────────
 * The PageSettingsDialog redesign relocates every field it owns into a
 * left-hand menu. That is the same shape as round 15's tab split, and it has
 * the same failure mode: a field ends up in NO section and is simply gone,
 * which looks like nothing at all from inside every section.
 *
 * It is not hypothetical here. docs/page-settings-redesign.md found the
 * mockups silently drop FIVE fields that exist and work — promotion id,
 * promotion order, the cover uploader, canonical URL and OG image URL. So the
 * set is pinned before anything moves.
 *
 * ── WHERE THE EXPECTED SETS COME FROM ──────────────────────────────────────
 * Captured by rendering the bodies at the pre-split commit and transcribed
 * here by hand. They are NOT recomputed from the components, because a set
 * derived from the thing under test agrees with whatever it finds — round 15's
 * rule, and the whole reason that check caught anything.
 *
 * ── WHY THE BODIES AND NOT THE DIALOGS ─────────────────────────────────────
 * Two independent walls, both measured rather than assumed. `useEditor()`
 * THROWS outside a provider; and inside one, a Radix `Dialog.Portal` renders
 * ZERO BYTES under renderToStaticMarkup. So the dialogs were unreachable from
 * this tier twice over, which is why neither had any coverage. The bodies were
 * extracted for exactly this, and the extraction was verified to change no
 * rendered output — byte-identical at 4621 / 6415 / 3545 bytes across the
 * three cases below.
 *
 * What that does NOT prove is the Dialog wrapper itself, which no render test
 * can reach. It is a visible source diff, and the one claim about it that
 * matters — no Save/Cancel button — is asserted from the source at the bottom.
 */

const noop = () => {};

const PAGE = (over = {}) => ({
  title: 'หน้าทดสอบ', slug: 'test-page', pageType: 'general', theme: 'default',
  status: 'draft', sections: [],
  seo: { metaTitle: 'ชื่อ', metaDescription: 'คำอธิบาย', canonicalUrl: '', ogImage: '', noIndex: false },
  jsonLd: {}, ...over,
});
const PROMO = () => PAGE({ pageType: 'promotion', promotionId: '', promotionOrder: 0, promotionCover: '' });
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

const noopPatch = noop;

/**
 * The UNION across every menu section, which is what the whole check is for.
 *
 * Rendering `PageSettingsBody` alone would show only the ACTIVE section, and a
 * field lost from an inactive one would be invisible — the exact failure mode
 * this file exists to catch. So each section is rendered on its own and the
 * results concatenated, the same way round 15 unions the three tab bodies.
 *
 * The order is PAGE_SETTINGS_SECTIONS' order, taken from the component rather
 * than retyped, so a reordered menu reorders this too and the ordered set below
 * stays meaningful.
 */
const sectionHtml = (id, page) => ({
  general: () => renderToStaticMarkup(createElement(GeneralSection, { page, patch: noopPatch })),
  seo:     () => renderToStaticMarkup(createElement(SeoSection, { seo: page?.seo ?? {}, patchSeo: noopPatch })),
  jsonld:  () => renderToStaticMarkup(createElement(JsonLdSection, {})),
  preview: () => renderToStaticMarkup(createElement(PreviewSection, { page, pageId: 'p1', tier: TIER, open: true })),
  history: () => renderToStaticMarkup(createElement(HistorySection, { pageId: 'p1', open: true })),
  // Round 38. Takes no `editor` — see ActivitySection: this list writes nothing
  // and decides nothing from local state, so it is not handed the document.
  activity: () => renderToStaticMarkup(createElement(ActivitySection, { pageId: 'p1', open: true })),
}[id]());

const settings = (page = PAGE()) =>
  PAGE_SETTINGS_SECTIONS.map((s) => sectionHtml(s.id, page)).join('');

/** The body itself — menu chrome plus whichever section is open by default. */
const body = (page = PAGE(), over = {}) => renderToStaticMarkup(createElement(PageSettingsBody, {
  page, pageId: 'p1', dispatch: noop, open: true, dirty: false, saving: false, ...over,
}));
const preview = (over = {}) => renderToStaticMarkup(createElement(PreviewBody, {
  page: PAGE(), pageId: 'p1', tier: TIER, open: true, ...over,
}));

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

/**
 * Every label rendered, in document order.
 *
 * BOTH SHAPES, and that is round 18's correction arriving here: `Field`
 * produces `<label><span>…`, but a checkbox is `<label><input>text</label>`
 * and has no span. A span-only selector silently under-reports — it did
 * exactly that to the section-control audit's first harvest — and here it
 * would drop the noindex control from the union entirely.
 */
const labelsIn = (html) => [...docOf(html).querySelectorAll('label')].map((l) => {
  const span = l.querySelector(':scope > span');
  return (span ?? l).textContent.replace(/\s+/g, ' ').trim();
});

const groupsIn = (html) => [...docOf(html).querySelectorAll('legend')]
  .map((l) => l.textContent.replace(/\s+/g, ' ').trim());

const buttonsIn = (html) => [...docOf(html).querySelectorAll('button')]
  .map((b) => b.textContent.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

// ── THE CAPTURED SETS — the pre-relocation truth ──────────────────────────

/** PageSettingsBody on a NON-promotion page. */
const SETTINGS_GENERAL = [
  'ชื่อหน้า',
  'URL (slug)',
  'ชนิดหน้า',
  'ธีม',
  'Meta title',
  'Meta description',
  'Canonical URL',
  'OG image URL',
  'ไม่ให้ Google เก็บหน้านี้ (noindex)',
];

/**
 * …and on a PROMOTION page, which adds four. Three are promotion fields and
 * the fourth is the uploader's own inner file-input label — it is part of the
 * rendered set, so it is part of the assertion rather than filtered out to
 * make the list tidier.
 */
const SETTINGS_PROMOTION = [
  'ชื่อหน้า',
  'URL (slug)',
  'ชนิดหน้า',
  'Promotion ID (MSDB)',
  'ลำดับในหน้าโปรโมชัน',
  'ภาพปกโปรโมชัน',
  'อัปโหลดภาพปก',
  'ธีม',
  'Meta title',
  'Meta description',
  'Canonical URL',
  'OG image URL',
  'ไม่ให้ Google เก็บหน้านี้ (noindex)',
];

/**
 * The union across the WHOLE menu, after commit 3 folded the preview link in.
 * SETTINGS_GENERAL is spliced in VERBATIM — the capture taken before the menu
 * existed — and the two preview fields are appended in menu order.
 */
const SETTINGS_UNION = [
  ...SETTINGS_GENERAL,
  'ตั้งรหัสผ่านใหม่',
  'หมดอายุเมื่อ',
];

const PREVIEW_LABELS = ['ตั้งรหัสผ่านใหม่', 'หมดอายุเมื่อ'];
const PREVIEW_BUTTONS = ['เปิดใช้งาน', 'สุ่มรหัสใหม่', 'ปิดการเข้าถึง'];

/** The five docs/page-settings-redesign.md found the mockups drop. */
const MOCKUP_DROPS = [
  'Promotion ID (MSDB)', 'ลำดับในหน้าโปรโมชัน', 'ภาพปกโปรโมชัน',
  'Canonical URL', 'OG image URL',
];

// ── 1. the union, exact and ordered ───────────────────────────────────────

test('the union across all menu sections equals the pre-relocation field set', () => {
  /**
   * ── THE SET IS INVARIANT; ONLY ITS ARRANGEMENT CHANGED ───────────────────
   * The literal below is unchanged from the capture taken before the menu
   * existed. What changed is how it is GATHERED — from four sections instead of
   * one scrolling form — which is precisely the change that can lose a field
   * without any section looking wrong.
   */
  assert.deepEqual(labelsIn(settings()), SETTINGS_UNION,
    'the page settings field set changed. A field in NO menu section is invisible from inside '
    + 'every section, which is why this is an exact ordered set and not a lower bound.');

  /**
   * ── HOW THE SET GREW, AND WHY THAT IS NOT A RELAXATION ───────────────────
   * Commit 3 moved PreviewDialog in as a section, so its two fields joined this
   * menu. EXTENDED by exactly that set — the original capture is spliced in
   * verbatim and the addition is named — never regenerated from the components,
   * which is the one thing this check must never do.
   */
  assert.deepEqual(SETTINGS_UNION.filter((x) => !SETTINGS_GENERAL.includes(x)), PREVIEW_LABELS);
  assert.deepEqual(SETTINGS_GENERAL.filter((x) => !SETTINGS_UNION.includes(x)), []);
});

test('the menu declares exactly six sections, and the body renders one per item', () => {
  // AMENDED, round 38: five -> six. `activity` is the audit log's surface, and
  // it is a separate item rather than a group under ประวัติการเผยแพร่ because
  // that one lists VERSIONS and this one lists ACTIONS — see the note on the
  // declaration. The assertion's guarantee is unchanged: an exact ordered set,
  // and one nav button per declared section from ONE declaration.
  assert.deepEqual(PAGE_SETTINGS_SECTIONS.map((s) => s.id),
    ['general', 'seo', 'jsonld', 'preview', 'history', 'activity']);
  assert.deepEqual(PAGE_SETTINGS_SECTIONS.map((s) => s.label),
    ['ข้อมูลหน้า', 'SEO', 'JSON-LD', 'ลิงก์พรีวิว', 'ประวัติการเผยแพร่', 'ประวัติการดำเนินการ']);

  // The nav renders one button per declared section — the list and the strip
  // come from ONE declaration, so they cannot disagree about what exists.
  assert.deepEqual(buttonsIn(body()), PAGE_SETTINGS_SECTIONS.map((s) => s.label));
});

test('each section renders exactly its own fields and none of another section\'s', () => {
  /**
   * Round 15's discipline, per section: exact sets, so a field that leaks
   * across a boundary is caught in both directions at once.
   */
  const per = {
    general: ['ชื่อหน้า', 'URL (slug)', 'ชนิดหน้า', 'ธีม'],
    seo: ['Meta title', 'Meta description', 'Canonical URL', 'OG image URL', 'ไม่ให้ Google เก็บหน้านี้ (noindex)'],
    jsonld: [],
    preview: PREVIEW_LABELS,
    history: [],
    // Round 38: a list and a note, no controls — the same shape as jsonld.
    activity: [],
  };
  for (const [id, expected] of Object.entries(per)) {
    assert.deepEqual(labelsIn(sectionHtml(id, PAGE())), expected, `the ${id} section's fields changed`);
  }

  // Every field belongs to exactly one section — no duplicates across the union.
  const all = PAGE_SETTINGS_SECTIONS.flatMap((s) => labelsIn(sectionHtml(s.id, PAGE())));
  assert.equal(new Set(all).size, all.length, 'a field is rendered by more than one section');
});

test('each section carries exactly its own group legend', () => {
  const legends = {
    general: ['ทั่วไป'], seo: ['SEO'], jsonld: ['JSON-LD'],
    preview: ['ลิงก์', 'รหัสผ่าน', 'วันหมดอายุ'],   // the absorbed dialog's own three
    history: ['ประวัติการเผยแพร่'],
    activity: ['ประวัติการดำเนินการ'],
  };
  for (const [id, expected] of Object.entries(legends)) {
    assert.deepEqual(groupsIn(sectionHtml(id, PAGE())), expected);
  }
});

test('PageSettingsBody on a PROMOTION page renders the four extra fields too', () => {
  const promotionUnion = [...SETTINGS_PROMOTION, ...PREVIEW_LABELS];
  assert.deepEqual(labelsIn(settings(PROMO())), promotionUnion,
    'the promotion-only fields changed — these are three of the five the mockups drop');
  // The promotion set is a superset of the general one, in the same order.
  assert.deepEqual(SETTINGS_GENERAL.filter((f) => !SETTINGS_PROMOTION.includes(f)), []);
});

test('PreviewBody renders exactly its own fields, groups and buttons', () => {
  const html = preview();
  assert.deepEqual(labelsIn(html), PREVIEW_LABELS);
  assert.deepEqual(groupsIn(html), ['ลิงก์', 'รหัสผ่าน', 'วันหมดอายุ']);
  assert.deepEqual(buttonsIn(html), PREVIEW_BUTTONS,
    'the preview actions changed — each of these buttons calls a tier-gated server action');
});

test('the absorbed preview section renders exactly what the standalone body did', () => {
  /**
   * Commit 3 is navigation. The section wraps the SAME body, so its fields,
   * groups and buttons must equal the standalone body's — anything else means
   * the move edited it.
   */
  const asSection = sectionHtml('preview', PAGE());
  const standalone = preview();
  assert.deepEqual(labelsIn(asSection), labelsIn(standalone));
  assert.deepEqual(groupsIn(asSection), groupsIn(standalone));
  assert.deepEqual(buttonsIn(asSection), buttonsIn(standalone));

  // …and no OTHER section shares a field with it.
  for (const sec of PAGE_SETTINGS_SECTIONS.filter((x) => x.id !== 'preview')) {
    const overlap = labelsIn(sectionHtml(sec.id, PROMO())).filter((l) => PREVIEW_LABELS.includes(l));
    assert.deepEqual(overlap, [], 'the ' + sec.id + ' section renders a preview field');
  }
});

test('the preview section announces that it writes immediately, and shows no save state', () => {
  /**
   * Four sections stage their edits for autosave; this one commits credentials
   * on click. Under a menu they look alike, so the difference is stated before
   * any control — and the save-state footer is withheld, because a "saved" line
   * under a section that already wrote answers the wrong question.
   */
  const doc = docOf(body(PAGE(), { tier: TIER, initialSection: 'preview' }));
  const banner = doc.querySelector('[data-testid="preview-immediate-write"]');
  assert.notEqual(banner, null, 'the preview section no longer says that it writes immediately');
  assert.equal(banner.textContent.replace(/\s+/g, ' ').trim(),
    'ส่วนนี้บันทึกลงเซิร์ฟเวอร์ทันทีที่กดปุ่ม — ไม่รอการบันทึกอัตโนมัติเหมือนส่วนอื่น');
  assert.equal(doc.querySelector('[data-testid="settings-save-state"]'), null,
    'the preview section shows a save-state line — it does not ride autosave, so that line '
    + 'would describe a mechanism this section does not use');
});

test('CONTROL: every OTHER section does show the save state, and no banner', () => {
  // Discrimination for the pair above: the withheld footer and the added banner
  // must both be specific to the preview section, not global.
  for (const id of ['general', 'seo', 'jsonld', 'history', 'activity']) {
    const doc = docOf(body(PAGE(), { tier: TIER, initialSection: id }));
    assert.notEqual(doc.querySelector('[data-testid="settings-save-state"]'), null, id + ' lost its save state');
    assert.equal(doc.querySelector('[data-testid="preview-immediate-write"]'), null, id + ' gained the preview banner');
  }
});

test('PreviewDialog.jsx no longer exports a dialog — only the body', async () => {
  /**
   * J: the standalone dialog is gone and its trigger survives. EditorShell now
   * opens ONE dialog pointed at a section, so a second surface cannot drift
   * from the first.
   */
  const mod = await import('@/components/pageBuilder/editor/PreviewDialog');
  assert.deepEqual(Object.keys(mod), ['PreviewBody']);

  const { code } = readSource('src/components/pageBuilder/editor/EditorShell.jsx');
  assert.equal(code.includes('<PreviewDialog'), false, 'a second preview dialog is mounted again');
  assert.equal(code.includes("onOpenPreview={() => openSettings('preview')}"), true,
    'the top bar preview button no longer opens the settings dialog at the preview section');
  assert.equal(code.includes("onOpenSettings={() => openSettings('general')}"), true,
    'the settings button no longer opens at the first section');
});

// ── 2. the five fields the mockups drop ───────────────────────────────────

test('all five fields the mockups drop are present today', () => {
  /**
   * Named individually rather than counted, so the failure says WHICH one went
   * — that is the whole difference between this catching a regression and it
   * reporting a number nobody can act on.
   */
  const present = labelsIn(settings(PROMO()));
  for (const f of MOCKUP_DROPS) {
    assert.equal(present.includes(f), true, `"${f}" is gone — it is one of the five fields the `
      + 'mockups drop and docs/page-settings-redesign.md says must survive the redesign');
  }
  assert.equal(MOCKUP_DROPS.length, 5);
});

test('CONTROL: dropping a field IS caught, and named', () => {
  /**
   * Discrimination for both checks above. The captured set is compared against
   * one with a member removed; it must fail, and the missing member must be
   * recoverable by name — otherwise "deepEqual passed" says nothing about
   * whether a dropped field would be noticed.
   */
  const full = labelsIn(settings(PROMO()));
  const without = full.filter((f) => f !== 'OG image URL');
  assert.notDeepEqual(without, SETTINGS_PROMOTION);
  assert.throws(() => assert.deepEqual(without, SETTINGS_PROMOTION));
  assert.deepEqual(SETTINGS_PROMOTION.filter((f) => !without.includes(f)), ['OG image URL']);

  // …and the reader is not simply returning everything it is given.
  assert.deepEqual(labelsIn('<div>no labels here</div>'), []);
  assert.deepEqual(labelsIn('<label><span>ก</span></label><label><input type="checkbox">ข</label>'), ['ก', 'ข']);
});

// ── 3. no second save authority ───────────────────────────────────────────

test('neither dialog offers a Save or Cancel — autosave owns persistence', () => {
  /**
   * docs/page-settings-redesign.md §D: the mockups put ยกเลิก / บันทึกการตั้งค่า
   * at the dialog's foot, which would be a SECOND save authority for one
   * document — and both labels would be false, because the editor's 5s autosave
   * has already fired by the time either could be pressed.
   *
   * A source claim, because the buttons would live in the Dialog wrapper, which
   * renders zero bytes in this tier. Asserted over the whole file so a button
   * added to either half is caught.
   */
  for (const rel of [
    'src/components/pageBuilder/editor/PageSettingsDialog.jsx',
    'src/components/pageBuilder/editor/PreviewDialog.jsx',
  ]) {
    const { code } = readSource(rel);
    for (const label of ['บันทึกการตั้งค่า', 'ยกเลิก']) {
      assert.equal(code.includes(label), false,
        `${rel} gained a "${label}" control. Persistence is the editor's — see `
        + 'docs/page-settings-redesign.md §D before adding a second save path.');
    }
  }

  // PageSettingsBody renders no button at all today; PreviewBody's three are
  // the preview ACTIONS, which legitimately write immediately.
  /**
   * Exactly ONE section renders buttons, and they are the preview actions —
   * which legitimately write immediately. Every other section renders none, so
   * a save control appearing anywhere else is caught here rather than only by
   * the source check above.
   */
  for (const sec of PAGE_SETTINGS_SECTIONS.filter((x) => x.id !== 'preview')) {
    assert.deepEqual(buttonsIn(sectionHtml(sec.id, PROMO())), [], sec.id + ' grew a button');
  }
  assert.deepEqual(buttonsIn(sectionHtml('preview', PROMO())), PREVIEW_BUTTONS);
  assert.deepEqual(buttonsIn(preview()), PREVIEW_BUTTONS);
});

test('CONTROL: a Save button WOULD be caught by the source check', () => {
  // Both directions: the probe finds the label when it is there, and the
  // rendered-button reader would notice one appearing in the settings body.
  const withSave = 'const x = <button>บันทึกการตั้งค่า</button>;';
  assert.equal(withSave.includes('บันทึกการตั้งค่า'), true);
  assert.throws(() => assert.equal(withSave.includes('บันทึกการตั้งค่า'), false));
  assert.deepEqual(buttonsIn('<button>บันทึกการตั้งค่า</button>'), ['บันทึกการตั้งค่า']);
});

// ── 4. the preview actions are called with unchanged shapes ───────────────

test('each preview action is called with exactly the arguments it was', () => {
  /**
   * The five actions are tier-gated and write to the server IMMEDIATELY —
   * `passwordHash` must never enter the client tree, which is why they do not
   * ride autosave. Commit 3 moves where this body is reached from; it must not
   * touch how any of them is invoked.
   *
   * A source claim: the handlers fire on click, and this tier renders static
   * markup with no events.
   */
  const { code } = readSource('src/components/pageBuilder/editor/PreviewDialog.jsx');
  const calls = [
    'enablePreviewLink(pageId, input)',
    'regeneratePreviewPassword(pageId)',
    'revokePreviewAccess(pageId)',
    'setPreviewExpiry(pageId, v || null)',
    'getPreviewState(pageId)',
  ];
  for (const c of calls) {
    assert.equal(code.includes(c), true,
      `the call "${c}" changed shape. These actions own the bcrypt hashing and the tier gate; `
      + 'a change here is a change to how credentials are written, not a refactor.');
  }
});

test('CONTROL: an altered call shape is caught', () => {
  // The probe must reject a near-miss, not just match anything containing the
  // function name — an extra argument is the shape of a real mistake here.
  const { code } = readSource('src/components/pageBuilder/editor/PreviewDialog.jsx');
  assert.equal(code.includes('enablePreviewLink(pageId, input, true)'), false);
  assert.equal(code.includes('revokePreviewAccess()'), false,
    'revoke is called with no page id — that would revoke nothing, or the wrong page');
});

// ── 5. the footer states SAVE STATE, it does not offer a save ─────────────

test('the body ends with a save-state line, in all three states', () => {
  /**
   * docs/page-settings-redesign.md §D's resolution, as behaviour: the footer
   * answers "is this safe yet" instead of offering a second way to make it so.
   * All three states are asserted because the useful one — dirty — is the one a
   * mistake would render as "saved".
   */
  const stateText = (over) => {
    const doc = docOf(body(PAGE(), over));
    return doc.querySelector('[data-testid="settings-save-state"]')?.textContent.replace(/\s+/g, ' ').trim();
  };
  assert.equal(stateText({ dirty: false, saving: false }), 'บันทึกแล้ว');
  assert.equal(stateText({ dirty: true, saving: false }), 'ยังไม่ได้บันทึก — ระบบจะบันทึกให้อัตโนมัติ');
  assert.equal(stateText({ dirty: true, saving: true }), 'กำลังบันทึก…');
});

test('CONTROL: the save-state reader would see a different string', () => {
  // Without this, three equal-checks against one selector could all be passing
  // on a reader that returns the same thing regardless of props.
  const a = docOf(body(PAGE(), { dirty: false, saving: false }));
  const b = docOf(body(PAGE(), { dirty: true, saving: false }));
  const read = (d) => d.querySelector('[data-testid="settings-save-state"]').textContent.trim();
  assert.notEqual(read(a), read(b));
  assert.equal(docOf('<p>x</p>').querySelector('[data-testid="settings-save-state"]'), null);
});

test('the JSON-LD section makes a statement and no status claim', () => {
  /**
   * The mockup drew an "Auto generated" badge, five type chips and a "· 5
   * Types" card. Nothing emits JSON-LD for a builder page, so each of those
   * would be a claim with no source. The section says what is true instead.
   *
   * Asserted as an ABSENCE of the claim vocabulary as well as a presence of the
   * copy, because the failure worth catching is a future round adding a chip
   * back without adding a generator.
   */
  const html = sectionHtml('jsonld', PAGE());
  assert.deepEqual(labelsIn(html), [], 'the JSON-LD section grew a control — nothing reads jsonLd yet');
  assert.deepEqual(buttonsIn(html), []);
  assert.deepEqual(groupsIn(html), ['JSON-LD']);

  const text = docOf(html).body.textContent.replace(/\s+/g, ' ').trim();
  assert.match(text, /ยังไม่มีการสร้าง JSON-LD/, 'the section no longer says that nothing is generated');
  for (const claim of ['Auto generated', 'Types', 'WebPage', 'BreadcrumbList', 'FAQPage']) {
    assert.equal(text.includes(claim), false,
      `the JSON-LD section claims "${claim}". Nothing emits JSON-LD for a builder page — see `
      + 'docs/page-settings-redesign.md §F.2 before adding a status a generator cannot back.');
  }
});

// ── 6. ROUND 28: the Figma pass, and the two ornaments it decides between ──

/**
 * The menu chrome, driven by prop rather than by whatever a static render
 * happens to produce.
 *
 * `SettingsNav` is exported for exactly this. The dot and the active state are
 * both the kind of thing that gets wired to a constant and then looks right
 * forever, and neither can be driven from `PageSettingsBody` in this tier: the
 * open section is local state, and the preview status arrives from a server
 * action through an effect that never runs under renderToStaticMarkup.
 */
const nav = (over = {}) => renderToStaticMarkup(createElement(SettingsNav, {
  section: 'general', onSelect: noop, previewStatus: null, ...over,
}));

const navDoc = (over) => docOf(nav(over));
const currentLabels = (doc) => [...doc.querySelectorAll('button[aria-current="true"]')]
  .map((b) => b.textContent.replace(/\s+/g, ' ').trim());

test('exactly one menu item is current, and it is the SELECTED one — every section', () => {
  /**
   * Driven across ALL SIX sections rather than one. A hardcoded index passes a
   * single-section check trivially; it cannot pass six, because five of the
   * six answers would be the same button. (Round 38 amended five to six — the
   * sweep is over PAGE_SETTINGS_SECTIONS and widened with it.)
   */
  for (const s of PAGE_SETTINGS_SECTIONS) {
    const doc = navDoc({ section: s.id });
    assert.deepEqual(currentLabels(doc), [s.label],
      `selecting "${s.id}" did not mark its own item current — the menu's active state is not `
      + 'reading the selected section');
  }
});

test('CONTROL: a menu hardcoded to one item WOULD fail the sweep above', () => {
  /**
   * Discrimination, not decoration. The reader is pointed at a fixed nav whose
   * "current" never moves; it must agree for one section and disagree for the
   * other four, which is precisely what a hardcoded index looks like.
   */
  const frozen = docOf(nav({ section: 'general' }));
  assert.deepEqual(currentLabels(frozen), ['ข้อมูลหน้า']);
  const others = PAGE_SETTINGS_SECTIONS.filter((s) => s.id !== 'general');
  for (const s of others) {
    assert.notDeepEqual(currentLabels(frozen), [s.label],
      'the reader returns the same answer whatever is selected, so the sweep proves nothing');
  }
  assert.equal(others.length, 5);   // round 38: five sections beside general

  // …and the reader is not simply returning every button.
  assert.deepEqual(currentLabels(docOf('<button>ก</button>')), []);
});

test('the current item is VISUALLY distinct, not only marked in the accessibility tree', () => {
  /**
   * aria-current alone is invisible. The design gives the selected item a
   * filled background and a bold blue label, so the classes must differ too —
   * asserted as "the current item's class is not any inactive item's class",
   * which is the weakest true form and cannot be satisfied by a uniform strip.
   */
  const doc = navDoc({ section: 'seo' });
  const buttons = [...doc.querySelectorAll('button')];
  const current = buttons.find((b) => b.getAttribute('aria-current') === 'true');
  const rest = buttons.filter((b) => b !== current);
  assert.equal(rest.length, 5);   // round 38: five items beside the current one
  for (const b of rest) {
    assert.notEqual(b.className, current.className,
      'the selected menu item is styled identically to the unselected ones');
  }
  // The distinction is the CI's action colour, not a hex and not a near-miss.
  assert.match(current.className, /bg-9e-action-scale-900/);
  assert.match(current.className, /text-9e-action/);
});

test('each menu item carries a glyph, and no two sections share one', () => {
  /**
   * Six icons for six sections — round 38 added ScrollText for the activity
   * trail rather than reusing History, because two items drawn with one glyph
   * read as two halves of the same thing. A shared glyph is not a crash — it is a menu
   * where two rows look like the same thing, which is the failure the section
   * picker's one-icon-per-type rule exists to prevent (rounds 9-14).
   */
  const names = PAGE_SETTINGS_SECTIONS.map((s) => s.Icon?.displayName ?? s.Icon?.name);
  assert.deepEqual(names, ['FileText', 'Search', 'CodeXml', 'Lock', 'History', 'ScrollText']);
  assert.equal(new Set(names).size, 6, 'two menu sections draw the same glyph');

  // …and they reach the markup, one per item.
  assert.equal(navDoc({}).querySelectorAll('button > svg').length, 6);
});

// ── the preview dot: real state, and only real state ──────────────────────

const dotIn = (over) => navDoc(over).querySelector('[data-testid="nav-preview-dot"]');

test('the preview dot appears for an ACTIVE link, on the preview item alone', () => {
  const doc = navDoc({ previewStatus: 'active' });
  const dot = doc.querySelector('[data-testid="nav-preview-dot"]');
  assert.notEqual(dot, null, 'an enabled preview link shows no dot');
  assert.equal(
    dot.closest('button').textContent.replace(/\s+/g, ' ').trim(), 'ลิงก์พรีวิว',
    'the dot is on some other menu item');
  assert.equal(doc.querySelectorAll('[data-testid="nav-preview-dot"]').length, 1);
  // The repo's own success colour, which is what the design's #0AA876 resolves to.
  assert.match(dot.className, /bg-9e-green-50/);
});

test('CONTROL: forcing the state off removes the dot — every non-active value', () => {
  /**
   * The half that matters. `previewSchema` carries three states and the dialog
   * can also not know yet, and the dot must be absent for all four — a dot that
   * is always there is not reporting anything, it is decoration claiming to be
   * a status.
   *
   * `null` is in the list deliberately: it means "not read yet", and an unknown
   * shown as ON is the worst of the four answers.
   */
  for (const status of ['off', 'expired', 'revoked', null]) {
    assert.equal(dotIn({ previewStatus: status }), null,
      `the dot is lit for previewStatus=${String(status)} — it is not reading the real state`);
  }
  // …and the reader can find a dot when there is one, so the nulls mean something.
  assert.notEqual(dotIn({ previewStatus: 'active' }), null);
});

test('CONTROL: a dot hardcoded ON is caught, in source and in render', () => {
  /**
   * Two independent catches, because the render check alone can be defeated by
   * a hardcode that still reads the prop name, and the source check alone
   * cannot see whether the element renders.
   *
   * The source claim: the dot's condition tests the STATUS VALUE. An
   * unconditional dot, or one gated only on the section id, would not.
   */
  const { code } = readSource('src/components/pageBuilder/editor/PageSettingsDialog.jsx');
  assert.match(code, /previewStatus === 'active'/,
    'the menu dot no longer tests the preview status against a real value');
  assert.equal(code.includes('previewStatus={true}'), false);
  assert.equal(code.includes("previewStatus = 'active'"), false,
    'the dot defaults to lit — an unread status would render as an enabled link');
  assert.match(code, /previewStatus = null/, 'the unknown state no longer defaults to "no dot"');

  // The render claim, as a discrimination: the same component, one prop apart,
  // opposite answers. If these ever agree, the test above is vacuous.
  assert.notEqual(dotIn({ previewStatus: 'active' }), null);
  assert.equal(dotIn({ previewStatus: 'off' }), null);
});

test('the JSON-LD "Auto" pill is NOT built, and the menu makes no claim about it', () => {
  /**
   * The Figma puts two ornaments in this menu — a green dot on Preview Link and
   * an "Auto" pill on JSON-LD. One has a source and one does not, and this is
   * the assertion that they are treated differently.
   *
   * Nothing emits JSON-LD for a builder page (round 27, §F.2), so the pill
   * would be a badge asserting a generator exists. It is the one design element
   * deliberately dropped this round. The section's own copy already says so in
   * words; this pins the MENU, which is where the design drew the pill.
   */
  const html = nav({ previewStatus: 'active' });
  for (const claim of ['Auto', 'auto', 'Types']) {
    assert.equal(html.includes(`>${claim}<`), false,
      `the menu renders an "${claim}" badge on a section nothing generates`);
  }
  const jsonld = docOf(html).querySelectorAll('button')[2];
  assert.equal(jsonld.textContent.replace(/\s+/g, ' ').trim(), 'JSON-LD',
    'the JSON-LD menu item carries something besides its own label');
  assert.equal(jsonld.querySelectorAll('span').length, 1,
    'the JSON-LD item grew a second span — the pill is the shape that would arrive as one');

  // CONTROL: the preview item, one along, DOES carry its extra span. So the
  // count above is a real difference between the two sections, not a nav that
  // can never hold a badge.
  const preview = docOf(html).querySelectorAll('button')[3];
  assert.equal(preview.querySelectorAll('span').length, 2);
});

// ── ROUND 38: the activity trail ──────────────────────────────────────────
//
// The audit log's surface. Everything here is about what it says and, more,
// about what it deliberately does NOT — the stored rows support one question
// and three neighbouring ones look answerable and are not.

const trail = (over = {}) => renderToStaticMarkup(createElement(ActivityTrail, {
  pageId: 'p1', open: true, ...over,
}));
const trailText = (html) => docOf(html).body.textContent.replace(/\s+/g, ' ').trim();

const AUDIT_ROWS = [
  { _id: 'a3', action: 'publish',      actor: { id: 'u1', name: 'Yanisa P.' },  createdAt: '2026-08-28T01:32:21.623Z' },
  { _id: 'a2', action: 'draft.backup', actor: { id: 'u2', name: 'Pirasak S.' }, createdAt: '2026-08-27T02:20:49.130Z' },
  { _id: 'a1', action: 'draft.save',   actor: { id: '',   name: '' },           createdAt: '2026-08-27T02:19:34.396Z' },
];

test('the activity section renders one row per recorded action, newest first', () => {
  const rows = [...docOf(trail({ initialRows: AUDIT_ROWS }))
    .querySelectorAll('[data-testid="activity-row"]')]
    .map((n) => n.textContent.replace(/\s+/g, ' ').trim());
  assert.equal(rows.length, 3);
  // The order is the READ's order, reproduced — this list does not re-sort.
  assert.match(rows[0], /^เผยแพร่ โดย Yanisa P\. เมื่อ /);
  assert.match(rows[1], /^สำรองฉบับร่าง โดย Pirasak S\. เมื่อ /);
  // An anonymous actor drops the clause rather than inventing a name.
  assert.match(rows[2], /^บันทึกฉบับร่าง เมื่อ /);
  assert.equal(rows[2].includes('โดย'), false, 'an anonymous row invented an actor');
});

test('the sentence comes from auditRowLine, not from a second formatting here', () => {
  const { code } = readSource('src/components/pageBuilder/editor/ActivityTrail.jsx');
  assert.match(code, /auditRowLine\(/, 'the component no longer calls the one composer');
  for (const piece of ['โดย ', 'เมื่อ ']) {
    assert.equal(code.includes(`'${piece}`) || code.includes(`\`${piece}`), false,
      `ActivityTrail builds the row sentence inline with "${piece}". auditTrail.js owns that `
      + 'composition so the pure tests can assert it by value.');
  }
});

test('the empty page says so, and the note says what the trail does not record', () => {
  assert.equal(trailText(trail({ initialRows: [] })), AUDIT_TRAIL_EMPTY);
  // The note rides WITH the list, not instead of it — an author reading a run of
  // draft-save rows would otherwise take the trail for a change log.
  assert.ok(trailText(trail({ initialRows: AUDIT_ROWS })).includes(AUDIT_TRAIL_NOTE),
    'the list no longer says that it does not record what changed');
  assert.equal(trailText(trail({ initialRows: [] })).includes(AUDIT_TRAIL_NOTE), false,
    'the note is shown with no list — it explains a list that is not there');
});

test('the load-more control appears only when the read offered a cursor', () => {
  const withCursor = docOf(trail({ initialRows: AUDIT_ROWS, initialCursor: '2026-08-27T02:19:34.396Z|a1' }));
  const more = withCursor.querySelector('[data-testid="activity-more"]');
  assert.notEqual(more, null, 'a paginated trail offered no way to reach the older rows');
  assert.equal(more.textContent.replace(/\s+/g, ' ').trim(), 'ดูรายการก่อนหน้า');
  // CONTROL: no cursor, no control — otherwise it would offer a page that is not there.
  assert.equal(docOf(trail({ initialRows: AUDIT_ROWS })).querySelector('[data-testid="activity-more"]'), null);
});

/**
 * The three surfaces this round DECLINED, asserted as absences in the rendered
 * output — round 27's JSON-LD claim-vocabulary shape, for the same reason: the
 * failure worth catching is a later round adding one back without adding the
 * data behind it.
 */
const DECLINED_IN_MARKUP = Object.freeze([
  ['a version number beside a publish row',
    ['เวอร์ชัน', 'version', 'v1', '#1'],
    'no audit row carries a versionNumber or a version id — 1 stored publish row against 3 '
    + 'stored versions. PageVersion.actor is the authority (round 36)'],
  ['what changed',
    ['hadDraft', 'hasDraft', 'เปลี่ยนจาก', '->'],
    'before/after are presence flags — 18 of 20 draft.save rows are unchanged on both halves '
    + '— and the read does not ship them'],
  ['the last-edited-by sentence',
    ['แก้ไขล่าสุด'],
    'draft.savedBy answers it on the live document (round 34) and is state rather than an '
    + 'inference over the newest row of a class'],
]);

test('the trail claims none of the three declined surfaces', () => {
  const text = trailText(trail({ initialRows: AUDIT_ROWS, initialCursor: 'c|1' }));
  for (const [what, vocabulary, evidence] of DECLINED_IN_MARKUP) {
    for (const claim of vocabulary) {
      assert.equal(text.includes(claim), false,
        `the activity trail renders "${claim}", which belongs to the declined surface `
        + `"${what}". It was declined because ${evidence}.`);
    }
  }
});

test('CONTROL: the same reader DOES catch each declined claim when planted', () => {
  // Without this, the sweep above passes for a reader that sees nothing. One
  // planted claim per declined surface, so no branch of the list is untested.
  for (const [, vocabulary] of DECLINED_IN_MARKUP) {
    const planted = trailText(`<p>${vocabulary[0]}</p>`);
    assert.equal(planted.includes(vocabulary[0]), true, 'the reader cannot see planted markup');
  }
  // …and it is reading the rendered text, not an empty string.
  assert.ok(trailText(trail({ initialRows: AUDIT_ROWS })).includes('เผยแพร่'));
});

test('the trail reads the AUDIT log and no second source', () => {
  /**
   * J and the single-source rule together. `getPageVersions` answers a
   * neighbouring question in the section one menu item up, and a component that
   * called both would be two answers to "what happened to this page" in one
   * dialog — the second-authority shape rounds 21-25 spent four rounds removing.
   */
  const { withImports } = readSource('src/components/pageBuilder/editor/ActivityTrail.jsx');
  assert.match(withImports, /getPageAuditLog/, 'the trail no longer reads the audit log');
  for (const other of ['getPageVersions', 'getPageVersionSnapshot', 'savedBy', 'updatedBy']) {
    assert.equal(withImports.includes(other), false,
      `ActivityTrail reaches for '${other}'. The audit log is its only source; every other `
      + 'fact in this dialog has an owner already.');
  }
});

test('CONTROL: the same check catches the trail pointed at the other source', () => {
  // Without this, the assertion above passes for a check that matches nothing.
  const planted = "import { getPageVersions } from '@/lib/actions/pageBuilder';\n";
  const caught = ['getPageVersions', 'getPageVersionSnapshot'].filter((n) => planted.includes(n));
  assert.deepEqual(caught, ['getPageVersions']);
});

test('the seed props are TEST seeds and production passes neither', () => {
  // Same rule, and the same reason, as VersionHistory's: the effect never runs
  // under renderToStaticMarkup, so the list markup is only reachable by seeding
  // state — and a seed that leaked into production would render a fixture.
  const { code } = readSource('src/components/pageBuilder/editor/PageSettingsDialog.jsx');
  assert.equal(code.includes('initialRows'), false, 'ActivitySection hands ActivityTrail a seed');
  assert.equal(code.includes('initialCursor'), false, 'ActivitySection hands ActivityTrail a cursor');
  // …and unseeded, the component is in its loading state rather than "empty".
  assert.equal(trailText(trail()), 'กำลังโหลด…');
  assert.notEqual(trailText(trail()), AUDIT_TRAIL_EMPTY,
    'an unloaded trail claims the page has no recorded actions');
});

test('an unsaved page is told why there is nothing, not shown an empty trail', () => {
  assert.equal(trailText(trail({ pageId: '' })),
    'ยังไม่ได้บันทึกหน้านี้ — ยังไม่มีการดำเนินการที่บันทึกไว้');
});

test('the activity section adds NO save or status vocabulary', () => {
  /**
   * Round 27's rule, respected by rounds 34 and 36. The section is a list and a
   * note; it offers no control that writes and makes no claim about saving.
   */
  const html = sectionHtml('activity', PAGE());
  assert.deepEqual(labelsIn(html), [], 'the activity section grew a field');
  assert.deepEqual(buttonsIn(html), [], 'the activity section grew a control');
  assert.deepEqual(groupsIn(html), ['ประวัติการดำเนินการ']);
  for (const claim of ['บันทึกแล้ว', 'ยังไม่ได้บันทึก', 'กำลังบันทึก']) {
    assert.equal(trailText(html).includes(claim), false,
      `the activity section says "${claim}" — that is the save-state line's vocabulary, and `
      + 'it belongs to the dialog footer, not to a read-only list');
  }
});
