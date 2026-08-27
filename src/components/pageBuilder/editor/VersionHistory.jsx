'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { History, Loader2 } from 'lucide-react';
/**
 * The restore glyphs, as a SECOND lucide statement rather than an edit of the
 * one above — the standing rule in this directory.
 */
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { getPageVersions, getPageVersionSnapshot, saveDraftContent } from '@/lib/actions/pageBuilder';
import { effectiveContent } from '@/lib/pageBuilder/draftState';
import { canRestoreVersion, restoreWouldLoseWork } from '@/lib/pageBuilder/editorStatus';
import { cn } from '@/lib/utils';

/**
 * Version history — list, and restore one version INTO THE DRAFT.
 *
 * ── WHAT CHANGED, AND WHY IT IS NOT THE ROLLBACK THIS FILE REFUSED ────────
 * The old note here said a restore button would need "the conflict token, an
 * audit row, a pre-rollback snapshot, and an answer for the unsaved edits it
 * would destroy", and that this was a phase rather than an afternoon. Three of
 * those four turned out to be already built, and the fourth turned out not to
 * be needed:
 *
 *   · the conflict token — `savedUpdatedAt`, the same one every other write in
 *     the editor carries.
 *   · the audit row — saveDraftContent already writes `draft.save`.
 *   · the unsaved edits — the confirmation below, and restoreWouldLoseWork
 *     decides what it has to warn about.
 *   · the pre-rollback snapshot — NOT NEEDED, and that is the actual insight.
 *     This does not overwrite the published page. It writes a DRAFT, which the
 *     author can discard, and which becomes public only if they then publish
 *     it. Nothing is destroyed that a snapshot would have had to preserve, so
 *     the `pre-rollback` label PageVersion declares stays unwritten.
 *
 * So restore is a special case of "save a draft" rather than a second write
 * path — round 2 built the write, round 34 commit 1 made the read possible, and
 * this is the wire between them. There is no rollback action and there is not
 * going to be one.
 *
 * ── THE LIST IS STILL METADATA ONLY ──────────────────────────────────────
 * getPageVersions still projects `label actor createdAt`; the snapshot is
 * fetched one at a time, on the click, by getPageVersionSnapshot. That split is
 * the whole reason commit 1 was a new action rather than a wider projection
 * (measured: the snapshot is ~33x the row that displays it), so this file must
 * never fetch a snapshot to RENDER a row.
 *
 * ── Empty is a real state, not a failure ─────────────────────────────────
 * Snapshots are written on PUBLISH only. A draft that has never gone live has
 * no history and will have none until it does — so the empty case says that,
 * rather than a bare "no data" that reads as something being broken.
 */

const LABELS = { publish: 'เผยแพร่', 'pre-rollback': 'ก่อนย้อนกลับ' };

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The confirmation's body text.
 *
 * Exported and pure because it is the only part of the dialog a test can reach.
 * A Radix `Dialog.Portal` renders ZERO BYTES under renderToStaticMarkup — round
 * 27 measured that and it is why the page dialogs had no coverage until their
 * bodies were extracted — and the runner never mounts a React root, because
 * with isolation:'none' one leaked root breaks unrelated files (round 32). So
 * the two sentences are asserted by value, and the branch that chooses between
 * them is a pure function of one boolean rather than a condition inside JSX no
 * test can render.
 *
 * The two are not a prefix of one another. Both say what the restore DOES; only
 * the loss-bearing one says what it destroys, because painting the harmless
 * case in the alarming words is how a warning stops being read.
 */
export function restoreWarning(losesWork, whenText) {
  const lead = `นำเนื้อหาของเวอร์ชันวันที่ ${whenText} มาเป็นฉบับร่าง`;
  return losesWork
    ? `${lead} — ฉบับร่างที่ยังไม่เผยแพร่และการแก้ไขที่ยังไม่บันทึกในแท็บนี้จะถูกเขียนทับทั้งหมด และย้อนกลับไม่ได้`
    : `${lead} — หน้าที่เผยแพร่อยู่ตอนนี้ยังไม่เปลี่ยน จนกว่าจะกด “เผยแพร่”`;
}

