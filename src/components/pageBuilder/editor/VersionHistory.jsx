'use client';

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { getPageVersions } from '@/lib/actions/pageBuilder';

/**
 * Version history — READ ONLY, list only. Rollback is Phase 3.
 *
 * Nothing here restores, previews, or diffs a snapshot, and that is deliberate
 * rather than unfinished: a restore button that "just" overwrote the working
 * tree would need the conflict token, an audit row, a pre-rollback snapshot,
 * and an answer for the unsaved edits it would destroy. That is a phase, not
 * an afternoon. Listing is honest; a half-rollback would not be.
 *
 * The list is metadata only — getPageVersions never reads `snapshot` (the whole
 * page doc). So this cannot show a preview even if it wanted to, which is the
 * intended shape.
 *
 * ── Empty is a real state, not a failure ─────────────────────────────────
 * Snapshots are written on PUBLISH only. A draft that has never gone live has
 * no history and will have none until it does — so the empty case says that,
 * rather than a bare "no data" that reads as something being broken. This is
 * the same fact the conflict banner depends on when it refuses to offer
 * "recover from version history" for a draft save.
 */

const LABELS = { publish: 'เผยแพร่', 'pre-rollback': 'ก่อนย้อนกลับ' };

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function VersionHistory({ pageId, open }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

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

  return (
    <>
      <ul className="space-y-1">
        {rows.map((v) => (
          <li key={v._id} className="flex items-start gap-1.5 text-[11px] text-9e-slate-dp-50">
            <History className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              <span className="text-9e-navy dark:text-white/90">{when(v.createdAt)}</span>
              {' · '}{LABELS[v.label] ?? (v.label || 'snapshot')}
              {v.actor?.name ? ` · ${v.actor.name}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-9e-slate-dp-50/80">
        เก็บ 20 รายการล่าสุด · การย้อนกลับ (rollback) จะมาใน Phase 3
      </p>
    </>
  );
}
