import { Panel, PanelError, Field } from './Panel';
import { SyncedAtCaveat } from './Caveat';
import { LandingSyncButton } from './LandingSyncButton';
import { DowngradeRefusalPanel } from './DowngradeRefusalPanel';

/**
 * Panel 1 — the two single-document snapshot caches.
 *
 * ── WHY `status` IS RENDERED AS TEXT AND NOT AS A COLOURED DOT ──────────────
 * A green dot is read as "this cache is fine". `status` is the value the LAST
 * SYNC RUN wrote about ITSELF (syncLandingData.js:406-410) and it is INFERRED,
 * not READABLE, in the inventory's sense: `unwrap()` (client.js:95-105) turns
 * an unreadable upstream 200 into an empty envelope, so a section can be
 * legitimately empty and legitimately 'ok' at the same time. The word is shown
 * with its meaning attached; a dot cannot carry that.
 */
function StatusWord({ status }) {
  if (!status) {
    return <span className="font-mono text-sm text-[var(--text-muted)]">—</span>;
  }
  return (
    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
      {status}
    </span>
  );
}

function Absent({ what, consequence }) {
  return (
    <p className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      <strong className="text-[var(--text-primary)]">ไม่มีเอกสาร {what}</strong>{' '}
      — {consequence}
    </p>
  );
}

export function SnapshotPanel({ snapshots, history = null }) {
  if (!snapshots?.ok) {
    return (
      <Panel title="1. Snapshot caches" subtitle="landing_cache · nav_menu_cache">
        <PanelError label="snapshot caches" error={snapshots?.error ?? 'unknown'} />
      </Panel>
    );
  }

  const { landing, navmenu } = snapshots.data;

  return (
    <Panel
      title="1. Snapshot caches"
      subtitle="เอกสารเดียวต่อหนึ่งแคช เขียนโดย cron ทุก 3 ชั่วโมง (landing_cache · nav_menu_cache)"
    >
      <div className="flex flex-col gap-6">
        {/* ── landing_cache ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-sm font-bold text-[var(--text-primary)]">
            landing_cache <span className="text-[var(--text-muted)]">· homepage_v1 · หน้า /</span>
          </h3>

          {!landing.present ? (
            <Absent
              what="landing_cache"
              consequence={
                'หน้าแรกจะ render เป็นค่าว่างทั้งหมด (getLandingData คืน DEFAULT_DATA ' +
                'พร้อม status="missing") จนกว่าจะ sync สำเร็จหนึ่งครั้ง'
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="status (รอบล่าสุดรายงานตัวเอง)" value={<StatusWord status={landing.status} />} />
                <Field label="syncedAt" value={landing.syncedAt ?? 'ไม่เคย'} mono />
                <Field label="schemaVersion" value={String(landing.schemaVersion ?? '—')} mono />
                <Field label="เอกสารแก้ล่าสุด" value={landing.updatedAt ?? '—'} mono />
              </div>

              {landing.sections && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Object.entries(landing.sections).map(([key, count]) => (
                    <div
                      key={key}
                      className="rounded-9e-md bg-[var(--surface-muted)] p-3 text-center"
                    >
                      <div className="text-lg font-bold text-[var(--text-primary)]">{count}</div>
                      <div className="text-xs text-[var(--text-muted)]">{key}</div>
                    </div>
                  ))}
                </div>
              )}

              {/*
                syncErrors IN FULL, never truncated and never summarised.
                The SHAPE of one of these lines is what identifies which code
                produced the snapshot — "getCourseByCode(MSE-AI): 502" and
                "listPublicCourses: fetch failed" come from different call
                sites and mean different things. A count, or a first-line
                preview, throws away the only thing the field is for.
              */}
              {landing.syncErrors.length > 0 ? (
                <div>
                  <p className="mb-1 text-sm font-bold text-red-600 dark:text-red-400">
                    syncErrors ({landing.syncErrors.length}) — จากรอบ sync ล่าสุด, แสดงครบทุกบรรทัด
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {landing.syncErrors.map((e, i) => (
                      <li
                        key={i}
                        className="break-all rounded-9e-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs text-red-600 dark:text-red-400"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  syncErrors: ว่าง — รอบล่าสุดไม่ได้บันทึกข้อผิดพลาดไว้
                </p>
              )}
            </>
          )}

          <SyncedAtCaveat />
          <LandingSyncButton />

          {/*
            Rendered ONLY when the guard is currently blocking a write. Its
            presence means every cron run since the refusal has recomputed the
            same answer and left the snapshot alone — the sync is stuck and a
            human has to decide. It returns null when there is no refusal, so
            the healthy case adds nothing to the page.
          */}
          <DowngradeRefusalPanel refusal={landing.lastRefusal} />

          {/* The override trail for this snapshot. Rendered by the page and
              placed here — see the mount point for why. */}
          {history}
        </div>

        {/* ── nav_menu_cache ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-6">
          <h3 className="font-mono text-sm font-bold text-[var(--text-primary)]">
            nav_menu_cache{' '}
            <span className="text-[var(--text-muted)]">· navmenu_v1 · เมกะเมนูบนทุกหน้า</span>
          </h3>

          {!navmenu.present ? (
            <Absent
              what="nav_menu_cache"
              consequence={
                'เมกะเมนูจะไม่มีหลักสูตรเลยบนทุกหน้าสาธารณะ และ getNavMenuData ' +
                'คืนค่าว่างแบบเงียบ ๆ (catch เปล่า) จึงไม่มี log บอกว่าเกิดอะไรขึ้น'
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="status (รอบล่าสุดรายงานตัวเอง)" value={<StatusWord status={navmenu.status} />} />
                <Field label="syncedAt" value={navmenu.syncedAt ?? 'ไม่เคย'} mono />
                <Field label="programs (กลุ่ม / หลักสูตร)" value={`${navmenu.programs.groups} / ${navmenu.programs.courses}`} mono />
                <Field label="skills (กลุ่ม / หลักสูตร)" value={`${navmenu.skills.groups} / ${navmenu.skills.courses}`} mono />
              </div>
              {(navmenu.programs.withoutCover > 0 || navmenu.skills.withoutCover > 0) && (
                <p className="text-sm text-[var(--text-secondary)]">
                  กลุ่มที่ไม่มีภาพ firstCover: programs {navmenu.programs.withoutCover} ·
                  skills {navmenu.skills.withoutCover} — คอลัมน์ที่ 4 ของเมนูจะว่างสำหรับกลุ่มเหล่านี้
                </p>
              )}
            </>
          )}

          {/*
            The asymmetry between the two snapshots is surfaced, not smoothed
            over: nav_menu_cache has no syncErrors, no schemaVersion and no
            sections counters, so there is genuinely less to show. Saying so is
            more useful than rendering the same layout with three dashes in it.
          */}
          <p className="text-sm text-[var(--text-secondary)]">
            nav_menu_cache ไม่มีฟิลด์ <code className="font-mono">syncErrors</code>,{' '}
            <code className="font-mono">schemaVersion</code> หรือตัวนับ{' '}
            <code className="font-mono">sections</code> แบบ landing_cache —
            ตัวเลขด้านบนจึงนับจาก payload โดยตรง
            และรอบที่ล้มเหลวบางส่วนไม่ได้ทิ้งรายละเอียดไว้ที่ไหนเลย
          </p>
          <SyncedAtCaveat />
        </div>
      </div>
    </Panel>
  );
}
