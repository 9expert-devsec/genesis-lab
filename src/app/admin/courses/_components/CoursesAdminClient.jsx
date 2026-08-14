'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { deleteCourse } from '@/lib/actions/courses';
import { saveProgramCourseOrder } from '@/lib/actions/program-order';
import { courseListQuery, withListQuery } from '@/lib/courses/adminListQuery';
import { resolveCourseStatusBadge } from '@/lib/courses/courseStatusBadge';
import { groupCoursesByProgram } from '@/lib/courses/groupCoursesByProgram';
import {
  canReorderCourseGroups,
  orderedCodesForGroup,
  REORDER_BLOCKED,
} from '@/lib/courses/courseOrderEditing';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';

const TYPE_OPTIONS = [
  { value: '',         label: 'ทุกประเภท' },
  { value: 'public',   label: 'Public' },
  { value: 'inhouse',  label: 'In-house' },
];

/**
 * ── THE FILTERS ARE PROPS, AND THE URL IS WRITTEN IN ONE PLACE ──────────────
 *
 * `q`, `program` and `type` are read from `searchParams` by page.jsx and passed
 * down. They were `useState(() => searchParams.get(…))` — lazily seeded from the
 * URL, then written back with `window.history.replaceState` — which is the
 * shape test/fs/urlFilterNoState recorded as OUTSTANDING for this file.
 *
 * WHAT THAT SEEDING COST. The lazy initialiser runs once per mounted instance,
 * so any navigation that KEPT the instance left the state holding the old
 * value while the URL held the new one. Following a second filtered link from
 * the sidebar, or pressing Back, showed a table filtered by one thing and a
 * toolbar claiming another. And because `listQuery` is re-serialised from those
 * same values into every row's แก้ไข link, the stale value was written back —
 * the edit page's ← control carried the filter the admin had just left.
 *
 * ── WHY THE ROUND-TRIP OBJECTION NO LONGER APPLIES ─────────────────────────
 * The replaced comment argued, correctly, that `router.replace` re-runs the
 * server component on every keystroke — a round-trip per character for a list
 * filtered entirely on the client. That objection is about WRITING ON EVERY
 * KEYSTROKE, not about the URL owning the filter. So the search box no longer
 * writes on every keystroke: it is uncontrolled and commits on Enter or blur,
 * exactly as AuditLogClient's free-text field does. The selects commit
 * immediately because a select IS a completed decision.
 *
 * The cost is now one server render per deliberate filter action, where it was
 * zero. That is a real cost and it is stated rather than buried: this page is
 * `force-dynamic` and each render re-reads upstream courses, extensions and
 * programs. It buys a URL that survives a reload, a Back, and a pasted link —
 * and a toolbar that cannot disagree with its own table.
 *
 * THE LIST IS STILL FILTERED ON THE CLIENT. Moving the filter into the query
 * would change what `courses.length` means in the counter and what the folder
 * counts count; that is a separate decision and is not taken here.
 */
