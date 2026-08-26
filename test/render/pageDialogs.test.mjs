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

test('the menu declares exactly five sections, and the body renders one per item', () => {
  assert.deepEqual(PAGE_SETTINGS_SECTIONS.map((s) => s.id), ['general', 'seo', 'jsonld', 'preview', 'history']);
  assert.deepEqual(PAGE_SETTINGS_SECTIONS.map((s) => s.label),
    ['ข้อมูลหน้า', 'SEO', 'JSON-LD', 'ลิงก์พรีวิว', 'ประวัติการเผยแพร่']);

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
  for (const id of ['general', 'seo', 'jsonld', 'history']) {
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
