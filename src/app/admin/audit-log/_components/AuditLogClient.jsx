'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rowHealth, summariseHealth, HEALTH, HEALTH_LEVEL, HEALTH_LABEL } from '@/lib/audit/auditHealth';
import {
  fmtWhen, rowSeverity, severityRowClass,
  LevelDot, SeverityIcon, AuditRowDetail, RecordIdentity, ActionChip, AuditDiff,
} from '@/components/audit/auditRowParts';

export function AuditLogClient({
  rows, nextCursor, cursor, isEmptyClamp, totalVisible,
  filters, menuOptions, entityOptions, actionOptions,
  menuLabels, entityLabels, coverage,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [openRow, setOpenRow] = useState(null);
  const [showCoverage, setShowCoverage] = useState(false);

  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams();
    const next = { ...filters, cursor: '', ...overrides };
    Object.entries(next).forEach(([k, v]) => {
      if (v !== '' && v != null) params.set(k, String(v));
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, router, filters]);

  const health = useMemo(() => summariseHealth(rows), [rows]);
  const perRow = useMemo(() => rows.map((r) => rowHealth(r)), [rows]);

  const hasAnyFilter = Object.values(filters).some((v) => v !== '');
  const emptyPairs = coverage.filter((c) => c.count === 0);

  // ── the three empty states, deliberately distinct ────────────────
  // A blank table looks broken. Each of these says WHICH nothing this is.
  let emptyState = null;
  if (isEmptyClamp) {
    emptyState = {
      title: 'คุณยังไม่ได้รับสิทธิ์เข้าถึงเมนูใดเลย',
      body: 'ประวัติจะแสดงเฉพาะเมนูที่บทบาทของคุณเข้าถึงได้ ขณะนี้บทบาทของคุณยังไม่มีเมนูใด — ' +
            'ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ ไม่ใช่ความผิดพลาดของหน้านี้',
    };
  } else if (totalVisible === 0) {
    emptyState = {
      title: 'ยังไม่มีประวัติ',
      body: 'ยังไม่มีการบันทึกการดำเนินการใด ๆ — ระบบกำลังทยอยติดตั้งการบันทึกทีละเมนู ' +
            'ดูแผงความครอบคลุมด้านล่างว่าเมนูใดพร้อมแล้ว',
    };
  } else if (rows.length === 0) {
    emptyState = {
      title: 'ไม่พบรายการที่ตรงกับเงื่อนไข',
      body: `มีประวัติทั้งหมด ${totalVisible} รายการ แต่ไม่มีรายการใดตรงกับตัวกรองที่เลือก`,
    };
  }

  return (
    <div className="space-y-4">
      {/* ── health summary ── */}
      {health.flaggedRows > 0 && (
        <div className="rounded-9e-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                พบข้อสังเกต {health.flaggedRows} จาก {health.total} แถวในหน้านี้
              </p>
              <ul className="mt-2 space-y-1">
                {Object.values(HEALTH).filter((k) => health.counts[k] > 0).map((k) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <LevelDot level={HEALTH_LEVEL[k]} />
                    <span className="text-[var(--text-secondary)]">{HEALTH_LABEL[k]}</span>
                    <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                      × {health.counts[k]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── filters ── */}
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="เมนู">
            <Select
              value={filters.menu}
              onChange={(v) => navigate({ menu: v, entity: '' })}
              options={[{ value: '', label: 'ทั้งหมด' }, ...menuOptions]}
            />
          </Field>
          <Field label="ประเภทข้อมูล">
            <Select
              value={filters.entity}
              onChange={(v) => navigate({ entity: v })}
              options={[{ value: '', label: 'ทั้งหมด' }, ...entityOptions]}
            />
          </Field>
          <Field label="การกระทำ">
            {/* Read from the DATA — the field is free-form and a hardcoded list
                would hide every verb invented after it was written. */}
            <Select
              value={filters.action}
              onChange={(v) => navigate({ action: v })}
              options={[{ value: '', label: 'ทั้งหมด' }, ...actionOptions.map((a) => ({ value: a, label: a }))]}
            />
          </Field>
          <Field label="ผู้ดำเนินการ (id)">
            <input
              defaultValue={filters.actor}
              onBlur={(e) => e.target.value !== filters.actor && navigate({ actor: e.target.value })}
              placeholder="ทั้งหมด"
              className={inputCls}
            />
          </Field>
          <Field label="ตั้งแต่">
            <input type="date" defaultValue={filters.from}
              onChange={(e) => navigate({ from: e.target.value })} className={inputCls} />
          </Field>
          <Field label="ถึง">
            <input type="date" defaultValue={filters.to}
              onChange={(e) => navigate({ to: e.target.value })} className={inputCls} />
          </Field>
          {hasAnyFilter && (
            <button
              onClick={() => navigate({ menu: '', entity: '', action: '', actor: '', from: '', to: '' })}
              className="h-9 rounded-9e-md border border-[var(--surface-border)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* ── table ── */}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <tr>
                <Th>เวลา</Th>
                <Th>เมนู</Th>
                <Th>ประเภท</Th>
                <Th>การกระทำ</Th>
                <Th>รายการ</Th>
                <Th>ก่อน → หลัง</Th>
                <Th>ผู้ดำเนินการ</Th>
                <Th center>สถานะ</Th>
              </tr>
            </thead>
            <tbody>
              {emptyState && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{emptyState.title}</p>
                    <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-[var(--text-muted)]">
                      {emptyState.body}
                    </p>
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const flags = perRow[i];
                const isOpen = openRow === r._id;
                return (
                  <RowPair
                    key={r._id}
                    row={r}
                    flags={flags}
                    isOpen={isOpen}
                    onToggle={() => setOpenRow(isOpen ? null : r._id)}
                    menuLabels={menuLabels}
                    entityLabels={entityLabels}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {(nextCursor || cursor) && (
          <div className="flex items-center justify-between border-t border-[var(--surface-border)] px-4 py-3">
            <button
              onClick={() => navigate({ cursor: '' })}
              disabled={!cursor}
              className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-40 hover:bg-[var(--surface-muted)]"
            >
              หน้าแรก
            </button>
            <button
              onClick={() => navigate({ cursor: nextCursor })}
              disabled={!nextCursor}
              className="rounded-9e-md bg-9e-navy px-4 py-1.5 text-xs font-semibold text-9e-ice disabled:opacity-40 hover:opacity-90"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>

      {/* ── coverage panel ── */}
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <button
          onClick={() => setShowCoverage((s) => !s)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          {showCoverage ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-semibold text-[var(--text-primary)]">ความครอบคลุมการบันทึก</span>
          <span className="text-xs text-[var(--text-muted)]">
            {coverage.length - emptyPairs.length} / {coverage.length} คู่ (เมนู, ประเภท) มีข้อมูลแล้ว
          </span>
        </button>
        {showCoverage && (
          <div className="border-t border-[var(--surface-border)] px-4 py-4">
            <p className="mb-3 rounded-9e-md bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              <strong>ส่วนใหญ่ยังว่างอยู่ — และนั่นคือเรื่องปกติ.</strong> ระบบกำลังทยอยติดตั้งการบันทึก
              ทีละเมนู (sweep) คู่ที่ยังไม่มีข้อมูลแปลว่า “ยังไม่ถึงคิว” หรือ “ยังไม่มีใครกดใช้งาน”
              ไม่ได้แปลว่าพัง รายการนี้มีไว้บอกว่าเหลือหน้าจอไหนที่ควรลองกดทดสอบ
            </p>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {coverage.map((c) => (
                <div key={`${c.menu}|${c.entity}`} className="flex items-center gap-2 text-xs">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full',
                    c.count > 0 ? 'bg-emerald-500' : 'bg-[var(--surface-border)]')} />
                  <span className={cn('truncate',
                    c.count > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>
                    {menuLabels[c.menu] ?? c.menu} · {c.label}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-[var(--text-muted)]">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── row ──────────────────────────────────────────────────────────────

function RowPair({ row, flags, isOpen, onToggle, menuLabels, entityLabels }) {
  // Severity, formatting and the expanded body all come from the shared
  // parts module — the widget renders the SAME ones inside a different
  // container. Only the <tr> layout is local to this page.
  const worst = rowSeverity(flags);

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]',
          severityRowClass(worst)
        )}
      >
        <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-secondary)]">
          {fmtWhen(row.createdAt)}
        </td>
        <td className="px-4 py-3 text-[var(--text-primary)]">
          {menuLabels[row.menu] ?? row.menu}
          {row.menuRaw ? (
            <span className="ml-1 font-mono text-xs text-rose-600">({row.menuRaw})</span>
          ) : null}
        </td>
        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
          {entityLabels[`${row.menu}|${row.entity}`] ?? row.entity ?? '—'}
        </td>
        <td className="px-4 py-3"><ActionChip action={row.action} /></td>
        <td className="max-w-[220px] px-4 py-3"><RecordIdentity row={row} /></td>
        {/*
          THE SAME DIFF LINE THE INLINE PANEL USES, and shared for the reason
          auditRowParts' own header gives: the two surfaces differ in their
          CONTAINER and in nothing inside it. A row with no recorded before/after
          renders an EMPTY CELL here rather than `— → —` — the column header
          still says what the column is, and a cell holding nothing is the honest
          rendering of a row that records the act and not the values. See
          `hasDiff` for why those rows are empty on purpose (PII).
        */}
        <td className="max-w-[200px] px-4 py-3"><AuditDiff row={row} /></td>
        <td className="px-4 py-3">
          <p className="text-[var(--text-primary)]">{row.actor?.name || '—'}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">{row.actor?.id || ''}</p>
        </td>
        <td className="px-4 py-3 text-center"><SeverityIcon level={worst} /></td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
          <td colSpan={8} className="px-4 py-4">
            <AuditRowDetail row={row} flags={flags} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── small pieces ─────────────────────────────────────────────────────

const inputCls =
  'h-9 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-primary)] ' +
  'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Th({ children, center }) {
  return (
    <th className={cn('px-4 py-3 text-xs font-medium text-[var(--text-secondary)]',
      center ? 'text-center' : 'text-left')}>
      {children}
    </th>
  );
}
