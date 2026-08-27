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
// Round 37, ADDED rather than folded into the statement above.
import { backupDraftBeforeRestore } from '@/lib/actions/pageBuilder';
import { effectiveContent } from '@/lib/pageBuilder/draftState';
import { canRestoreVersion, restoreWouldLoseWork } from '@/lib/pageBuilder/editorStatus';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory.
import { backupCanPreserve, unsavedNotBackedUpNote } from '@/lib/pageBuilder/editorStatus';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this directory.
import { versionName } from '@/lib/pageBuilder/versionLabel';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory.
import { versionRowLabel, isDraftBackup, DRAFT_BACKUP_LABEL } from '@/lib/pageBuilder/versionLabel';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this directory.
import { canOfferPublishedView, publishedViewHref } from '@/lib/pageBuilder/previewMode';
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
 * getPageVersions still projects METADATA ONLY — `label actor createdAt`
 * plus round 35's `versionNumber`, a small integer per row; the snapshot is
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

const LABELS = {
  publish: 'เผยแพร่',
  'pre-rollback': 'ก่อนย้อนกลับ',
  // Round 37. Without this the row would render the raw ASCII 'draft-backup' in
  // a Thai list, through the fallback below — the exact leak round 33 predicted
  // when it asked where a backup would live.
  [DRAFT_BACKUP_LABEL]: 'สำรองไว้ก่อนกู้คืน',
};
// The statuses under which the newest version is what the public is reading.
const LIVE_STATUSES = ['published', 'scheduled'];

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * How the confirmation refers to the version it is about to restore.
 *
 * The date is kept as the lead and the number is APPENDED, rather than the
 * number replacing it. Two reasons, and the second is the one that decides it:
 *   · a row with no number (every row until the backfill runs) must still be
 *     identifiable, and the date always exists;
 *   · restoreWarning's sentence is built around "เวอร์ชันวันที่ X" and is round
 *     34's, with its exact strings asserted. Feeding it a richer X leaves that
 *     function and its tests untouched — a number in the confirmation is not
 *     worth rewording a guarded sentence for.
 */
