'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useEditor } from './EditorProvider';
import { useEditorSave } from './useEditorSave';
import { useLeaveGuard } from './useLeaveGuard';
import { LeaveConfirmDialog } from './LeaveConfirmDialog';
import { EditorTopBar } from './EditorTopBar';
import { StructurePanel } from './StructurePanel';
import { CanvasPanel } from './CanvasPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { SettingsPanel } from './SettingsPanel';
import { PageSettingsDialog } from './PageSettingsDialog';
import { PublishDialog } from './PublishDialog';

/**
 * Three-panel editor layout: Structure (left) / Canvas (centre) / Settings
 * (right), under the top bar. The panels arrive in items 2–5; this is their
 * frame, the save wiring, and the two things that must not be an afterthought:
 * the unsaved-changes guard and the conflict banner.
 */

/**
 * Terminal conflict banner. Persistent by design: the save was rejected
 * because someone else's edit is already on the server, so retrying would
 * either fail again or clobber them. Autosave has stopped. The message tells
 * the author what to DO — their work is still in this tab, reloading discards
 * it — rather than diagnosing what went wrong.
 */
function ConflictBanner({ message }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-bold">หยุดบันทึกอัตโนมัติแล้ว</p>
        <p className="mt-0.5">{message}</p>
      </div>
    </div>
  );
}

/**
 * `hint` is an optional one-liner sitting with the heading.
 *
 * It belongs HERE rather than at the top of the panel's own body because this
 * is where the heading is — StructurePanel renders no heading of its own, so a
 * hint added inside it would be a second, competing header line under the real
 * one. Passing it in keeps one header block per panel.
 *
 * ── `split`: THE CHILD OWNS EVERYTHING BELOW THE HEADING (round 31) ────────
 * WITHOUT it — the settings panel, unchanged — the body is one padded block
 * and the SECTION is what scrolls, heading and all.
 *
 * WITH it the children are handed straight into the section's flex column, so
 * a panel that wants a pinned footer can put the overflow on a band of its own
 * and leave this heading standing outside it. The heading does not move,
 * because nothing it sits in scrolls any more.
 *
 * WHY OPT-IN RATHER THAN THE SHAPE FOR BOTH. Both side panels render through
 * here and only one of them is being split this round. Making the three-band
 * shape unconditional would move the settings panel's scroller one level in as
 * a side effect — and WHERE THE SCROLLER SITS is precisely what round 13 had
 * to measure, and fix, and then pin with a test. That is not a thing to change
 * in a panel nobody looked at.
 *
 * The caller supplies the column: `split` needs a `flex flex-col` section to
 * be handed into, which is why the structure panel's className says so while
 * the settings panel's still says `overflow-y-auto`.
 */
export function Panel({ title, hint, split, children, className }) {
  return (
    <section className={className}>
      {/* The design's EYEBROW: 10px, bold, uppercase, 1.3px of tracking.
          10px has no step on the shared type scale — round 17's ruling, which
          this round does not reopen — so it stays at text-xs, the smallest.
          The tracking DOES land: tracking-widest is 0.1em, which at 12px is
          1.2px against the drawn 1.3. */}
      <div className="border-b border-[var(--surface-border)] px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">{hint}</p>}
      </div>
      {split ? children : <div className="p-3">{children}</div>}
    </section>
  );
}

