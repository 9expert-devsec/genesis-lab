import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleHistoryDialog } from '@/app/admin/articles/_components/ArticleHistoryDialog';
import { readSource } from '../sourceScan.mjs';

/**
 * ประวัติการแก้ไข lives in the article editor's toolbar, and in ONE place.
 *
 * ── WHAT THIS FILE IS DEFENDING, AND WHAT IT LOOKED LIKE WHEN IT BROKE ──────
 * The panel used to be `<RecordHistory>` wrapped in a `mx-auto mt-6 max-w-7xl`
 * div, mounted as a SIBLING AFTER `<ArticleForm>` in the edit page. The form
 * declares `h-[100dvh]`, so that block began exactly at the bottom of the
 * viewport: measured in Chrome at 1920x945, with the shell occupying 0..945,
 * the block's top was 969 and its heading's box 982..1002.
 *
 * It was reachable only by scrolling the admin layout's `<main>`, and then
 * `main` became `overflow-y-clip` on every full-height route — it had to,
 * because while it was a scroll container something OTHER than the user was
 * scrolling it (see adminFullHeightRoutes). `main.scrollTop` is now pinned at
 * 0, so the panel went from awkward to UNREACHABLE: `main.scrollTop = 9999`
 * measured 0.
 *
 * The fix is the one the courses editor already made for the same problem —
 * `CourseForm` puts ประวัติการแก้ไข in a tab INSIDE its own shell rather than
 * below it. Here it is a toolbar button and a dialog.
 *
 * ── WHY MOST OF THIS IS A SOURCE SCAN AND NOT A RENDER ─────────────────────
 * Two independent reasons, and they point at different halves:
 *
 *   · THE DIALOG BODY is inside a Radix `Dialog.Portal`, which renders ZERO
 *     BYTES under renderToStaticMarkup — measured, and the reason
 *     SettingsShell/PageSettingsDialog are split the way they are. The first
 *     test below asserts that emptiness rather than working around it, so the
 *     claim is on the record instead of being folded into a comment.
 *   · THE TOOLBAR ORDER lives in `ArticleForm`, which builds a Tiptap editor
 *     with eighteen extensions in a `useEditor` hook. Rendering it to assert
 *     which of two buttons comes first would be paying for the whole editor to
 *     learn a fact that is one line of JSX.
 *
 * The TRIGGER, though, is NOT in the portal — it is a plain button that Radix
 * renders in place — so everything about the button itself is a real render.
 */

const dialog = (children) =>
  renderToStaticMarkup(createElement(ArticleHistoryDialog, null, children));

const FORM = readSource('src/app/admin/articles/_components/ArticleForm.jsx');
const EDIT = readSource('src/app/admin/articles/[id]/edit/page.jsx');
const NEW = readSource('src/app/admin/articles/new/page.jsx');
const DIALOG = readSource('src/app/admin/articles/_components/ArticleHistoryDialog.jsx');

// ── the button itself, rendered ─────────────────────────────────────────────

test('the trigger renders, and the dialog body does not (it is portal-bound)', () => {
  const html = dialog(createElement('p', null, 'PANEL-SENTINEL'));

  assert.match(html, /article-history-trigger/, 'the trigger button did not render');
  assert.match(html, /ประวัติการแก้ไข/, 'the trigger did not carry its Thai label');
  // THE CONTROL FOR EVERY SOURCE SCAN BELOW. If this sentinel ever appears,
  // the portal has started rendering in this tier and the dialog's contents
  // become assertable — at which point these scans should be upgraded rather
  // than left as the weaker check.
  assert.doesNotMatch(
    html, /PANEL-SENTINEL/,
    'the portal now renders in this tier — assert the dialog body directly instead of scanning source',
  );
});

