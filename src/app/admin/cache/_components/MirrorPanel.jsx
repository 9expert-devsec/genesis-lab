import { Panel, PanelError } from './Panel';
import { MirrorCaveat } from './Caveat';
import { MirrorResetClient } from './MirrorResetClient';

/**
 * Panel 2 — the four row-level mirror collections.
 *
 * These do not hold a snapshot document. Each sync upserts one row per upstream
 * record and stamps `synced_at` on it, so freshness is `max(synced_at)` and
 * nothing else — there is no status field, no error list, and no run record
 * anywhere (no cron route writes any model). Everything this panel can show is
 * INFERRED, which is why MirrorCaveat is not optional decoration.
 *
 * "แถวเก่ากว่ารอบล่าสุด" is a SIGNAL, not a verdict, and the copy says so. A
 * healthy sync stamps every row it saw with the same timestamp, so an older one
 * is a row the last run did not touch — which usually means upstream no longer
 * has it, but can also mean the run partially failed, or that an admin action
 * wrote the row outside a sync.
 */
export function MirrorPanel({ mirrors, resetTargets = null }) {
  if (!mirrors?.ok) {
    return (
      <Panel title="2. Mirror collections" subtitle="career_paths · faqs · instructors · promotions">
        <PanelError label="mirror collections" error={mirrors?.error ?? 'unknown'} />
      </Panel>
    );
  }

  return (
    <Panel
      title="2. Mirror collections"
      subtitle="หนึ่งแถวต่อหนึ่งเรคอร์ดต้นทาง — ไม่มีเอกสารสถานะ มีแต่ synced_at รายแถว"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-4 font-medium">collection</th>
              <th className="py-2 pr-4 font-medium">แถวทั้งหมด</th>
              <th className="py-2 pr-4 font-medium">max(synced_at)</th>
              <th className="py-2 pr-4 font-medium">แถวเก่ากว่ารอบล่าสุด</th>
              <th className="py-2 font-medium">ไม่เคยถูก stamp</th>
            </tr>
          </thead>
          <tbody>
            {mirrors.data.map((m) => (
              <tr key={m.key} className="border-b border-[var(--surface-border)] last:border-0">
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">{m.label}</td>
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">{m.count}</td>
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">
                  {m.newest ?? 'ไม่เคย'}
                </td>
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">{m.staleRows}</td>
                <td className="py-2 font-mono text-[var(--text-primary)]">{m.neverSynced}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        &quot;แถวเก่ากว่ารอบล่าสุด&quot; คือแถวที่ sync รอบล่าสุด <em>ไม่ได้แตะ</em> —
        เป็นสัญญาณว่าเรคอร์ดนั้นอาจไม่มีอยู่ที่ต้นทางแล้ว แต่ไม่ใช่คำตัดสิน
        เพราะรอบที่ล้มเหลวบางส่วน หรือการแก้ไขจากฝั่งแอดมินเอง ก็ทำให้เกิดค่าแบบเดียวกันได้
      </p>

      <MirrorCaveat />

      {/*
        THE ONLY DESTRUCTIVE CONTROL IN THE CONSOLE, and it sits directly under
        the caveat explaining that no sync deletes — because that sentence is
        the reason this control exists at all. Rendered only when the page hands
        over the targets, so the panel stays usable in a read-only context.
      */}
      {resetTargets && (
        <div className="mt-6 border-t border-[var(--surface-border)] pt-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            ล้างแถวที่ถูกลบไปแล้วที่ต้นทาง (replace-set)
          </h3>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            นี่คือทางเดียวที่จะลบแถวซึ่งต้นทางลบไปแล้ว และเป็นการกระทำเดียวในหน้านี้ที่
            <strong> ทำให้ข้อมูลหายถาวร</strong> — ต้องกดดูตัวอย่างก่อนทุกครั้ง
            และถ้าจำนวนแถวจะหายไปมากผิดปกติ ระบบจะขอให้ยืนยันอีกครั้งโดยอ่านตัวเลขก่อน
            ถ้าชุดข้อมูลใหม่ว่างเปล่า ระบบจะปฏิเสธเสมอและไม่มีปุ่มยืนยัน
          </p>
          <MirrorResetClient targets={resetTargets} />
        </div>
      )}
    </Panel>
  );
}