/**
 * Confirm before restoring a version into the draft.
 *
 * NOT EditorTopBar's ConfirmDiscardDialog, for the reason that one gives for
 * not being StructurePanel's: it mirrors the SHAPE — the same Radix primitives,
 * the same focus-the-cancel-button behaviour, the same red-tone framing —
 * without pretending one component serves both. This one names a version and
 * has two bodies.
 *
 * IT IS SHOWN EVEN WHEN NOTHING WOULD BE LOST. Restoring is consequential
 * either way, and a confirmation that appears only sometimes teaches the author
 * to click through the times it does appear. What is conditional is the WARNING
 * — the same rule round 33's preview status card followed: state the case you
 * are actually in, rather than painting every case in the alarming one.
 */
function ConfirmRestoreDialog({ open, version, losesWork, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          data-testid="confirm-restore-dialog"
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl'
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">
                กู้คืนเป็นฉบับร่าง
              </Dialog.Title>
              <Dialog.Description
                data-testid="confirm-restore-body"
                className="mt-1 text-xs text-9e-slate-dp-50"
              >
                {restoreWarning(losesWork, when(version?.createdAt))}
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                ref={cancelRef}
                type="button"
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy dark:text-white"
              >
                ยกเลิก
              </button>
            </Dialog.Close>
            <button
              type="button"
              data-testid="confirm-restore-accept"
              onClick={onConfirm}
              className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
            >
              กู้คืนเป็นฉบับร่าง
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * `initialRows` is a TEST SEED and nothing else, in the shape round 32 gave
 * StructurePanel's `initialExpanded` and for the same reason: the list arrives
 * from a `useEffect`, effects do not run under renderToStaticMarkup, and the
 * runner never mounts a React root. Without a seed the only reachable state is
 * the loading paragraph, so nothing about a rendered ROW could be tested at all.
 *
 * It defaults to null — the production state — and test/render/versionRestore
 * asserts HistorySection still passes nothing, which is what keeps every claim
 * about a row a claim about production rather than about a fixture.
 */
export function VersionHistory({ pageId, open, editor = null, initialRows = null }) {
  const savedUpdatedAt = editor?.savedUpdatedAt ?? null;
  const dispatch = editor?.dispatch ?? null;
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);   // the version awaiting confirmation
  const [busy, setBusy] = useState(null);         // the version id being restored

  useEffect(() => {
    if (!open || !pageId) return undefined;
    let alive = true;
    setRows(null); setError('');
    getPageVersions(pageId)
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch((e) => { if (alive) setError(e?.message ?? 'โหลดประวัติไม่สำเร็จ'); });
    // Ignore a late response after the dialog closes or the page changes.
    return () => { alive = false; };
  }, [pageId, open]);

  /**
   * Fetch ONE snapshot and save it as the draft.
   *
   * THE PICK IS effectiveContent AND NOTHING ELSE, which is the load-bearing
   * line in this file. A snapshot is a WHOLE PAGE — it carries `slug`,
   * `status`, `promotionId`, `slugHistory`, `preview`. Handing the raw snapshot
   * to saveDraftContent would try to restore a page's IDENTITY from an old
   * version: an author restoring last week's content would silently move the
   * page's URL back, and the 301 history with it. effectiveContent restricts to
   * DRAFT_CONTENT_KEYS, is the same function the editor and /preview seed from,
   * and is imported rather than restated so the two can never disagree.
   *
   * The snapshot has already had `.draft` stripped by the read (commit 1), so
   * effectiveContent's draft branch cannot fire and it picks the snapshot's own
   * content — which is what "restore this version" means.
   */
  const restore = useCallback(async (version) => {
    setPending(null);
    setError('');
    setBusy(version._id);
    try {
      const snap = await getPageVersionSnapshot(version._id);
      if (!snap?.snapshot) {
        setError('ไม่พบเวอร์ชันนี้แล้ว — อาจถูกลบไปหลังจากเปิดหน้าต่างนี้');
        setBusy(null);
        return;
      }
      const res = await saveDraftContent(pageId, effectiveContent(snap.snapshot), savedUpdatedAt);
      if (res?.conflict) {
        // The document moved under this tab. The banner owns this state, exactly
        // as it does for a failed autosave — a restore must not be the one write
        // that gets to ignore the token.
        dispatch?.({ type: 'SAVE_CONFLICT', message: res.error });
        setBusy(null);
        return;
      }
      if (!res?.ok) {
        setError(res?.error ?? 'กู้คืนไม่สำเร็จ');
        setBusy(null);
        return;
      }
      /**
       * A RELOAD, for the reason round 5 reloads after a discard — and the
       * reason is stronger here. saveDraftContent answers { ok, updatedAt } and
       * deliberately carries no content, so the tree the editor must now show
       * is not in the response. Rebuilding it from `snap` would mean this
       * dialog seeding the reducer with a whole page — a SECOND seeding path
       * beside initialEditorState, owned by a component that exists to list
       * things. The route re-reads and re-seeds correctly by construction.
       */
      window.location.reload();
    } catch (err) {
      setError(err?.message ?? 'กู้คืนไม่สำเร็จ');
      setBusy(null);
    }
  }, [pageId, savedUpdatedAt, dispatch]);

  // An unsaved page has no id and therefore cannot have snapshots.
  if (!pageId) {
    return <p className="text-[11px] text-9e-slate-dp-50">ยังไม่ได้บันทึกหน้านี้ — ยังไม่มีประวัติ</p>;
  }
  if (error) return <p className="text-[11px] text-red-600" role="alert">{error}</p>;
  if (rows === null) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-9e-slate-dp-50">
        <Loader2 className="h-3 w-3 animate-spin" /> กำลังโหลด…
      </p>
    );
  }
  if (!rows.length) {
    return (
      <p className="text-[11px] text-9e-slate-dp-50">
        ยังไม่มีประวัติ — ระบบจะบันทึก snapshot ทุกครั้งที่ “เผยแพร่” หน้านี้
      </p>
    );
  }

  const allowed = canRestoreVersion(editor);

  return (
    <>
      <ul className="space-y-1">
        {rows.map((v) => (
          <li key={v._id} className="flex items-start gap-1.5 text-[11px] text-9e-slate-dp-50">
            <History className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="text-9e-navy dark:text-white/90">{when(v.createdAt)}</span>
              {' · '}{LABELS[v.label] ?? (v.label || 'snapshot')}
              {v.actor?.name ? ` · ${v.actor.name}` : ''}
            </span>
            <button
              type="button"
              data-testid="restore-version-button"
              onClick={() => setPending(v)}
              disabled={!allowed || busy !== null}
              title={allowed ? undefined : 'กู้คืนไม่ได้ระหว่างกำลังบันทึกหรือเมื่อการแก้ไขชนกัน'}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-9e-sm border px-1.5 py-0.5',
                'border-[var(--surface-border)] text-[10px] text-9e-navy',
                'hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-9e-navy'
              )}
            >
              {busy === v._id
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                : <RotateCcw className="h-3 w-3" aria-hidden />}
              กู้คืน
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-9e-slate-dp-50/80">
        เก็บ 20 รายการล่าสุด · การกู้คืนจะเขียนเป็น “ฉบับร่าง” ไม่เปลี่ยนหน้าที่เผยแพร่อยู่ทันที
      </p>

      <ConfirmRestoreDialog
        open={pending !== null}
        version={pending}
        losesWork={restoreWouldLoseWork(editor)}
        onCancel={() => setPending(null)}
        onConfirm={() => restore(pending)}
      />
    </>
  );
}
