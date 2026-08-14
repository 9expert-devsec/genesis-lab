'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { previewMirrorReset, applyMirrorReset } from '@/lib/actions/cache-console';
import {
  mirrorCollapseConfirmLabel,
  mirrorDeleteLabel,
  previewWindowNote,
} from '@/lib/cache-console/resetPlan';

/**
 * Preview → apply, per mirror collection. The only destructive control in the
 * console, and the only one on this screen that can lose data permanently.
 *
 * ── THE APPLY BUTTON DOES NOT EXIST UNTIL A PREVIEW HAS RUN ─────────────────
 * Not disabled — absent. There is no state in this component in which apply is
 * reachable without `preview` being set, and the server refuses again anyway
 * (the client is a convenience, never the gate). Running a new preview CLEARS
 * any previous one, so an admin cannot preview A, preview B, and apply the
 * stale A.
 *
 * ── NO "RESET EVERYTHING" ───────────────────────────────────────────────────
 * One control per collection, deliberately. A single button that fired every
 * destructive path at once is the artifact this round exists to avoid — it
 * would make the collapse guard's confirmation a dialog about four collections
 * whose numbers nobody could hold in their head at once.
 */

const REFUSAL_TONE =
  'rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 '
  + 'dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300';

export function MirrorResetClient({ targets }) {
  return (
    <div className="flex flex-col gap-4">
      {targets.map((t) => (
        <MirrorReset key={t.key} target={t} />
      ))}
    </div>
  );
}

function MirrorReset({ target }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function runPreview() {
    setBusy(true);
    setError(null);
    setDone(null);
    // Clearing FIRST, so a failed preview can never leave the previous one
    // spendable on an apply.
    setPreview(null);
    try {
      const res = await previewMirrorReset(target.key);
      if (!res.ok) setError(res.error);
      else setPreview(res);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runApply(confirmed) {
    if (!preview) return; // unreachable from the markup; belt for a stray call
    setBusy(true);
    setError(null);
    try {
      const res = await applyMirrorReset(target.key, preview.preview, confirmed);
      if (!res.ok) {
        setError(res.error);
        // A refused apply invalidates the preview it was spent against — the
        // numbers on screen are exactly what turned out to be wrong.
        setPreview(null);
      } else {
        setDone(res);
        setPreview(null);
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
          {target.key}
          <span className="ml-2 font-sans font-normal text-[var(--text-muted)]">
            {target.label} · ระบุแถวด้วย {target.idField}
          </span>
        </span>
        <button
          type="button"
          onClick={runPreview}
          disabled={busy}
          className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          {busy ? 'กำลังตรวจ…' : 'ดูตัวอย่างการล้างแถวที่ถูกลบต้นทาง'}
        </button>
      </div>

      {error && <p className={`mt-3 ${REFUSAL_TONE}`}>{error}</p>}

      {done && (
        <p className="mt-3 rounded-9e-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-300">
          ลบไปแล้ว {done.removedCount} แถว ({done.before} → {done.after})
        </p>
      )}

      {preview && (
        <div className="mt-3 flex flex-col gap-2 rounded-9e-md bg-[var(--surface-muted)] p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="ในระบบตอนนี้" value={preview.beforeCount} />
            <Num label="ที่ต้นทางมี" value={preview.upstreamCount} />
            <Num label="จะเหลือ" value={preview.afterCount} />
            <Num label="จะถูกลบ" value={preview.doomedTotal} strong />
          </div>

          {preview.doomedTotal > 0 && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                {preview.idField} ที่จะหายไป
                {preview.doomedTotal > preview.doomedSample.length &&
                  ` (แสดง ${preview.doomedSample.length} จาก ${preview.doomedTotal})`}
              </p>
              <p className="break-all font-mono text-xs text-[var(--text-secondary)]">
                {preview.doomedSample.join(', ')}
              </p>
            </div>
          )}

          {preview.refused && <p className={REFUSAL_TONE}>{preview.reason}</p>}

          {!preview.refused && preview.doomedTotal === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              ไม่มีแถวที่ต้องลบ — ทุกแถวในระบบยังมีอยู่ที่ต้นทาง
            </p>
          )}

          {/* The apply control is ABSENT, not disabled, unless there is
              something to apply and it is not outright refused. */}
          {!preview.refused && preview.doomedTotal > 0 && (
            preview.needsConfirm ? (
              <div className="flex flex-col gap-2">
                <p className={REFUSAL_TONE}>{preview.reason}</p>
                <button
                  type="button"
                  onClick={() => runApply(true)}
                  disabled={busy}
                  className="self-start rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {mirrorCollapseConfirmLabel(preview)}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => runApply(false)}
                disabled={busy}
                className="self-start rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
              >
                {mirrorDeleteLabel(preview)}
              </button>
            )
          )}

          {/* Derived from PREVIEW_MAX_AGE_MS, never written out — the window is
              a safety property and the copy describing it must not be able to
              disagree with it. */}
          <p className="text-xs text-[var(--text-muted)]">{previewWindowNote()}</p>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, strong = false }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={
          strong
            ? 'font-mono text-lg font-bold text-red-600 dark:text-red-400'
            : 'font-mono text-lg text-[var(--text-primary)]'
        }
      >
        {value}
      </span>
    </div>
  );
}
