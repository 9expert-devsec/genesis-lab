'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  deleteFeaturedCourse,
  updateFeaturedCourse,
} from '@/lib/actions/featured-courses';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import { useAddedRowSink } from '@/app/admin/_components/AddedRowChannel';
import { insertFeaturedRow } from '@/lib/featuredListOrder';

/**
 * DEFERRED (STAGED) REORDER, matching the shape
 * courses/_components/CoursesAdminClient.jsx's ProgramGroupBody already
 * uses: dirty / error / saving state, an explicit save + cancel pair, and
 * resetItems() to revert. The wording is NOT copied — ProgramGroupBody's
 * "การบันทึกจะเขียนลำดับของทั้งกลุ่ม" describes a whole-group-membership
 * replacement, which is what /admin/courses writes and this screen does not:
 * this screen writes one `sort_order` per CHANGED row, so a save here can
 * never drop a course that was filtered out of view (there is no filter on
 * this list to begin with).
 *
 * WHAT WAS TRUE BEFORE THIS CHANGE, AND WHY IT MATTERED: dropping a row
 * wrote to Mongo immediately, with zero visible feedback (busyId was set to
 * a sentinel, '__reorder__', that nothing in this file's render ever
 * compared against — confirmed by grep before this change, and removed
 * rather than wired to something, since there is nothing left to gate on
 * it: reordering no longer performs any network call by itself). A failed
 * write became a silent unhandled promise rejection while the row stayed
 * moved on screen. The ↑/↓ buttons were worse on a PARTIAL failure: two
 * paired writes ran via Promise.all, and if exactly one of the pair failed
 * the database ended up with a half-completed swap while the screen — which
 * only applied its local update AFTER both awaits resolved — showed neither
 * row moved and no error. Staging removes this failure mode entirely: no
 * write of any kind happens until the admin presses "บันทึกลำดับ", so there
 * is nothing to leave half-done from a drag or a button click.
 */
