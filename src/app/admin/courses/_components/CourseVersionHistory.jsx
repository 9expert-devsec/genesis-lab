'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, FileText, AlertTriangle, ChevronRight } from 'lucide-react';
import { listCourseVersions, getCourseVersionDiff } from '@/lib/actions/course-versions';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { FIELD_KIND } from '@/lib/courses/courseVersionDiff';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONE byte formatter every admin surface uses. A private
// copy here is precisely what test/fs/webrootAdminPageWiring refuses, and that
// guard caught this file writing its own.
import { formatBytes } from '@/lib/formatBytes.mjs';

/**
 * ประวัติการแก้ไข — the course editor's third tab. READ ONLY.
 *
 * There is no restore, no rollback and no delete here, by ruling. A version
 * history that can also change things is a second write path into the course,
 * and nothing in this file calls anything that writes.
 *
 * ── IT LOADS WHEN IT IS OPENED, NOT WHEN THE PAGE IS ───────────────────────
 * The edit screen must not query version history on every page load — most
 * opens of that screen never touch this tab. `active` is the trigger: the fetch
 * runs on the first transition into the tab and not before, and the result is
 * kept afterwards so switching away and back does not re-query.
 *
 * The panel itself is MOUNTED THE WHOLE TIME, hidden by CSS like its two
 * siblings — that invariant is what keeps the form's FormData save and its
 * dirty check working, and it is pinned by test/render/courseEditorTabPanels.
 * So "did the tab open" cannot be inferred from being mounted, and `active` is
 * a prop rather than a mount effect.
 *
 * ── THE LIST NEVER RECEIVES A SNAPSHOT ─────────────────────────────────────
 * `listCourseVersions` projects `-snapshot`, and the changed-field summary it
 * returns is computed on the server. A snapshot is 7.5–20.3 KB per row today
 * and grows with every use of the rich editors; none of it crosses to the
 * browser here. Opening one version fetches only the fields that actually
 * CHANGED, never the two whole states.
 */

const dtf = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
});

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dtf.format(d);
}

/**
 * How a version names itself.
 *
 * `versionNumber` IS NULLABLE and null is a real, expected state — the writer
 * falls back to an unnumbered row rather than lose a snapshot when it cannot
 * win a number under concurrency. An unnumbered row is named by its date, never
 * by a placeholder like "เวอร์ชัน —", which reads as a rendering bug.
 */
export function versionTitle(row) {
  if (row?.kind === 'file_replacement') return 'แทนที่ไฟล์';
  return Number.isFinite(row?.versionNumber) ? `เวอร์ชัน ${row.versionNumber}` : 'เวอร์ชัน (ไม่มีหมายเลข)';
}

// ── value rendering ─────────────────────────────────────────────────────────

/** A missing side of a comparison. Never an empty string, which reads as a bug. */
function Empty() {
  return <span className="italic text-[var(--text-muted)]">(ว่าง)</span>;
}

function ScalarValue({ value, kind }) {
  if (value === null || value === undefined || value === '') return <Empty />;
  if (kind === FIELD_KIND.BOOL) return <>{value ? 'เปิด' : 'ปิด'}</>;
  if (kind === FIELD_KIND.NUMBER) return <>{String(value)}</>;
  if (Array.isArray(value)) return <>{value.length === 0 ? <Empty /> : `${value.length} รายการ`}</>;
  if (typeof value === 'object') return <>{JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

/**
 * A LIST field, rendered as its lines rather than a count.
 *
 * "6 รายการ → 4 รายการ" tells the admin a number and not which line went. The
 * lines are short by nature (an objective, a tag, a skill) so all of them are
 * shown.
 */
function ListValue({ value }) {
  const items = Array.isArray(value) ? value : [];
  if (items.length === 0) return <Empty />;
  return (
    <ol className="list-inside list-decimal space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="text-xs leading-relaxed">
          {typeof item === 'string' ? item : JSON.stringify(item)}
        </li>
      ))}
    </ol>
  );
}

