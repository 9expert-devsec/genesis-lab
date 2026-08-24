import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { EditorTopBar } from '@/components/pageBuilder/editor/EditorTopBar';
import { CustomPagesAdminClient } from '@/app/admin/pages/_components/CustomPagesAdminClient';
import { PageBuilderView } from '@/components/pageBuilder/PageBuilderView';
import { composeWorkingView } from '@/lib/pageBuilder/draftState';

/**
 * The draft/published split, RENDERED.
 *
 * The pure tier (test/pure/editorStatus) proves the classification. It cannot
 * prove a surface consumes it — a top bar that kept its own `page.draft`
 * check, or that keyed the chip off `contentDirty`, passes every pure case.
 * That is what this tier is for, and it is the same split scheduleStatus uses.
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and one leaked React root breaks unrelated files.
 *
 * ── WHY ELEMENT BOUNDARIES, NOT SUBSTRINGS ─────────────────────────────────
 * Thai negates by PREFIX, and this round's labels overlap by design:
 * 'ฉบับร่าง' (the status badge) is a substring of 'มีฉบับร่างที่ยังไม่เผยแพร่'
 * (the chip) and of 'ทิ้งฉบับร่าง' (the button). A bare markup.includes() would
 * report the chip present on any draft-status page. Every assertion below reads
 * one element's exact textContent.
 */

const LIVE = {
  slug: 'live-slug', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [{ id: 's1', type: 'heading', sortOrder: 0 }],
  seo: {}, jsonLd: {}, slugHistory: [],
};

const DRAFT = { title: 'Drafted Title', sections: [{ id: 'd1', type: 'rich_text', sortOrder: 0 }] };
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