export function FeaturedCourseList({ courses: initial }) {
  const {
    items: courses,
    setItems: setCourses,
    resetItems,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initial, () => setDirty(true));

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // The last known-good (saved) order — what Cancel reverts to, and what a
  // save's diff is computed against. Starts as the page's initial prop and
  // is advanced only on a FULLY successful save or a clean (non-dirty)
  // channel splice; never touched by a partial failure, so a retry re-diffs
  // against the same pre-drag order and simply re-sends the same batch
  // (idempotent — re-writing a sort_order that already landed is a no-op).
  const baselineRef = useRef(initial);

  /**
   * ADD-WHILE-STAGED (R1e). The add form is a SIBLING under the server page
   * (page.jsx), outside this commit's file scope — it cannot be reached or
   * disabled from here. What CAN be enforced here is the safety property: a
   * channel splice must never land into a dirty list, because the server
   * assigned the new row's sort_order against the OLD (pre-drag) order, and
   * placing it into the STAGED array would silently misrepresent what the
   * admin is about to write. So a splice that arrives while dirty is queued
   * rather than dropped or applied, and flushed the moment the list goes
   * clean again (save succeeds, or cancel reverts) — lossless either way.
   * The banner below states this to the admin; it cannot greet the ADD
   * FORM's own button, which lives in a file this commit does not touch.
   */
  const [pendingAdds, setPendingAdds] = useState([]);

  useAddedRowSink((doc) => {
    if (dirty) {
      setPendingAdds((cur) => [...cur, doc]);
      return;
    }
    setCourses((cur) => {
      const next = insertFeaturedRow(cur, doc);
      baselineRef.current = next;
      return next;
    });
  });

  useEffect(() => {
    if (dirty || pendingAdds.length === 0) return;
    setCourses((cur) => {
      let next = cur;
      for (const doc of pendingAdds) next = insertFeaturedRow(next, doc);
      baselineRef.current = next;
      return next;
    });
    setPendingAdds([]);
    // Runs once per dirty→false transition with a queue to flush; courses is
    // read via the updater form above so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  /**
   * LEAVING WITH UNSAVED CHANGES (R1f). ProgramGroupBody (the pattern this
   * follows) has NO guard for this at all — confirmed by reading it: no
   * beforeunload, no navigation interception — so there was nothing to copy.
   * What follows is a beforeunload handler ONLY, which is a PARTIAL guard,
   * stated plainly rather than implied: beforeunload fires for a real page
   * unload (tab close, reload, typed URL) but does NOT fire for Next.js
   * client-side navigation — clicking a sidebar <Link> or any router.push
   * elsewhere in the admin shell will still discard a staged reorder here
   * with no warning. Closing that gap fully would mean intercepting clicks
   * app-wide the way CourseForm.jsx's guard does, which is a bigger change
   * than this ticket scopes and is not attempted here.
   */
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  function cancel() {
    resetItems(baselineRef.current);
    setDirty(false);
    setError(null);
  }

  /**
   * SAVE (R1b). Per-row `sort_order = index` writes — the SAME shape as
   * before, not a whole-list replacement — sent via Promise.allSettled so a
   * partial failure is identifiable rather than an opaque rejection. On any
   * failure: name which courses did not save, leave `dirty` true, and leave
   * `courses` exactly as arranged so the admin can simply press save again
   * (a retry re-sends the full changed set; already-landed writes are
   * idempotent no-ops).
   *
   * `skipSync` (R1h) — the per-row writes below suppress
   * updateFeaturedCourse's own triggerLandingSync() on every call except
   * one, so a save with N changed rows still schedules exactly one
   * landing-snapshot rebuild instead of N overlapping ones. See the
   * skipSync note on updateFeaturedCourse itself for why picking "the first
   * call" is safe despite Promise.allSettled running them concurrently.
   */
  async function handleSave() {
    setSaving(true);
    setError(null);

    const prevIndex = new Map(baselineRef.current.map((c, idx) => [c._id, idx]));
    const changed = courses
      .map((c, newIdx) => ({ course: c, newIdx }))
      .filter(({ course, newIdx }) => prevIndex.get(course._id) !== newIdx);

    if (changed.length === 0) {
      // Dragged back to the original order, or a save retried after every
      // row already landed. Nothing to write; just clear the staged state.
      baselineRef.current = courses;
      setDirty(false);
      setSaving(false);
      return;
    }

    const results = await Promise.allSettled(
      changed.map(async ({ course, newIdx }, i) => {
        const fd = new FormData();
        fd.set('sort_order', String(newIdx));
        fd.set('active', String(course.active));
        // Exactly ONE call in the batch carries the sync (R1h) — see the
        // note on updateFeaturedCourse's skipSync param. Picked by position,
        // not by completion order, since Promise.allSettled runs these
        // concurrently and "the last one" has no defined meaning here.
        fd.set('skipSync', i === 0 ? 'false' : 'true');
        const res = await updateFeaturedCourse(course._id, fd);
        if (res?.ok === false) throw new Error(res.error || 'บันทึกไม่สำเร็จ');
        return course;
      })
    );

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? changed[i].course : null))
      .filter(Boolean);

    if (failed.length > 0) {
      setError(
        `บันทึกลำดับไม่สำเร็จ ${failed.length} รายการ: `
        + failed.map((c) => c.course_name || c.course_id).join(', ')
        + ' — ลองบันทึกอีกครั้ง'
      );
      setSaving(false);
      return; // dirty stays true; courses stays as arranged, ready to retry
    }

    // FULL success. `courses` already reflects the arranged order locally —
    // stamp sort_order onto it so the next diff (a later save) is computed
    // against what was actually written, and advance the baseline.
    const saved = courses.map((c, idx) => ({ ...c, sort_order: idx }));
    setCourses(saved);
    baselineRef.current = saved;
    setDirty(false);
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('ลบออกจาก featured?')) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteFeaturedCourse(id);
      setCourses(courses.filter((c) => c._id !== id));
      setBusyId(null);
    });
  }

  async function handleToggle(course) {
    const fd = new FormData();
    fd.set('sort_order', String(course.sort_order));
    fd.set('active', String(!course.active));
    setBusyId(course._id);
    startTransition(async () => {
      const res = await updateFeaturedCourse(course._id, fd);
      if (res?.ok === false) {
        // Now that updateFeaturedCourse can return a refusal instead of
        // throwing (R1c), the optimistic flip below must be gated on it —
        // applying it unconditionally would show a toggle as successful
        // when the write never landed.
        alert(res.error || 'สลับสถานะไม่สำเร็จ');
        setBusyId(null);
        return;
      }
      setCourses(
        courses.map((c) =>
          c._id === course._id ? { ...c, active: !c.active } : c
        )
      );
      setBusyId(null);
    });
  }

  // Staged, synchronous, local-only — see the header note on what this
  // removes. No FormData, no server call, no busy state: there is nothing
  // to be busy about until Save is pressed.
  function handleReorder(course, direction) {
    const idx = courses.findIndex((c) => c._id === course._id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= courses.length) return;
    const next = [...courses];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setCourses(next);
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-3">
      {dirty && (
        <div className="flex flex-wrap items-center gap-3 rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">
            ยังไม่บันทึกลำดับ — การบันทึกจะเขียนตำแหน่งของคอร์สที่ถูกย้ายเท่านั้น
          </span>
          {pendingAdds.length > 0 && (
            <span>
              และมีคอร์สใหม่ {pendingAdds.length} รายการที่เพิ่มไว้ระหว่างนี้ —
              จะแสดงในตารางหลังบันทึกหรือยกเลิก
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
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
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] bg-9e-ice">
            <th className="w-10 px-2 py-3" aria-label="ลาก" />
            <th className="w-8 px-4 py-3 text-left font-bold text-9e-navy">#</th>
            <th className="px-4 py-3 text-left font-bold text-9e-navy">คอร์ส</th>
            <th className="w-20 px-4 py-3 text-center font-bold text-9e-navy">
              Active
            </th>
            <th className="w-40 px-4 py-3 text-right font-bold text-9e-navy">
              จัดการ
            </th>
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-9e-slate-dp-50">
                ยังไม่มีคอร์ส featured — เพิ่มด้วย Course ID ด้านบน
              </td>
            </tr>
          )}
          {courses.map((c, i) => {
            const isDragging = draggingIndex === i;
            const isDropTarget =
              dragOverIndex === i &&
              draggingIndex !== null &&
              draggingIndex !== i;
            return (
              <tr
                key={c._id}
                {...getDragProps(i)}
                className={
                  'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                  (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                  (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                  (c.active
                    ? 'hover:bg-9e-ice/50'
                    : 'opacity-50 hover:bg-gray-50')
                }
              >
                <td className="px-2 py-3 align-middle">
                  <DragHandle />
                </td>
                <td className="px-4 py-3 text-center text-9e-slate-dp-50">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {c.course_cover_url ? (
                      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-9e-sm bg-9e-ice">
                        <Image
                          src={c.course_cover_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="h-9 w-16 shrink-0 rounded-9e-sm bg-9e-ice" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-9e-navy">
                        {c.course_id}
                      </p>
                      <p className="line-clamp-1 text-xs text-9e-slate-dp-50">
                        {c.course_name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(c)}
                    disabled={busyId === c._id}
                    aria-label={c.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                    className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                      c.active ? 'bg-9e-action' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                        c.active ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleReorder(c, 'up')}
                      disabled={i === 0 || busyId === c._id}
                      className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(c, 'down')}
                      disabled={i === courses.length - 1 || busyId === c._id}
                      className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c._id)}
                      disabled={busyId === c._id}
                      className="rounded-9e-sm border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyId === c._id ? '...' : 'ลบ'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