/**
 * TRAINING TOPICS — titles and their bullet bodies.
 *
 * The single biggest thing the audit log records only as a count, and the
 * reason this history exists as a separate collection. Rendered in full.
 */
function TopicsValue({ value }) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return <Empty />;
  return (
    <ol className="list-inside list-decimal space-y-2">
      {rows.map((t, i) => (
        <li key={i} className="text-xs leading-relaxed">
          <span className="font-medium">{t?.title || <Empty />}</span>
          {Array.isArray(t?.bullets) && t.bullets.length > 0 && (
            <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[var(--text-secondary)]">
              {t.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function GalleryValue({ value }) {
  const items = Array.isArray(value) ? value : [];
  if (items.length === 0) return <Empty />;
  return (
    <ul className="space-y-0.5 text-xs">
      {items.map((g, i) => (
        <li key={i}>
          <span className="text-[var(--text-muted)]">{g?.type ?? '?'}</span>{' '}
          {g?.videoId || g?.url || '—'}
        </li>
      ))}
    </ul>
  );
}

/**
 * RICH TEXT — the reason this tab took the full width rather than the rail.
 *
 * Shown as its stored markup in a wrapping, scroll-capped block. NOT rendered
 * as HTML: this is a record of what was stored, and running it through
 * dangerouslySetInnerHTML would both execute admin-authored markup inside the
 * admin and make two visually identical values impossible to tell apart.
 */
function RichValue({ value }) {
  if (value === null || value === undefined || value === '') return <Empty />;
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text-primary)]">
      {String(value)}
    </pre>
  );
}

function Value({ value, kind }) {
  if (kind === FIELD_KIND.RICH) return <RichValue value={value} />;
  if (kind === FIELD_KIND.LIST) return <ListValue value={value} />;
  if (kind === FIELD_KIND.TOPICS) return <TopicsValue value={value} />;
  if (kind === FIELD_KIND.GALLERY) return <GalleryValue value={value} />;
  return <ScalarValue value={value} kind={kind} />;
}

/**
 * ONE CHANGED FIELD: label, then old → new.
 *
 * Short values sit side by side; anything long stacks, because two 4 KB rich
 * bodies in adjacent columns are two unreadable columns. The arrow is the
 * same `→` the audit log uses, so the two surfaces read alike.
 */
function ChangeBlock({ change }) {
  const stacked =
    change.kind === FIELD_KIND.RICH ||
    change.kind === FIELD_KIND.TOPICS ||
    change.kind === FIELD_KIND.LIST ||
    change.kind === FIELD_KIND.GALLERY;

  return (
    <div className="border-b border-[var(--surface-border)] py-3 last:border-b-0">
      <p className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">{change.label}</p>
      <div className={stacked ? 'space-y-2' : 'flex flex-wrap items-baseline gap-2 text-sm'}>
        <div className={stacked ? '' : 'min-w-0'}>
          {stacked && <p className="mb-1 text-xs text-[var(--text-muted)]">ก่อน</p>}
          <div className="text-[var(--text-secondary)] line-through decoration-1">
            <Value value={change.before} kind={change.kind} />
          </div>
        </div>
        {!stacked && <span className="text-[var(--text-muted)]">→</span>}
        <div className={stacked ? '' : 'min-w-0'}>
          {stacked && <p className="mb-1 text-xs text-[var(--text-muted)]">หลัง</p>}
          <div className="text-[var(--text-primary)]">
            <Value value={change.after} kind={change.kind} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A FILE REPLACEMENT, RENDERED AS AN EVENT — never as a diff.
 *
 * It carries no snapshot and there is nothing to compare: the outline path is
 * derived from the course code and the upload overwrites in place, so the
 * stored string is byte-identical before and after. The size, the timestamp and
 * the file version are what make the change visible at all, so they are the
 * whole of what this shows.
 */
function FileEvent({ file }) {
  if (!file) return <p className="text-sm text-[var(--text-secondary)]">ไม่มีรายละเอียดไฟล์</p>;
  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-9e-action" aria-hidden="true" />
        <p className="text-sm font-semibold text-9e-navy dark:text-white">
          แทนที่ไฟล์เนื้อหาหลักสูตร ({String(file.lang || '').toUpperCase()})
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div><dt className="inline text-[var(--text-muted)]">ไฟล์: </dt><dd className="inline">{file.filename || '—'}</dd></div>
        <div><dt className="inline text-[var(--text-muted)]">ขนาด: </dt><dd className="inline">{formatBytes(Number(file.bytes) || 0) || '—'}</dd></div>
        <div><dt className="inline text-[var(--text-muted)]">เวอร์ชันไฟล์: </dt><dd className="inline">{file.outlineVersion ?? '—'}</dd></div>
        <div><dt className="inline text-[var(--text-muted)]">เวลาอัปโหลด: </dt><dd className="inline">{when(file.uploadedAt)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        ไฟล์ถูกเขียนทับที่ตำแหน่งเดิม — ที่อยู่ไฟล์ไม่เปลี่ยน จึงไม่มีการเปรียบเทียบเนื้อหา
        และระบบไม่ได้เก็บไฟล์เวอร์ชันก่อนหน้าไว้
      </p>
    </div>
  );
}

/**
 * WHY IT IS EMPTY, not merely that it is.
 *
 * Almost every course will render this for a long time: the write path shipped
 * only recently, and history begins at that deploy with no backfill. An admin
 * meeting a bare "ไม่มีข้อมูล" on a course they have edited for years will
 * report it as a bug — correctly, as far as they can tell. So the panel says
 * what the silence means.
 */
function EmptyState() {
  return (
    <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-6 text-center">
      <p className="text-sm font-medium text-9e-navy dark:text-white">ยังไม่มีประวัติสำหรับหลักสูตรนี้</p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
        ระบบเริ่มบันทึกประวัติเมื่อมีการติดตั้งฟีเจอร์นี้ การแก้ไขที่เกิดขึ้น
        <strong className="font-semibold"> ก่อนหน้านั้นไม่ได้ถูกบันทึกไว้ </strong>
        และไม่สามารถย้อนกลับไปเก็บได้ — จึงไม่ใช่ข้อผิดพลาด
      </p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        เวอร์ชันแรกจะถูกสร้างขึ้นเมื่อกดบันทึกหลักสูตรนี้ครั้งถัดไป
      </p>
    </div>
  );
}

/** One row in the list. */
function VersionRow({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={
        'flex w-full items-start gap-3 rounded-9e-md border px-3 py-2.5 text-left transition-colors ' +
        (selected
          ? 'border-9e-action bg-9e-ice dark:bg-[#0D1B2A]'
          : 'border-[var(--surface-border)] hover:bg-9e-ice dark:hover:bg-[#0D1B2A]')
      }
    >
      <ChevronRight
        className={'mt-0.5 h-4 w-4 flex-shrink-0 transition-transform ' + (selected ? 'rotate-90 text-9e-action' : 'text-[var(--text-muted)]')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-9e-navy dark:text-white">{versionTitle(row)}</span>
          <span className="text-xs text-[var(--text-muted)]">{when(row.createdAt)}</span>
          {row.actorName && <span className="text-xs text-[var(--text-secondary)]">โดย {row.actorName}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
          {row.kind === 'file_replacement'
            ? `แทนที่ไฟล์ ${String(row.file?.lang || '').toUpperCase()}`
            : row.summary || 'ไม่มีการเปลี่ยนแปลงที่เทียบได้'}
        </span>
        {row.preImageMissing && (
          <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            ไม่ได้บันทึกสถานะก่อนหน้าไว้
          </span>
        )}
      </span>
    </button>
  );
}

export function CourseVersionHistory({ courseId, active = false }) {
  const [state, setState] = useState({ status: 'idle', rows: [], reason: null });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ status: 'idle', data: null });

  /**
   * The load runs on the FIRST activation and never again. `status` carries
   * that: once it leaves 'idle' this effect stops firing a fetch, so switching
   * to another tab and back re-uses what is already here.
   */
  useEffect(() => {
    if (!active || state.status !== 'idle' || !courseId) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    listCourseVersions({ courseId })
      .then((res) => {
        if (cancelled) return;
        setState(res?.ok
          ? { status: 'ready', rows: res.rows ?? [], reason: null }
          : { status: 'error', rows: [], reason: res?.reason ?? 'error' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', rows: [], reason: 'error' }); });
    return () => { cancelled = true; };
  }, [active, courseId, state.status]);

  const select = useCallback((id) => {
    if (id === selectedId) { setSelectedId(null); return; }
    setSelectedId(id);
    setDetail({ status: 'loading', data: null });
    getCourseVersionDiff({ versionId: id })
      .then((res) => setDetail(res?.ok ? { status: 'ready', data: res } : { status: 'error', data: null }))
      .catch(() => setDetail({ status: 'error', data: null }));
  }, [selectedId]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> กำลังโหลดประวัติ…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="py-8 text-sm text-red-700">
        {state.reason === 'forbidden'
          ? 'คุณไม่มีสิทธิ์ดูประวัติของหลักสูตรนี้'
          : 'โหลดประวัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
      </p>
    );
  }

  if (state.rows.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-secondary)]">
        แสดง {state.rows.length} เวอร์ชันล่าสุด — เลือกเวอร์ชันเพื่อดูว่ามีอะไรเปลี่ยนจากเวอร์ชันก่อนหน้า
      </p>

      {state.rows.map((row) => (
        <div key={row.id}>
          <VersionRow row={row} selected={row.id === selectedId} onSelect={select} />

          {row.id === selectedId && (
            <div className="mt-1 rounded-9e-md border border-[var(--surface-border)] p-4">
              {detail.status === 'loading' && (
                <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> กำลังเปรียบเทียบ…
                </p>
              )}
              {detail.status === 'error' && (
                <p className="text-sm text-red-700">เปรียบเทียบไม่สำเร็จ</p>
              )}
              {detail.status === 'ready' && detail.data && (
                <VersionDetail data={detail.data} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The detail body — an event, a reason there is nothing to compare, or a diff.
 *
 * The three are mutually exclusive and are decided here in one place, because
 * the difference between "nothing changed" and "we could not know what changed"
 * is exactly what a version history is for.
 */
export function VersionDetail({ data }) {
  if (data.kind === 'file_replacement') return <FileEvent file={data.file} />;

  if (data.preImageMissing) {
    return (
      <div className="flex items-start gap-2 rounded-9e-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>
          ไม่ได้บันทึกสถานะก่อนหน้าของเวอร์ชันนี้ไว้ — ระบบอ่านข้อมูลเดิมไม่สำเร็จในตอนที่บันทึก
          จึงไม่สามารถเปรียบเทียบได้ การบันทึกครั้งนั้นสำเร็จตามปกติ
        </span>
      </div>
    );
  }

  if (data.previousMissing) {
    return (
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
        นี่คือเวอร์ชันแรกที่ระบบบันทึกไว้ จึงไม่มีเวอร์ชันก่อนหน้าให้เปรียบเทียบ
      </p>
    );
  }

  if (!data.changes || data.changes.length === 0) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">
        ไม่พบความแตกต่างจากเวอร์ชันก่อนหน้าในฟิลด์ที่ระบบติดตาม
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-[var(--text-muted)]">
        เปลี่ยนแปลง {data.changes.length} ฟิลด์
        {Number.isFinite(data.previousVersionNumber) ? ` เทียบกับเวอร์ชัน ${data.previousVersionNumber}` : ''}
      </p>
      {data.changes.map((c) => <ChangeBlock key={c.key} change={c} />)}
    </div>
  );
}
