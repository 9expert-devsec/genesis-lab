'use client';

import { buildRenamePreviewView, VERDICT } from '@/lib/courses/renamePreviewView';

/**
 * The preview, rendered. TAKES A RESULT — it does not fetch one.
 *
 * ── WHY THIS IS SPLIT FROM THE CLIENT THAT CALLS THE ACTION ────────────────
 * The states worth asserting are the ones with no live instance: a collision,
 * a case-only rename, a store that was not read. A component that owned the
 * fetch could only be tested by stubbing a server action; one that takes the
 * result renders those states from a fixture, in the render tier, for real.
 *
 * It is also the boundary that makes "no write is reachable" checkable — this
 * file imports one pure module and nothing else.
 */

const NBSP = ' ';

function Verdict({ view }) {
  if (view.verdict === VERDICT.BLOCKED) {
    return (
      <div className="rounded-9e-lg border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
        <p className="text-sm font-bold text-red-700 dark:text-red-300">
          เปลี่ยนรหัสนี้ไม่ได้
        </p>
        <ul className="mt-2 space-y-1">
          {view.blocked.map((reason) => (
            <li key={reason} className="text-sm text-red-700 dark:text-red-300">— {reason}</li>
          ))}
        </ul>
        {/* WHICH STORE holds it, named. "already taken" without saying where
            sends the admin hunting through two systems. */}
        {view.collision?.blocked && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            {view.collision.inMsdb && <>พบใน MSDB: <code className="font-mono">{view.collision.inMsdb}</code>{NBSP}</>}
            {view.collision.inExtension && <>พบใน CourseExtension: <code className="font-mono">{view.collision.inExtension}</code></>}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
      <p className="text-sm text-[var(--text-secondary)]">
        จะเปลี่ยนรหัสจาก{' '}
        <code className="font-mono font-bold text-[var(--text-primary)]">{view.oldCode}</code>
        {' → '}
        <code className="font-mono font-bold text-9e-action">{view.newCode}</code>
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
        {view.total} แถว
      </p>
      <p className="text-xs text-[var(--text-muted)]">รวมทุกที่เก็บข้อมูลฝั่ง genesis</p>
    </div>
  );
}

function WarningCard({ warning }) {
  return (
    <div className="rounded-9e-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{warning.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-200">{warning.body}</p>
    </div>
  );
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]';
const TD = 'px-3 py-2 text-sm text-[var(--text-primary)]';

export function RenamePreviewReport({ preview }) {
  const view = buildRenamePreviewView(preview);
  if (view.verdict === VERDICT.IDLE) return null;

  return (
    <div className="space-y-4" data-testid="rename-preview-report">
      <Verdict view={view} />

      {view.warnings.map((w) => <WarningCard key={w.kind} warning={w} />)}

      {/* ── URL ────────────────────────────────────────────────────────── */}
      {view.url && (
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">URL สาธารณะ</p>
          <p className="mt-1 font-mono text-sm text-[var(--text-primary)]">
            {view.url.current}
            {view.url.changes && <> → {view.url.after}</>}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {view.url.aliased
              ? 'ตั้ง URL alias ไว้แล้ว — รหัสเปลี่ยนแล้ว URL ไม่เปลี่ยน'
              : 'ยังไม่ได้ตั้ง alias — URL สร้างจากรหัสหลักสูตรโดยตรง'}
          </p>
          {view.url.aliasFirst && (
            <p className="mt-2 rounded-9e-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              ระบบจะสร้าง alias <code className="font-mono">{view.url.aliasToCreate}</code> ให้ก่อนเป็นขั้นแรก
              มิฉะนั้น URL เดิมจะ 404 โดยไม่มีทางเชื่อมกลับ
            </p>
          )}
        </div>
      )}

      {/* ── The per-store table ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--surface-muted)]">
            <tr className="border-b border-[var(--surface-border)]">
              <th className={TH}>ข้อมูลที่เก็บ</th>
              <th className={TH}>ที่เก็บ</th>
              <th className={`${TH} text-right`}>จำนวนแถว</th>
            </tr>
          </thead>
          <tbody>
            {view.stores.map((s) => (
              <tr key={s.key} className="border-b border-[var(--surface-border)] last:border-b-0">
                <td className={TD}>
                  {s.holds}
                  {s.noOp && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      ไม่เปลี่ยน (เปลี่ยนเฉพาะตัวพิมพ์)
                    </span>
                  )}
                </td>
                <td className={`${TD} font-mono text-xs text-[var(--text-secondary)]`}>
                  {s.model}.{s.field}
                </td>
                {/* A store that was NOT READ shows so, never 0 — those are
                    different claims and 0 is the more comforting one. */}
                <td className={`${TD} text-right tabular-nums`}>
                  {s.unread
                    ? <span className="text-[var(--text-muted)]">ไม่ได้อ่าน</span>
                    : s.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Historical ──────────────────────────────────────────────────── */}
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold text-[var(--text-secondary)]">จะไม่ถูกเปลี่ยน</p>
        <ul className="mt-2 space-y-2">
          {view.historical.map((h) => (
            <li key={h.key} className="text-sm">
              <span className="font-medium text-[var(--text-primary)]">{h.holds}</span>
              <span className="ml-2 tabular-nums text-[var(--text-muted)]">
                {h.count === null ? 'ไม่ได้อ่าน' : `${h.count} แถว`}
              </span>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{h.reason}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* ── What a dry run cannot know ──────────────────────────────────── */}
      {view.undetermined.length > 0 && (
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">ตรวจสอบล่วงหน้าไม่ได้</p>
          <ul className="mt-2 space-y-1">
            {view.undetermined.map((u) => (
              <li key={u} className="text-xs leading-relaxed text-[var(--text-secondary)]">— {u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
