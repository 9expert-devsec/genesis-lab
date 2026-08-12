'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  previewSnapshotOverride,
  applySnapshotOverride,
} from '@/lib/actions/cache-console';
import { overrideConfirmLabel } from '@/lib/cache-console/downgradeGuard';

/**
 * The override control: preview → confirm → sync anyway.
 *
 * ── THE CONFIRM RESTATES THE NUMBERS AT THE POINT OF CLICK ──────────────────
 * The panel above already shows the per-section table, and that is not enough.
 * A button reading "ยืนยัน" under a table is a button people click having read
 * the heading and not the rows — so the confirm control carries the loss in its
 * OWN label, and the confirmation step lists the sections again immediately
 * beside it. What is being approved has to be legible without scrolling back.
 *
 * ── ONE CONTROL, NO DISMISS ─────────────────────────────────────────────────
 * There is no second button. Clearing the refusal without syncing would leave
 * the console silent while the next cron run refuses again.
 *
 * The preview/apply and staleness shapes are round 3's, reused rather than
 * reinvented: `previewSnapshotOverride` returns a `preview` token carrying
 * `issuedAt` and the stored `syncedAt`, and the apply refuses if either the
 * window has passed or the snapshot moved underneath it.
 */
export function OverrideClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function runPreview() {
    setBusy(true);
    setError(null);
    setDone(null);
    // Cleared FIRST so a failed preview can never leave a previous one
    // spendable on an apply.
    setPreview(null);
    try {
      const res = await previewSnapshotOverride();
      if (!res.ok) setError(res.error);
      else setPreview(res);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await applySnapshotOverride(preview.preview);
      if (!res.ok) {
        setError(res.error);
        // A refused apply invalidates the preview it was spent against — the
        // numbers shown are exactly what turned out to be wrong.
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
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-9e-md border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-800 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {done && (
        <p className="rounded-9e-md border border-green-400 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-950/30 dark:text-green-300">
          เขียนสแนปช็อตใหม่แล้ว — สถานะ {done.status ?? '—'}
        </p>
      )}

      {!preview ? (
        <button
          type="button"
          onClick={runPreview}
          disabled={busy}
          className="self-start rounded-9e-md border border-red-400 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          {busy ? 'กำลังตรวจ…' : 'ดูตัวอย่างก่อนยืนยัน override'}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-9e-md border border-red-400 bg-white p-3 dark:bg-[#0D1B2A]">
          <p className="text-sm font-bold text-red-800 dark:text-red-300">
            ยืนยันว่าจะยอมให้ข้อมูลหายตามนี้
          </p>

          {/* THE NUMBERS, RESTATED AT THE POINT OF CLICK — not only in the
              panel above. */}
          <ul className="flex flex-col gap-0.5">
            {(preview.shrunk ?? []).map((s) => (
              <li
                key={s.section}
                className="font-mono text-sm text-red-900 dark:text-red-200"
              >
                {s.section}: {s.before} → {s.after} (หายไป {s.lost},
                {' '}-{Math.round(s.ratio * 100)}%)
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={runApply}
            disabled={busy}
            className="self-start rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy
              ? 'กำลัง sync…'
              : overrideConfirmLabel(preview.shrunk)}
          </button>

          <p className="text-xs text-[var(--text-muted)]">
            ตัวอย่างนี้ใช้ได้ประมาณ 2 นาที — ถ้าเกินกว่านั้น
            หรือมี sync อื่นเขียนสแนปช็อตระหว่างนี้ ระบบจะปฏิเสธและให้กดดูตัวอย่างใหม่
          </p>
        </div>
      )}
    </div>
  );
}
