import { OverrideClient } from './OverrideClient';

/**
 * The blocked-sync panel: what the downgrade guard refused, and the one control
 * that resolves it.
 *
 * ── WHY THE NUMBERS AND NOT A SENTENCE ──────────────────────────────────────
 * The admin is being asked to approve a data loss. "The snapshot shrank too
 * much" is a summary; what they need is which sections, by how much, and to
 * what — because the answer to "is this legitimate?" is different for
 * `banners 15 → 7` (someone deactivated a campaign) and `programs 25 → 3`
 * (upstream is broken). A per-section table is the only form that lets them
 * tell those apart.
 *
 * ── THERE IS NO DISMISS CONTROL, AND THAT IS DELIBERATE ─────────────────────
 * Clearing the refusal without syncing would leave the console silent while the
 * next cron run recomputes the same refusal and blocks again — a quiet console
 * over a still-blocked sync, which is strictly worse than the refusal being
 * visible. The only way out is forward: override and sync, or fix upstream and
 * let a healthy run clear it by writing.
 *
 * Synchronous and presentational so the render tier can drive it without
 * mounting a React root.
 */

function ActorLine({ actor }) {
  // `actor` is whatever the refusing run passed. `system:cron` is the reserved
  // id for the scheduled path; anything else is an admin id, and the NAME is
  // not recorded on the refusal — so this says which it was and admits the
  // limit rather than inventing a display name.
  if (!actor) {
    return (
      <span className="text-[var(--text-secondary)]">
        ไม่ได้บันทึกว่ารอบไหนเป็นผู้ปฏิเสธ (the refusing run was not recorded)
      </span>
    );
  }
  if (actor === 'system:cron') {
    return <span>รอบตามกำหนดเวลา (cron)</span>;
  }
  return (
    <span>
      การกดจากแอดมิน — บันทึกไว้เป็นรหัสผู้ใช้{' '}
      <code className="font-mono">{actor}</code> เท่านั้น ไม่ได้บันทึกชื่อ
    </span>
  );
}

function ShrinkTable({ shrunk }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-red-300/60 text-xs text-[var(--text-muted)]">
            <th className="py-1.5 pr-4 font-medium">section</th>
            <th className="py-1.5 pr-4 font-medium">ตอนนี้เก็บไว้</th>
            <th className="py-1.5 pr-4 font-medium">รอบใหม่จะเหลือ</th>
            <th className="py-1.5 pr-4 font-medium">หายไป</th>
            <th className="py-1.5 font-medium">สัดส่วน</th>
          </tr>
        </thead>
        <tbody>
          {shrunk.map((s) => (
            <tr key={s.section} className="border-b border-red-300/30 last:border-0">
              <td className="py-1.5 pr-4 font-mono text-[var(--text-primary)]">{s.section}</td>
              <td className="py-1.5 pr-4 font-mono text-[var(--text-primary)]">{s.before}</td>
              <td className="py-1.5 pr-4 font-mono text-[var(--text-primary)]">{s.after}</td>
              <td className="py-1.5 pr-4 font-mono font-bold text-red-700 dark:text-red-400">
                -{s.lost}
              </td>
              <td className="py-1.5 font-mono font-bold text-red-700 dark:text-red-400">
                -{Math.round(s.ratio * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DowngradeRefusalPanel({ refusal }) {
  if (!refusal) return null;

  const shrunk = Array.isArray(refusal.shrunk) ? refusal.shrunk : [];
  const vanished = Array.isArray(refusal.vanished) ? refusal.vanished : [];
  const at = refusal.at ? new Date(refusal.at).toISOString() : null;

  return (
    <div className="mt-4 rounded-9e-lg border-2 border-red-400 bg-red-50 p-4 dark:border-red-500/50 dark:bg-red-950/20">
      <h3 className="text-sm font-bold text-red-800 dark:text-red-300">
        การ sync ถูกปฏิเสธอยู่ — สแนปช็อตใหม่เล็กลงเกินเกณฑ์
      </h3>

      <p className="mt-1 text-sm text-red-900 dark:text-red-200">
        ทุกรอบ cron ตั้งแต่นั้นคำนวณผลเดิมและไม่เขียนทับ สแนปช็อตเดิมยังเสิร์ฟอยู่ตามปกติ —
        แต่ <strong>ข้อมูลใหม่จะไม่ขึ้นจนกว่าจะแก้ที่ต้นทาง หรือกดยืนยันด้านล่าง</strong>
      </p>

      <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-red-900 dark:text-red-200 sm:grid-cols-2">
        <div>
          <span className="text-[var(--text-muted)]">บันทึกเมื่อ: </span>
          <span className="font-mono">{at ?? 'ไม่ทราบ'}</span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">ผู้ปฏิเสธ: </span>
          <ActorLine actor={refusal.actor} />
        </div>
      </div>

      {shrunk.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold text-red-800 dark:text-red-300">
            section ที่เล็กลงเกินเกณฑ์ — ตัวเลขจริงที่ทำให้ถูกปฏิเสธ
          </p>
          <ShrinkTable shrunk={shrunk} />
        </div>
      )}

      {vanished.length > 0 && (
        <p className="mt-2 text-sm text-red-900 dark:text-red-200">
          section ที่หายไปจากรูปร่างข้อมูลใหม่ (ไม่นับเป็นการหด):{' '}
          <span className="font-mono">{vanished.join(', ')}</span>
        </p>
      )}

      {/*
        No "dismiss". See this file's header: clearing without syncing leaves a
        silent console over a still-blocked sync.
      */}
      <div className="mt-4 border-t border-red-300/60 pt-3">
        <OverrideClient />
      </div>
    </div>
  );
}