export function CoursesAdminClient({
  courses,
  extensions,
  programs = [],
  // programId (the CODE) → its stored `courseOrder`. `null` when the order
  // could not be read or nothing is seeded — every row is then unlisted.
  programCourseOrder = null,
  programNames = {},
  q = '',
  program = '',
  type = '',
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, startTransition] = useTransition();

  const listQuery = courseListQuery({ q, program, type });

  /**
   * The next URL, serialised FROM THE PROPS — the one and only writer.
   *
   * Same shape as AuditLogClient, WebhookLogsClient and DashboardClient, which
   * are the reference implementations this file is brought into line with.
   */
  const navigate = useCallback(
    (overrides = {}) => {
      const next = { q, program, type, ...overrides };
      const params = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        const value = String(v ?? '').trim();
        if (value) params.set(k, value);
      });
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [router, pathname, q, program, type]
  );

  /**
   * THE FILTER'S PROGRAM KEY IS `_id`; THE ORDER'S IS `program_id`.
   *
   * Both are reachable from `course.program` and they are NOT interchangeable.
   * The dropdown has always carried the ObjectId, and `?program=<_id>` is in
   * links the edit pages already hand back — changing it would break every one
   * of those. The stored order is keyed by the CODE, because that is what
   * `ProgramOrder.programId` holds. So this local accessor stays on `_id` and
   * everything about RANK goes through `programKeyOf` in lib/courses/courseOrder,
   * which is the only reader of the other key.
   */
  function programIdOf(course) {
    const p = course?.program;
    if (!p) return '';
    return String(p?._id ?? p);
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter((c) => {
      const matchSearch =
        !needle ||
        (c.course_name || '').toLowerCase().includes(needle) ||
        (c.course_name_th || '').toLowerCase().includes(needle) ||
        (c.course_id || '').toLowerCase().includes(needle);
      const matchProgram = !program || programIdOf(c) === program;
      const matchType =
        !type ||
        (type === 'public'  && c.course_type_public) ||
        (type === 'inhouse' && c.course_type_inhouse);
      return matchSearch && matchProgram && matchType;
    });
  }, [courses, q, program, type]);

  /**
   * Folders. Grouped AFTER filtering, so a folder's count is what the admin can
   * see in it rather than what exists behind the filter — a count that does not
   * match the rows under it is the defect this ordering avoids.
   *
   * The positions are NOT recomputed from the filtered array: they come from the
   * stored list, so filtering to one course still shows that course's real
   * ลำดับ instead of renumbering it to 1. See lib/courses/groupCoursesByProgram.
   */
  const groups = useMemo(
    () => groupCoursesByProgram(filtered, { programCourseOrder, programNames }),
    [filtered, programCourseOrder, programNames]
  );

  // Whether a drag may be offered at all, and if not, which reason to show.
  // See lib/courses/courseOrderEditing.js — a save writes the WHOLE group, so a
  // narrowed view or an absent stored order must not be able to write one.
  const reorder = canReorderCourseGroups({ programCourseOrder, q, type });

  async function handleDelete(course) {
    const ok = window.confirm(
      `ลบหลักสูตร "${course.course_name_th || course.course_name}" ?\nการลบจะไม่สามารถย้อนกลับได้`
    );
    if (!ok) return;

    setBusyId(course._id);
    setMsg(null);
    try {
      const res = await deleteCourse(course._id);
      if (res?.ok) {
        setMsg({ type: 'ok', text: 'ลบสำเร็จ' });
        startTransition(() => router.refresh());
      } else {
        setMsg({ type: 'err', text: res?.error ?? 'ลบไม่สำเร็จ' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err?.message ?? 'ลบไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* ── Filter bar ────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50"
            aria-hidden="true"
          />
          {/* UNCONTROLLED, committing on Enter or blur — see the header. The
              `key` is what keeps it honest: when the URL's `q` changes the
              input is a new element, so it cannot go on showing a term the
              table is not filtered by. Safe here, unlike on a debounced box,
              because nothing writes the URL while the admin is still typing. */}
          <input
            key={q}
            type="text"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate({ q: e.currentTarget.value });
              }
            }}
            onBlur={(e) => e.target.value !== q && navigate({ q: e.target.value })}
            placeholder="ค้นหาชื่อหลักสูตรหรือ Course ID... (Enter เพื่อค้นหา)"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white pl-8 pr-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <select
          value={program}
          onChange={(e) => navigate({ program: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="">ทุกโปรแกรม</option>
          {programs.map((p) => {
            const id = String(p._id ?? p.program_id ?? '');
            const label =
              p.program_name ?? p.name ?? p.label ?? id;
            return (
              <option key={id} value={id}>{label}</option>
            );
          })}
        </select>

        <select
          value={type}
          onChange={(e) => navigate({ type: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {filtered.length} / {courses.length} หลักสูตร
        </span>
      </div>

      {msg && (
        <div
          className={
            'mb-3 rounded-9e-md px-3 py-2 text-sm ' +
            (msg.type === 'ok'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700')
          }
        >
          {msg.text}
        </div>
      )}

      {/* ── WHAT THIS SCREEN DOES NOT DO, SAID ON THE SCREEN ────────────────
          The admin is arranging ONE of the two dimensions a course sits in. A
          course holds a position in its program's list and an INDEPENDENT one
          in each skill list it belongs to (up to three), and nothing here
          touches the second. Nor does the mega menu follow immediately — it
          renders from the nav_menu_cache snapshot, not from a live read.

          Stated in the UI rather than in this comment because the admin is the
          one who will be surprised, and a field that stays silent about its own
          reach is how the last round's defect happened. */}
      {reorder.allowed && (
        <div className="mb-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">ลากเพื่อจัดลำดับได้เฉพาะภายในโปรแกรมเดียวกัน</span>
          {' — '}
          ลำดับนี้ใช้กับ <strong>หน้าโปรแกรม</strong> เท่านั้น
          <strong> ไม่มีผลกับหน้า Skill และคอลัมน์ Skill ในเมกะเมนู</strong> ซึ่งเก็บลำดับแยกของตัวเอง
          <br />
          เมกะเมนูอ่านจาก snapshot จึงจะยังไม่เปลี่ยนจนกว่าจะมีการ sync ครั้งถัดไป — สั่ง sync ได้ที่{' '}
          <Link href="/admin/cache" className="font-semibold text-9e-action hover:underline">
            /admin/cache
          </Link>
        </div>
      )}

      {/* Why the handles are absent, when they are. An admin who saw drag
          handles yesterday and none today needs the reason, not a guess. */}
      {!reorder.allowed && reorder.reason === REORDER_BLOCKED.FILTERED && (
        <div className="mb-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          ปิดการจัดลำดับชั่วคราวเพราะกำลังกรองรายการอยู่ — การบันทึกจะเขียนสมาชิกทั้งกลุ่ม
          ถ้าบันทึกขณะกรอง หลักสูตรที่ถูกกรองออกจะหายไปจากลำดับ ล้างช่องค้นหาและตัวกรองประเภทเพื่อจัดลำดับ
        </div>
      )}

      {/* The order could not be read, or nothing is seeded. Said out loud
          rather than rendered as a column of dashes nobody can interpret —
          `null` is a real state with two causes, and both mean the public site
          is serving UPSTREAM order right now. See lib/courses/courseOrderStore. */}
      {programCourseOrder === null && (
        <div className="mb-3 rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          ยังไม่มีลำดับที่บันทึกไว้ — อ่านลำดับไม่สำเร็จ หรือยังไม่ได้ seed
          ขณะนี้ทุกหลักสูตรแสดงเป็น &ldquo;ยังไม่จัดลำดับ&rdquo; และเว็บไซต์กำลังเรียงตามลำดับของต้นทาง
        </div>
      )}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
          {/* min-w so the seventh column cannot squeeze the others instead of
              scrolling. The wrapper is already overflow-x-auto; without a floor
              `w-full` compresses every cell to fit, which is how the admin
              ARTICLES list clipped its rightmost column before it was given the
              same floor (ArticlesAdminClient.jsx:322). */}
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-[var(--surface-muted)]">
              <tr className="border-b border-[var(--surface-border)] text-left">
                {/* The course's index in its program's stored courseOrder.
                    Draggable only when the whole group is on screen and a
                    stored order exists — see courseOrderEditing.js. */}
                <th className="w-16 px-4 py-3 text-right font-medium text-[var(--text-secondary)]">ลำดับ</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">Course ID</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">ชื่อหลักสูตร</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">URL Alias</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">Tags</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">Gallery</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">จัดการ</th>
              </tr>
            </thead>
            {filtered.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    {courses.length === 0
                      ? 'ไม่สามารถโหลดรายการหลักสูตรได้ — ลองรีเฟรช หรือดู console log'
                      : 'ไม่พบหลักสูตรที่ตรงกับตัวกรอง'}
                  </td>
                </tr>
              </tbody>
            )}
            {/* ONE <tbody> PER FOLDER. A grouping header row inside a single
                body would be a row pretending to be a heading; a body per group
                is what the element is for, and it keeps the header row from
                being counted as a course by anything walking rows. */}
            {groups.map((group) => (
              <ProgramGroupBody
                /**
                 * KEYED BY THE GROUP'S CODE SEQUENCE, not just its id.
                 *
                 * ProgramGroupBody seeds `useDragReorder` from its rows, and that
                 * hook owns the array in state. When the server sends a new order
                 * — after a save, or a refresh — a stable key would keep the old
                 * state and the table would show the pre-save arrangement over
                 * post-save data. Changing the key remounts it with the server's
                 * truth, which is the whole point of remounting rather than
                 * syncing: there is no window in which the two disagree.
                 */
                key={`${group.programId || '(none)'}:${group.rows.map((r) => r.course.course_id).join(',')}`}
                group={group}
                extensions={extensions}
                listQuery={listQuery}
                busyId={busyId}
                onDelete={handleDelete}
                canReorder={reorder.allowed}
              />
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * One program folder: its header, its rows, and — when reordering is permitted
 * — the drag state and the save.
 *
 * ── ITS OWN COMPONENT BECAUSE THE HOOK IS PER GROUP ────────────────────────
 * `useDragReorder` owns one array. There is one array per folder, and hooks
 * cannot be called in a loop, so each folder has to be a component. That is the
 * mechanical reason; the useful consequence is that a drag in one program can
 * never move a row in another, because the two arrays never meet.
 *
 * ── THE NUMBER WHILE DIRTY ─────────────────────────────────────────────────
 * Unsaved, the column shows the position the row WOULD get — its index in the
 * arranged array — because that is what the save is about to write, and showing
 * the pre-drag number over post-drag rows would be a lie in the other
 * direction. Saved and clean, it goes back to the stored position from
 * groupCoursesByProgram, unlisted marker and all. Nothing renumbers from render
 * position in the clean state, which is the rule f596901 established.
 *
 * A dirty group therefore shows every row numbered, including ones that were
 * ยังไม่จัดลำดับ a moment ago. That is correct and it is the point: saving
 * ADOPTS them. The banner above the buttons says so rather than leaving the
 * admin to infer it from a marker that quietly disappeared.
 */
function ProgramGroupBody({
  group,
  extensions,
  listQuery,
  busyId,
  onDelete,
  canReorder,
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const { items, draggingIndex, dragOverIndex, getDragProps, resetItems } =
    useDragReorder(group.rows, () => setDirty(true));

  const cancel = () => {
    resetItems(group.rows);
    setDirty(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // The COMPLETE membership of this group, in the arranged order — see
      // lib/courses/courseOrderEditing.js. Built from the rendered rows, which
      // is what the admin agreed to, and normalised there so the list the screen
      // renumbers from is the list that was written.
      const res = await saveProgramCourseOrder(group.programId, orderedCodesForGroup(items));
      if (res?.ok) {
        setDirty(false);
        // The server re-renders with the stored order, the key above changes,
        // and this component remounts on it.
        router.refresh();
      } else {
        setError(res?.error ?? 'บันทึกลำดับไม่สำเร็จ');
      }
    } catch (err) {
      setError(err?.message ?? 'บันทึกลำดับไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tbody className="border-b border-[var(--surface-border)] last:border-b-0">
      <tr className="bg-[var(--surface-muted)]">
        <th
          colSpan={8}
          scope="colgroup"
          className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-secondary)]"
        >
          <span className="inline-flex w-full flex-wrap items-center gap-2">
            <span>{group.programName}</span>
            <span className="font-normal tabular-nums text-[var(--text-muted)]">
              {group.count} หลักสูตร
            </span>
            {dirty && (
              <span className="ml-auto inline-flex items-center gap-2">
                <span className="font-normal text-amber-700 dark:text-amber-300">
                  ยังไม่บันทึก — การบันทึกจะเขียนลำดับของทั้งกลุ่ม
                  {group.rows.some((r) => r.unlisted) && ' และรับหลักสูตรที่ยังไม่จัดลำดับเข้าลำดับ'}
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded bg-9e-action px-2.5 py-1 text-xs font-bold text-white hover:bg-9e-brand disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก…' : 'บันทึกลำดับ'}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  className="rounded border border-[var(--surface-border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </span>
            )}
            {error && (
              <span className="ml-auto font-normal text-red-600 dark:text-red-400">{error}</span>
            )}
          </span>
        </th>
      </tr>
      {items.map((row, index) => (
        <CourseRow
          key={row.course.course_id}
          row={row}
          index={index}
          dirty={dirty}
          canReorder={canReorder}
          dragProps={canReorder ? getDragProps(index) : null}
          isDragging={draggingIndex === index}
          isDragOver={dragOverIndex === index && draggingIndex !== index}
          ext={extensions[row.course.course_id]}
          listQuery={listQuery}
          busy={busyId === row.course._id}
          onDelete={onDelete}
        />
      ))}
    </tbody>
  );
}

/** One course row. Extracted so the drag body and the read-only body cannot
 *  drift into two different tables. */
function CourseRow({
  row, index, dirty, canReorder, dragProps, isDragging, isDragOver,
  ext, listQuery, busy, onDelete,
}) {
  const { course, position, unlisted } = row;
  const status = resolveCourseStatusBadge(ext);
  return (
    <tr
      {...(dragProps ?? {})}
      className={
        'border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]'
        + (isDragging ? ' opacity-40' : '')
        + (isDragOver ? ' border-t-2 border-t-9e-action' : '')
      }
    >
      {/* Clean: the position in the STORED list, restarting at 1 in every
          folder, with an unlisted course MARKED rather than numbered. Dirty:
          the position this row is about to be written to. Never the render
          index in the clean state — see the note on the component. */}
      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
        <span className="inline-flex items-center justify-end gap-1">
          {canReorder && <DragHandle className="shrink-0" />}
          {dirty ? (
            <span className="font-semibold text-9e-action">{index + 1}</span>
          ) : unlisted ? (
            <span
              className="whitespace-nowrap rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
              title="ยังไม่อยู่ในลำดับของโปรแกรมนี้ — จะแสดงก่อนหลักสูตรที่จัดลำดับแล้ว"
            >
              ยังไม่จัดลำดับ
            </span>
          ) : (
            position
          )}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
        {course.course_id}
      </td>
      <td className="px-4 py-3 text-[var(--text-primary)]">
        {course.course_name_th || course.course_name}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
        {ext?.urlAlias || <span className="text-[var(--text-muted)]">—</span>}
      </td>
      {/* Publication state. Read from the SAME `extensions` map the alias above
          uses — the server component already batches that in one query, so this
          column adds no read and nothing per-row. The mapping is total, so this
          cell can never be blank; see lib/courses/courseStatusBadge. */}
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium '
            + status.badge
          }
        >
          <span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + status.dot} />
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
        {ext?.tags?.length ?? 0}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
        {ext?.gallery?.length ?? 0}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-1">
          <Link
            // Carries the filter so the editor's ← can bring it back. Miss this
            // link and the filter dies here.
            href={withListQuery(
              `/admin/courses/${encodeURIComponent(course._id)}/edit`,
              listQuery
            )}
            className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            แก้ไข
          </Link>
          <button
            type="button"
            onClick={() => onDelete(course)}
            disabled={busy}
            className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? '…' : 'ลบ'}
          </button>
        </div>
      </td>
    </tr>
  );
}