test('the trigger announces that it opens a dialog', () => {
  const html = dialog(null);
  assert.match(html, /aria-haspopup="dialog"/, 'no aria-haspopup="dialog" on the trigger');
  // Radix drives these two itself, and they are the pair a screen reader uses
  // to say "collapsed". Asserted so a refactor to a bare button cannot quietly
  // drop them.
  assert.match(html, /aria-expanded="false"/, 'the closed trigger did not report aria-expanded');
  assert.match(html, /aria-controls="/, 'the trigger is not wired to the dialog it opens');
});

test('the trigger wears the toolbar button styles, not styles of its own', () => {
  const html = dialog(null);
  // The exact classNames `Preview` carries in ArticleForm's header bar. Two
  // buttons stand side by side there; if they ever differ it must be because
  // someone edited this list on purpose.
  for (const cls of [
    'inline-flex', 'items-center', 'gap-1.5', 'rounded-9e-md',
    'border-[var(--surface-border)]', 'px-3', 'py-1.5', 'text-sm',
    'font-medium', 'text-9e-navy', 'hover:bg-9e-ice',
    'dark:text-white', 'dark:hover:bg-[#0D1B2A]',
  ]) {
    assert.ok(html.includes(cls), `the trigger is missing the toolbar class ${cls}`);
  }
  // NO focus-visible class, and that is the requirement rather than an
  // omission: globals.css gives `*:focus-visible` a ring-2 ring-9e-brand
  // ring-offset-2, so every button in this bar already has the brand ring. A
  // ring here would be a second, slightly different one.
  assert.doesNotMatch(
    html, /focus-visible:/,
    'the trigger hand-rolls a focus ring; the global *:focus-visible rule already gives it one',
  );
});

// ── Escape and focus-return are STRUCTURAL ─────────────────────────────────

test('the dialog gets Escape and focus-return from Radix rather than by hand', () => {
  /**
   * WHY THIS IS ASSERTED AS A SHAPE AND NOT AS BEHAVIOUR. "Escape closes" and
   * "focus returns to the button" were verified in Chrome (Escape closed the
   * dialog; `document.activeElement` came back to the trigger and its
   * aria-expanded to "false"). Neither is reachable in this tier — the portal
   * renders nothing and there is no event loop.
   *
   * What IS checkable is the only thing that makes them true: the button is a
   * `Dialog.Trigger` on an UNCONTROLLED `Dialog.Root`. Radix knows which
   * element the trigger is and restores focus to it; a `useState` + a bare
   * button would need `onCloseAutoFocus` and a ref to do the same job less
   * reliably. So this guard names the construction, and goes red if someone
   * replaces it with hand-rolled state.
   */
  assert.match(DIALOG.code, /Dialog\.Trigger/, 'the button is not a Dialog.Trigger');
  assert.match(DIALOG.code, /Dialog\.Root/, 'there is no Dialog.Root');
  assert.doesNotMatch(
    DIALOG.code, /useState|onKeyDown|Escape/,
    'the dialog hand-rolls open state or key handling instead of letting Radix own it',
  );
  // A Close control, so the dialog is dismissible by pointer too.
  assert.match(DIALOG.code, /Dialog\.Close/, 'the dialog has no close control');
});

// ── the toolbar order ───────────────────────────────────────────────────────

/**
 * The text between the history trigger and Preview's onClick.
 *
 * Sliced from AFTER the `<ArticleHistoryDialog>` tag, not from it: starting at
 * the tag counts the trigger's own opener and the expected total stops being
 * readable as "one element stands here, and it is Preview".
 */
const TRIGGER_TAG = '<ArticleHistoryDialog>';
function gapOf(code) {
  const h = code.indexOf(TRIGGER_TAG);
  const p = code.indexOf('setShowPreview(true)');
  return code.slice(h + TRIGGER_TAG.length, p);
}
/** How many elements the gap OPENS. One is Preview's own `<button`. */
const openersIn = (gap) => (gap.match(/<[A-Za-z][\w.]*/g) ?? []).length;

test('the history trigger sits IMMEDIATELY BEFORE Preview in the toolbar', () => {
  const hist = FORM.code.indexOf('<ArticleHistoryDialog>');
  const prev = FORM.code.indexOf('setShowPreview(true)');
  assert.ok(hist > -1, 'ArticleForm does not mount ArticleHistoryDialog');
  assert.ok(prev > -1, 'ArticleForm no longer has a Preview button to be placed before');
  assert.ok(hist < prev, 'the history trigger is rendered AFTER Preview');

  /**
   * IMMEDIATELY before, which is the part a plain ordering check would miss.
   * The gap may open exactly ONE element — Preview's own `<button`. Anything
   * else means a third control has been inserted between the two.
   */
  const gap = gapOf(FORM.code);
  assert.equal(
    openersIn(gap), 1,
    `something stands between the history trigger and Preview — openers in the gap: ${JSON.stringify(gap.match(/<[A-Za-z][\w.]*/g))}`,
  );
});

test('CONTROL: a third button inserted between the two is noticed', () => {
  /**
   * Without this the assertion above could be satisfied by a gap of any size
   * and the word "immediately" would be decoration. Splice a button into the
   * gap and the opener count must stop being 1.
   */
  const tampered = FORM.code.replace(
    '<ArticleHistoryDialog>',
    '<ArticleHistoryDialog>\n<button type="button">แทรก</button>',
  );
  assert.notEqual(
    openersIn(gapOf(tampered)), 1,
    'CONTROL FAILED: a button spliced into the gap was not noticed, so the ordering guard cannot see a third control arriving',
  );
});

// ── exactly one place ───────────────────────────────────────────────────────

test('the old below-the-fold history block is gone from the edit page', () => {
  // THE BLOCK, by the wrapper that positioned it. `code` strips comments, so
  // the note in that file describing what used to be here cannot satisfy this.
  assert.doesNotMatch(
    EDIT.code, /mx-auto mt-6 max-w-7xl/,
    'the edit page still wraps the history panel in the below-the-fold div',
  );
  // And the page no longer renders a sibling after the form at all.
  assert.doesNotMatch(
    EDIT.code, /<>/,
    'the edit page still renders a fragment, so something stands beside ArticleForm',
  );
});

test('CONTROL: the below-the-fold wrapper is visible to the scan when present', () => {
  assert.match(
    `${EDIT.code}\n<div className="mx-auto mt-6 max-w-7xl" />`,
    /mx-auto mt-6 max-w-7xl/,
    'CONTROL FAILED: the scan cannot see the wrapper even when it is present',
  );
});

test('the edit page hands the panel in as a slot, still rendered server-side', () => {
  assert.match(EDIT.code, /historySlot=\{/, 'the edit page does not pass historySlot');
  assert.match(EDIT.code, /<RecordHistory/, 'the edit page no longer renders RecordHistory');
  // `menu` and `entity` stay LITERALS written into this screen's source — never
  // derived from the URL or from client state. The panel re-checks canAccess
  // itself, and this is the half that keeps it honest.
  assert.match(EDIT.code, /menu="articles"/, 'the menu is no longer a literal in the page source');
  assert.match(EDIT.code, /entity="article"/, 'the entity is no longer a literal in the page source');
  // `defaultOpen` because the panel now has a surface of its own: collapsed
  // inside a dialog the admin opened to read it, the accordion would ask a
  // question they just answered.
  assert.match(EDIT.code, /defaultOpen/, 'the panel opens collapsed inside its own dialog');
});

test('ArticleForm renders no trigger when it was handed no panel', () => {
  /**
   * WHICH IS WHAT MAKES /new CORRECT WITHOUT A SPECIAL CASE. A draft that does
   * not exist yet has no history, so the screen with no record to pass gets no
   * control promising one — asserted in Chrome as 0 occurrences of
   * `article-history-trigger` on /admin/articles/new against 1 on the edit
   * screen.
   */
  assert.match(
    FORM.code, /\{historySlot && <ArticleHistoryDialog>/,
    'the trigger is not guarded on the slot being present',
  );
  assert.match(FORM.code, /historySlot = null/, 'historySlot does not default to null');
  assert.doesNotMatch(
    NEW.code, /historySlot/,
    'the /new screen passes a historySlot, which would promise history a draft has none of',
  );
});