function domOf(markup) {
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

function topBar(page) {
  return domOf(renderToStaticMarkup(
    createElement(EditorProvider, { page, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(EditorTopBar, {
        onSave: () => {}, onOpenSettings: () => {},
        onOpenPreview: () => {}, onPublish: () => {}, onDiscard: () => {},
      }))
  ));
}

const text = (el) => el?.textContent?.trim() ?? null;

// ── the pending-draft chip ──────────────────────────────────────────────────

test('the chip renders, with its exact text, when the stored page has a draft', () => {
  const chip = topBar({ ...LIVE, draft: DRAFT }).querySelector('[data-testid="pending-draft-chip"]');
  assert.ok(chip, 'no chip rendered for a page with a stored draft');
  assert.equal(text(chip), 'มีฉบับร่างที่ยังไม่เผยแพร่');
});

test('no chip when the stored page has no draft', () => {
  for (const page of [{ ...LIVE, draft: null }, { ...LIVE }, { ...LIVE, draft: {} }]) {
    assert.equal(
      topBar(page).querySelector('[data-testid="pending-draft-chip"]'), null,
      'a chip rendered for a page with nothing pending'
    );
  }
});

test('CONTROL: the status badge is a SEPARATE element from the chip', () => {
  // 'ฉบับร่าง' is a substring of the chip's text, so a draft-status page would
  // make a naive substring check report a chip that is not there.
  const doc = topBar({ ...LIVE, status: 'draft', draft: null });
  const chip = doc.querySelector('[data-testid="pending-draft-chip"]');
  assert.equal(chip, null, 'the status badge was mistaken for the pending-draft chip');
  const badges = [...doc.querySelectorAll('span')].map(text);
  assert.ok(badges.includes('ฉบับร่าง'), 'the status badge itself is missing');
  assert.equal(badges.includes('มีฉบับร่างที่ยังไม่เผยแพร่'), false);
});

// ── the discard button ──────────────────────────────────────────────────────

test('the discard button appears only with a pending draft, with its exact label', () => {
  const withDraft = topBar({ ...LIVE, draft: DRAFT }).querySelector('[data-testid="discard-draft-button"]');
  assert.ok(withDraft, 'no discard button for a page with a pending draft');
  assert.equal(text(withDraft), 'ทิ้งฉบับร่าง');
  assert.equal(withDraft.hasAttribute('disabled'), false, 'the button is disabled with nothing wrong');

  assert.equal(
    topBar({ ...LIVE, draft: null }).querySelector('[data-testid="discard-draft-button"]'), null,
    'a discard button rendered with nothing to discard'
  );
});

test('CONTROL: the save button label is not mistaken for the discard button', () => {
  // 'บันทึกฉบับร่าง' and 'ทิ้งฉบับร่าง' share a stem.
  const doc = topBar({ ...LIVE, draft: null });
  const labels = [...doc.querySelectorAll('button')].map(text);
  assert.ok(labels.includes('บันทึกฉบับร่าง'), 'the save button is missing');
  assert.equal(labels.includes('ทิ้งฉบับร่าง'), false);
});

// ── the status line ─────────────────────────────────────────────────────────

test('the top bar renders the status line the pure module decides', () => {
  // A fresh editor has saved nothing, so the line is empty — this pins that the
  // bar calls statusLine rather than keeping its own savedAgo().
  const doc = topBar({ ...LIVE, draft: DRAFT });
  const spans = [...doc.querySelectorAll('span')].map(text);
  assert.equal(spans.includes('บันทึกอัตโนมัติเมื่อสักครู่'), false, 'the retired copy is still rendering');
  assert.equal(spans.some((s) => s === 'ยังไม่ได้บันทึก'), false, 'a fresh editor reported unsaved work');
});

// ── PublishDialog: NOT here, and why ───────────────────────────────────────
//
// Its content is inside a Radix `Dialog.Portal`, which renders NOTHING under
// renderToStaticMarkup — a portal has no server output. Asserting on the
// markup would have compared two empty lists and passed while proving
// nothing. The claim moves to test/fs/draftVisibilityWiring, as a source scan
// with discrimination controls, which is the same compromise (and the same
// stated reason) as test/fs/pageBuilderDeleteConfirm.

// ── the admin list marker ───────────────────────────────────────────────────

function adminList(rows) {
  return domOf(renderToStaticMarkup(
    createElement(CustomPagesAdminClient, { pages: rows, canCreateAdvanced: true })
  ));
}

test('the list marks builder rows that hold a pending draft', () => {
  const doc = adminList([
    { _id: 'b1', _type: 'builder', title: 'With', slug: 'with', status: 'published', draft: { title: 'x' }, updatedAt: null },
    { _id: 'b2', _type: 'builder', title: 'Without', slug: 'without', status: 'published', draft: null, updatedAt: null },
  ]);
  const marks = [...doc.querySelectorAll('[data-testid="pending-draft-dot"]')];
  assert.equal(marks.length, 1, 'the marker did not appear exactly once');
  assert.equal(text(marks[0]), 'ฉบับร่างรอเผยแพร่');
  // …and it is inside the row that owns it.
  const rowText = marks[0].closest('tr')?.textContent ?? '';
  assert.ok(rowText.includes('With'), 'the marker landed on the wrong row');
});

test('CONTROL: an advanced_html row is never marked, even carrying a draft field', () => {
  // Gated on `isBuilder`, not on truthiness of `p.draft` — so a field-name
  // collision on a CustomPage row cannot light this up.
  const doc = adminList([
    { _id: 'a1', _type: 'advanced_html', title: 'HTML', slug: 'html', status: 'published', draft: { title: 'x' }, updatedAt: null },
  ]);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="pending-draft-dot"]')], []);
});

// ── the preview route's rendering source ────────────────────────────────────

const MARKER = 'PREVIEW_SHOWS_DRAFT_R5';

test('the preview renders the DRAFT content — the one place showing it is correct', async () => {
  // This deliberately INVERTS round 2's leak tests. Those assert the marker is
  // ABSENT from the four public reads; here its presence is the whole feature,
  // because /preview/[slug] exists to show what an author is working on.
  const page = {
    ...LIVE,
    sections: [{ id: 'live', type: 'heading', sortOrder: 0, content: { text: 'LIVE ONLY' } }],
    draft: {
      title: 'Drafted',
      sections: [{ id: 'd1', type: 'heading', sortOrder: 0, content: { text: MARKER } }],
    },
  };
  const markup = renderToStaticMarkup(await PageBuilderView({ page: composeWorkingView(page) }));
  assert.ok(markup.includes(MARKER), 'the preview showed the published content, not the draft');
  assert.equal(markup.includes('LIVE ONLY'), false, 'the preview showed the live content too');
});

test('CONTROL: the same page rendered RAW shows the live content instead', () => {
  // Proves the case above is composeWorkingView doing the work — this is what
  // the route rendered before round 5, and it is the defect.
  const page = {
    ...LIVE,
    sections: [{ id: 'live', type: 'heading', sortOrder: 0, content: { text: 'LIVE ONLY' } }],
    draft: {
      title: 'Drafted',
      sections: [{ id: 'd1', type: 'heading', sortOrder: 0, content: { text: MARKER } }],
    },
  };
  assert.deepEqual(page.sections[0].content.text, 'LIVE ONLY');
  assert.notDeepEqual(composeWorkingView(page).sections, page.sections);
});

test('a page with no draft previews its live content unchanged', async () => {
  const page = {
    ...LIVE,
    sections: [{ id: 'live', type: 'heading', sortOrder: 0, content: { text: 'LIVE ONLY' } }],
    draft: null,
  };
  const markup = renderToStaticMarkup(await PageBuilderView({ page: composeWorkingView(page) }));
  assert.ok(markup.includes('LIVE ONLY'));
});
