import { Panel } from './Panel';
import {
  ROUTE_WINDOWS,
  DIVERGENCE,
  MEASURED_AT,
  MEASURED_COMMIT,
} from '@/lib/cache-console/routeWindows';

/**
 * Panel 4 — route cache windows. BUILD-TIME FACTS, NOT LIVE STATE.
 *
 * The heading says so because the whole panel is the kind of thing that gets
 * misread as a status board. These are the windows the last build baked in.
 * Nothing here reports whether a URL is currently serving a cached entry, how
 * old it is, or when it regenerates — that is Vercel's ISR entry state, which
 * the inventory classifies NOT OBSERVABLE, and which therefore appears nowhere
 * on this screen in any form.
 *
 * The divergent rows are listed FIRST and marked, rather than footnoted,
 * because they are the reason the panel is worth having: for six route groups
 * the exported `revalidate` is not the effective one, and an admin reasoning
 * from the source file would be wrong about a third of the public site.
 */

const DIVERGENCE_LABEL = {
  [DIVERGENCE.LOWERED_BY_LAYOUT]: 'ค่าที่ประกาศถูกกดลงโดย fetch ใน layout ที่แชร์กัน',
  [DIVERGENCE.INERT_DYNAMIC_API]: 'ค่าที่ประกาศไม่มีผล — route เป็น dynamic เพราะอ่าน searchParams',
  [DIVERGENCE.INERT_UNENUMERABLE]: 'ค่าที่ประกาศไม่มีผล — dynamic segment ที่ไม่มี generateStaticParams',
};

export function RouteWindowPanel() {
  const divergent = ROUTE_WINDOWS.filter((r) => r.divergence !== DIVERGENCE.NONE);
  const agreeing = ROUTE_WINDOWS.filter((r) => r.divergence === DIVERGENCE.NONE);

  return (
    <Panel
      title="4. Route cache windows — ข้อมูลจากตอน BUILD ไม่ใช่สถานะปัจจุบัน"
      subtitle={`อ่านจากตาราง route ของ next build จริง ที่ commit ${MEASURED_COMMIT} (${MEASURED_AT}) — ไม่ได้อ่านจาก route config`}
    >
      <p className="mb-4 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        ตารางนี้บอกว่า <strong>build ล่าสุดฝังหน้าต่างแคชไว้เท่าไร</strong> เท่านั้น
        ไม่ได้บอกว่าตอนนี้ URL ไหนกำลังเสิร์ฟจากแคช แคชนั้นเก่าแค่ไหน หรือจะสร้างใหม่เมื่อไร —
        สถานะแคชของ Next/Vercel อ่านจากโค้ดแอปไม่ได้ จึงไม่ปรากฏที่ไหนในหน้านี้เลย
      </p>

      <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">
        ค่าที่ประกาศไว้ ≠ ค่าที่มีผลจริง ({divergent.length} กลุ่ม)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-4 font-medium">route</th>
              <th className="py-2 pr-4 font-medium">ประกาศในไฟล์</th>
              <th className="py-2 pr-4 font-medium">มีผลจริงตอน build</th>
              <th className="py-2 font-medium">ทำไมถึงต่างกัน</th>
            </tr>
          </thead>
          <tbody>
            {divergent.map((r) => (
              <tr key={r.path} className="border-b border-[var(--surface-border)] last:border-0 align-top">
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">{r.path}</td>
                <td className="py-2 pr-4 font-mono text-[var(--text-secondary)]">
                  {r.exported ?? '— ไม่ได้ประกาศ'}
                </td>
                <td className="py-2 pr-4 font-mono font-bold text-[var(--text-primary)]">
                  {r.effective}
                </td>
                <td className="py-2 text-xs text-[var(--text-secondary)]">
                  <span className="block font-medium">{DIVERGENCE_LABEL[r.divergence]}</span>
                  {r.why}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold text-[var(--text-primary)]">
        ค่าที่ประกาศไว้ตรงกับที่มีผลจริง ({agreeing.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-4 font-medium">route</th>
              <th className="py-2 pr-4 font-medium">ประกาศในไฟล์</th>
              <th className="py-2 font-medium">มีผลจริงตอน build</th>
            </tr>
          </thead>
          <tbody>
            {agreeing.map((r) => (
              <tr key={r.path} className="border-b border-[var(--surface-border)] last:border-0 align-top">
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">
                  {r.path}
                  {r.why && (
                    <span className="mt-0.5 block text-xs font-sans text-[var(--text-secondary)]">
                      {r.why}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 font-mono text-[var(--text-secondary)]">
                  {r.exported ?? '— ไม่ได้ประกาศ'}
                </td>
                <td className="py-2 font-mono text-[var(--text-primary)]">{r.effective}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        ตัวเลขคอลัมน์ &quot;มีผลจริง&quot; จะล้าสมัยเมื่อมีการเพิ่ม/แก้ fetch ใน layout ที่แชร์กัน
        โดยไม่ได้แตะไฟล์ route เลย — ต้องรัน next build แล้วอ่านตารางใหม่เท่านั้น
        ไม่มีทางรู้จากการอ่านโค้ดอย่างเดียว
      </p>
    </Panel>
  );
}
