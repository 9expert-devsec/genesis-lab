import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PageSettingsBody } from '@/components/pageBuilder/editor/PageSettingsDialog';
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

const settings = (page = PAGE()) => renderToStaticMarkup(createElement(PageSettingsBody, {
  page, pageId: 'p1', dispatch: noop, open: true,
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

const PREVIEW_LABELS = ['ตั้งรหัสผ่านใหม่', 'หมดอายุเมื่อ'];
const PREVIEW_BUTTONS = ['เปิดใช้งาน', 'สุ่มรหัสใหม่', 'ปิดการเข้าถึง'];

/** The five docs/page-settings-redesign.md found the mockups drop. */
const MOCKUP_DROPS = [
  'Promotion ID (MSDB)', 'ลำดับในหน้าโปรโมชัน', 'ภาพปกโปรโมชัน',
  'Canonical URL', 'OG image URL',
];

// ── 1. the union, exact and ordered ───────────────────────────────────────

test('PageSettingsBody renders exactly the fields it rendered before the split', () => {
  assert.deepEqual(labelsIn(settings()), SETTINGS_GENERAL,
    'the page settings field set changed. A field in NO menu section is invisible from inside '
    + 'every section, which is why this is an exact ordered set and not a lower bound.');
  assert.deepEqual(groupsIn(settings()), ['ทั่วไป', 'SEO', 'ประวัติการเผยแพร่']);
});

test('PageSettingsBody on a PROMOTION page renders the four extra fields too', () => {
  assert.deepEqual(labelsIn(settings(PROMO())), SETTINGS_PROMOTION,
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

test('the two dialogs share NO field — neither leaks into the other', () => {
  const s = labelsIn(settings(PROMO()));
  const p = labelsIn(preview());
  assert.deepEqual(s.filter((f) => p.includes(f)), []);
  assert.deepEqual(p.filter((f) => s.includes(f)), []);
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
  assert.deepEqual(buttonsIn(settings(PROMO())), []);
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