export function EditorShell() {
  const { dirty, saving, conflict, error } = useEditor();
  const { saveNow, publish, discard } = useEditorSave();
  const [dialog, setDialog] = useState(null); // 'settings' | 'publish' | null
  /**
   * Which settings section to open at. The preview link used to be its own
   * dialog; it is a section now, so the top bar's preview button opens the
   * settings dialog pointed at it rather than a second surface. Both
   * triggers survive — only their destination merged.
   */
  const [settingsSection, setSettingsSection] = useState('general');
  const openSettings = (section) => { setSettingsSection(section); setDialog('settings'); };

  /**
   * ── Unsaved-changes guard: THREE exits, ONE decision ──────────────────────
   * This was `beforeunload` alone, gated on `!dirty && !conflict` written out
   * right here. That covers tab close and reload and NOTHING else, so the
   * BROWSER BACK BUTTON left the editor silently — confirmed, not theorised.
   * App Router soft navigation fires no beforeunload, so the sidebar was open
   * the same way.
   *
   * What that cost: autosave is a 5s idle debounce, and it NEVER runs for an
   * unsaved /builder/new page (deliberately — an abandoned new page must leave
   * nothing behind), so on a new page Back destroyed the whole draft with no
   * backstop. A conflicted session is worse still: autosave has stopped for
   * good, so that tree exists only here.
   *
   * The condition now lives in lib/pageBuilder/leaveGuard.js and the three
   * listeners live in useLeaveGuard.js — one rule, three exits, so the next
   * state that should block leaving cannot be added to only one of them. The
   * old inline `!dirty && !conflict` is gone rather than left beside the new
   * one; two guards on one rule is what this change exists to remove.
   *
   * `saving` joins the inputs here (see the module for why it changes no
   * outcome today and is kept anyway).
   */
  const { reason, pending, confirmLeave, cancelLeave } = useLeaveGuard({ dirty, saving, conflict });

  // ── WHERE THE HEIGHT COMES FROM ──────────────────────────────────────────
  // The chain, read off the files rather than guessed:
  //   admin/layout.jsx:49  <div class="flex h-screen overflow-hidden">
  //   admin/layout.jsx:59    <main class="h-screen flex-1 overflow-y-auto">
  //   AdminContentWrapper      <div>  ← no padding on /admin/pages/builder/*
  //   builder route            PageBuilderEditor → EditorProvider → (this)
  // Nothing between `main` and here adds height, so the shell fills `main`
  // exactly at 100dvh — the same number CourseForm, ArticleForm and
  // CustomPageForm already state for the same reason.
  //
  // It used to say `calc(100dvh-4rem)`. There is no 4rem on this route: the
  // admin chrome is a SIDEBAR, beside `main` rather than above it, and there is
  // no top bar to subtract. The two numbers happened to coexist without a
  // doubled scrollbar only because the wrapper's p-6 (48px) was eating into the
  // 64px the calc had reserved — a near-miss, not a design. With this route now
  // in FULL_HEIGHT_ROUTES the padding is gone, so keeping the 4rem would leave a
  // 64px dead band under the shell.
  return (
    <div className="flex h-[100dvh] flex-col">
      <EditorTopBar
        onSave={saveNow}
        onOpenSettings={() => openSettings('general')}
        onOpenPreview={() => openSettings('preview')}
        onPublish={() => setDialog('publish')}
        onDiscard={discard}
      />
      <PageSettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        initialSection={settingsSection}
      />
      <PublishDialog open={dialog === 'publish'} onClose={() => setDialog(null)} onPublish={publish} />
      {/* Not part of `dialog`: that state is opened by the top bar's buttons,
          this one by an exit the author attempted. They can never be open at
          once — a leave attempt starts outside this component. */}
      <LeaveConfirmDialog
        open={Boolean(pending)}
        reason={reason}
        onCancel={cancelLeave}
        onConfirm={confirmLeave}
      />
      {conflict && <ConflictBanner message={conflict.message} />}
      {error && !conflict && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* ── THE TWO SIDE COLUMNS TAKE THE DESIGN'S WIDTHS ────────────────────
          Structure 260 → 276 and Settings 320 → 330, per the Figma. These are
          the one measurement round 17 could not fix from inside the panel: it
          measured the structure row's label budget at 85px top-level and 33.4px
          on a nested row with a badge, with the action cluster costing 88px and
          always in flow, and concluded that the remedy was width the panel did
          not have. It has 16px more of it now, and the four action buttons take
          8 of that to reach a 24px hit area (see StructurePanel's IconButton) —
          the trade round 17 refused to make while the width was fixed, because
          then it could only have been paid for out of the label.

          These are raw pixel columns rather than scale steps because there is
          no scale for a panel width: the grid template has always been written
          this way, and Tailwind's spacing scale tops out far below 276. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[276px_1fr_330px]">
        {/* ── THREE BANDS, AND THE PANEL IS THE ONLY ONE WITH A HEIGHT ─────
            The section keeps the height the grid row gives it — nothing here
            is taller or shorter than it was. What changes is which part of it
            scrolls: `split` hands the space under the heading to
            StructurePanel, which spends it on a scrolling list and a pinned
            add-section footer. The heading and the footer are therefore
            SIBLINGS of the scroller rather than passengers in it, so neither
            can be scrolled away, and the body absorbing the remainder is what
            keeps the outer height independent of how tall either grows.

            `overflow-y-auto` is GONE from here on purpose: leaving it would
            give the panel a second scrollbar outside the body's, which is the
            one thing round 20 measured this editor as not having. */}
        <Panel
          title="โครงสร้างหน้า"
          hint="ลากเพื่อจัดลำดับ"
          split
          className="flex min-h-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]"
        >
          <StructurePanel />
        </Panel>

        {/* Centre column: the device-preview toolbar stays pinned at the top
            (a non-scrolling flex child) while the canvas scrolls below it. */}
        <section className="flex min-h-0 flex-col bg-[var(--page-bg-muted)]">
          <CanvasToolbar />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CanvasPanel />
          </div>
        </section>

        <Panel
          title="ตั้งค่า"
          className="min-h-0 overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--surface)]"
        >
          <SettingsPanel />
        </Panel>
      </div>
    </div>
  );
}