function versionDescriptor(version) {
  const date = when(version?.createdAt);
  const name = versionName(version);
  return name ? `${date} (${name})` : date;
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
function ConfirmRestoreDialog({ open, version, losesWork, canBackup, unsavedNote, onCancel, onConfirm }) {
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
                {restoreWarning(losesWork, versionDescriptor(version))}
              </Dialog.Description>
              {/*
                A SECOND line, not a rewrite of the one above: round 34's
                restoreWarning has its exact strings asserted, and this says
                something that sentence cannot — that the backup reaches the
                STORED draft only. Empty when nothing local is pending.
              */}
              {unsavedNote && (
                <p data-testid="confirm-restore-unsaved-note" className="mt-1 text-xs text-amber-700">
                  {unsavedNote}
                </p>
              )}
            </div>
          </div>
          {/*
            ── TWO PATHS, AND THE PRESERVING ONE IS THE DEFAULT ────────────────
            Offered only when there is a stored draft a backup could actually
            save (backupCanPreserve). With nothing to preserve the second button
            would be a choice between two identical outcomes, which teaches an
            author that the distinction is decorative.

            The preserving path is default THREE ways that a test can see: it is
            the primary-styled button, it is the one this dialog calls with no
            mode argument (restore's own default), and the destructive path is
            demoted to a plain text button that has to be aimed at.
          */}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Dialog.Close asChild>
              <button
                ref={cancelRef}
                type="button"
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy dark:text-white"
              >
                ยกเลิก
              </button>
            </Dialog.Close>
            {canBackup && (
              <button
                type="button"
                data-testid="confirm-restore-replace"
                onClick={() => onConfirm('replace')}
                className="rounded-9e-md px-3 py-1.5 text-sm text-red-700 underline decoration-dotted underline-offset-2 hover:bg-red-50"
              >
                เขียนทับโดยไม่สำรอง
              </button>
            )}
            <button
              type="button"
              data-testid="confirm-restore-accept"
              data-default-path={canBackup ? 'backup' : 'replace'}
              onClick={() => onConfirm()}
              className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
            >
              {canBackup ? 'สำรองฉบับร่างเดิมไว้ แล้วกู้คืน' : 'กู้คืนเป็นฉบับร่าง'}
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
  /**
   * `mode` DEFAULTS TO 'backup' — requirement §9's recommended path, expressed
   * as a default parameter rather than only as a highlighted button. A default
   * that lives in the markup is a default the next caller can forget; this one
   * means `restore(version)` preserves, and destroying takes saying so.
   */
  const restore = useCallback(async (version, mode = 'backup') => {
    setPending(null);
    setError('');
    setBusy(version._id);
    try {
      /**
       * ── ORDER: READ, THEN BACK UP, THEN OVERWRITE ─────────────────────────
       * The snapshot fetch comes first because it is READ-ONLY: if the version
       * has been deleted since this dialog opened, nothing has happened yet and
       * no pointless backup row was written.
       *
       * The backup then comes strictly BEFORE the write that destroys the
       * draft, and its failure ABORTS. That is the whole ordering argument —
       * see backupDraftBeforeRestore: a backup written but not replaced is
       * recoverable, a draft replaced with no backup is the loss this exists to
       * prevent. backupDraftVersion throws rather than swallowing precisely so
       * this branch can be taken.
       */
      const snap = await getPageVersionSnapshot(version._id);
      if (!snap?.snapshot) {
        setError('ไม่พบเวอร์ชันนี้แล้ว — อาจถูกลบไปหลังจากเปิดหน้าต่างนี้');
        setBusy(null);
        return;
      }

      if (mode === 'backup') {
        const backup = await backupDraftBeforeRestore(pageId, savedUpdatedAt);
        if (backup?.conflict) {
          dispatch?.({ type: 'SAVE_CONFLICT', message: backup.error });
          setBusy(null);
          return;
        }
        if (!backup?.ok) {
          // ABORT. The draft is untouched, and saying so matters more than
          // completing the restore the author asked for.
          setError(backup?.error ?? 'สำรองฉบับร่างไม่สำเร็จ — ยังไม่ได้กู้คืน ฉบับร่างเดิมยังอยู่ครบ');
          setBusy(null);
          return;
        }
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
  /**
   * WHICH ROW IS THE ONE THE PUBLIC IS READING.
   *
   * `rows` is newest-first, so it is `rows[0]` — but ONLY when the page is
   * actually in a live status. A page that has been unpublished, closed or
   * archived still has history, and marking its newest row "ปัจจุบัน" would
   * state that something is public which is not. Two conditions, both required,
   * because either alone gives a confident wrong answer.
   *
   * This is the version-dialog half of "what version is live". The full answer
   * is the published-version view, which is round 33 step 5 and not this round;
   * the top bar deliberately says nothing — round 27 refused a second save
   * vocabulary there and round 34's saver line respected it.
   */
  /**
   * WHICH ROW IS LIVE — now the newest row that is a VERSION, not simply the
   * newest row.
   *
   * Round 35 wrote `rows[0]`, which was exact while every row was a publish.
   * Round 37 breaks that: a backup is written at restore time and is therefore
   * NEWER than the publish it protects, so `rows[0]` would put ปัจจุบัน on a
   * backup — naming as live a thing that was never public, on the first restore
   * any page ever performs.
   */
  const newestVersion = rows.find((v) => !isDraftBackup(v));
  const liveVersionId = LIVE_STATUSES.includes(editor?.page?.status) ? newestVersion?._id : null;
  /**
   * The ปัจจุบัน row also LINKS to the published view — same destination as the
   * top bar's, through the same helper.
   *
   * `hasVersionRow: true` because being in this list IS the row. `pendingDraft`
   * is not required here and is passed true: the top bar offers the link to
   * contrast an unpublished edit against what is live, but an author who has
   * opened the history is asking about versions directly, and the current one
   * is worth being able to open whether or not anything is pending.
   *
   * NO LINK ON ANY OTHER ROW, and that is a scope call rather than an omission.
   * Viewing an ARBITRARY past version read-only means rendering a stored
   * snapshot — which reopens the source question round 36 just decided against
   * for the live view, and needs its own answer for identity drift, for a
   * snapshot whose schema has since moved, and for what the banner may claim.
   * That is its own step; half-building it here would put a link on rows that
   * cannot honour it.
   */
  const offerLiveLink = canOfferPublishedView({
    pendingDraft: true,
    publishedVersion: editor?.publishedVersion,
    // Round 37: being in this list is no longer proof of a PUBLISHED version —
    // a page whose only rows are backups has never published anything.
    hasVersionRow: Boolean(newestVersion),
    previewEnabled: editor?.previewEnabled,
  });

  return (
    <>
      <ul className="space-y-1">
        {rows.map((v) => (
          <li key={v._id} className="flex items-start gap-1.5 text-[11px] text-9e-slate-dp-50">
            <History className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {/*
                The number leads when there is one. An unnumbered row — every
                row until the backfill runs — omits the segment entirely rather
                than printing a placeholder, so an un-migrated deployment reads
                exactly as it did before this round. versionLabel owns that.
              */}
              {versionRowLabel(v) && (
                <span data-testid="version-number" className="font-bold text-9e-navy dark:text-white/90">
                  {versionRowLabel(v)}{' · '}
                </span>
              )}
              <span className="text-9e-navy dark:text-white/90">{when(v.createdAt)}</span>
              {' · '}{LABELS[v.label] ?? (v.label || 'snapshot')}
              {v.actor?.name ? ` · ${v.actor.name}` : ''}
              {v._id === liveVersionId && (
                <span
                  data-testid="version-live-marker"
                  className="ml-1 rounded-full border border-9e-green-800 bg-9e-green-900 px-1.5 py-px text-[10px] font-bold text-9e-navy dark:text-white"
                >
                  ปัจจุบัน
                </span>
              )}
              {v._id === liveVersionId && offerLiveLink && (
                <a
                  data-testid="view-published-link"
                  href={publishedViewHref(editor?.page?.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 underline decoration-dotted underline-offset-2 hover:text-9e-navy dark:hover:text-white"
                >
                  ดูเวอร์ชันที่เผยแพร่อยู่
                </a>
              )}
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
        canBackup={backupCanPreserve(editor)}
        unsavedNote={unsavedNotBackedUpNote(editor)}
        onCancel={() => setPending(null)}
        // No argument: restore's own default is the preserving path.
        onConfirm={(mode) => restore(pending, mode)}
      />
    </>
  );
}
