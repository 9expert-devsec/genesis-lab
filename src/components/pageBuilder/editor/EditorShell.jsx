'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useEditor } from './EditorProvider';
import { useEditorSave } from './useEditorSave';
import { EditorTopBar } from './EditorTopBar';
import { StructurePanel } from './StructurePanel';
import { CanvasPanel } from './CanvasPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { SettingsPanel } from './SettingsPanel';
import { PageSettingsDialog } from './PageSettingsDialog';
import { PreviewDialog } from './PreviewDialog';
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

function Panel({ title, children, className }) {
  return (
    <section className={className}>
      <h2 className="border-b border-[var(--surface-border)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50">
        {title}
      </h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function EditorShell() {
  const { dirty, conflict, error } = useEditor();
  const { saveNow, publish } = useEditorSave();
  const [dialog, setDialog] = useState(null); // 'settings' | 'preview' | 'publish' | null

  // Unsaved-changes guard. A conflict also counts as unsaved: those changes
  // exist only in this tab.
  useEffect(() => {
    if (!dirty && !conflict) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, conflict]);

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
        onOpenSettings={() => setDialog('settings')}
        onOpenPreview={() => setDialog('preview')}
        onPublish={() => setDialog('publish')}
      />
      <PageSettingsDialog open={dialog === 'settings'} onClose={() => setDialog(null)} />
      <PreviewDialog open={dialog === 'preview'} onClose={() => setDialog(null)} />
      <PublishDialog open={dialog === 'publish'} onClose={() => setDialog(null)} onPublish={publish} />
      {conflict && <ConflictBanner message={conflict.message} />}
      {error && !conflict && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_320px]">
        <Panel
          title="โครงสร้างหน้า"
          className="min-h-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface)]"
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
