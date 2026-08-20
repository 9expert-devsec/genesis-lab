'use client';

import { useMemo } from 'react';
import {
  COURSE_KIND_IDS,
  COURSE_KIND_LABELS,
  COURSE_KIND_SHORT_LABELS,
} from '@/lib/banners/bannerTypes';
import { COURSE_REF_INPUTS } from '@/lib/banners/bannerFormPayload';
import { findCourseOption } from '@/lib/banners/pickerMatch';
import { SearchPicker } from './SearchPicker';

/**
 * The `course` type's reference: `{ upstreamId, courseId, kind }`.
 *
 * ── THE NAMESPACE IS CHOSEN, NOT INFERRED, AND THAT IS THE WHOLE DESIGN ────
 * An in-class course carries `course_id` / `course_name` / `course_teaser` /
 * `course_trainingdays`; an online one carries `o_course_id` / `o_course_name` /
 * `o_course_teaser` / `o_number_lessons`. NO KEY IS SHARED. So `kind` is not a
 * hint that a resolver can second-guess — it selects which of two disjoint
 * indexes the lookup runs against, and a wrong or missing one does not degrade
 * to "the other namespace", it resolves to NOTHING. The banner is then dropped
 * from the pool by `resolveFeatureContentRefs` with a `console.warn` on the
 * server that no admin will ever see.
 *
 * Hence: the two namespaces are a REQUIRED radio choice with no preselection on
 * a new record, and picking one CLEARS any course already chosen. Clearing is
 * the part that is easy to leave out and expensive to omit — without it an
 * admin who chooses in-class, picks a course, then flips to online, ends up with
 * an in-class course's id filed under the online namespace, which is a document
 * that validates, saves, and resolves to nothing.
 *
 * ── BOTH IDENTITIES ARE STORED ─────────────────────────────────────────────
 * `upstreamId` (MSDB's `_id`) is the identity that cannot go stale and is what
 * `pickCourse` tries first; `courseId` is the human code and is the fallback,
 * normalised on both sides. Upstream renamed `Power-Apps` to `POWER-APPS` at
 * some point and four public ids are still mixed-case, so a reference that
 * carried only the code would one day stop resolving — and one that carried
 * only the `_id` would be unreadable in a database dump. Both, always.
 *
 * The code is stored EXACTLY as upstream spells it, leading space and all. Only
 * the display is trimmed. See the note on `courseOption` in pickerOptions.js.
 */
export function BannerCoursePicker({
  value,          // { upstreamId, courseId, kind }
  onChange,
  options,
  loadError,
  error,
  inputClassName = '',
}) {
  const kind = value?.kind ?? '';
  const hasRef = Boolean(value?.upstreamId || value?.courseId);

  const inKind = useMemo(
    () => (Array.isArray(options) ? options : []).filter((o) => o.kind === kind),
    [options, kind]
  );

  const selected = useMemo(
    () => (hasRef && kind ? findCourseOption(options, value) : null),
    [options, value, hasRef, kind]
  );

  /**
   * A reference is stored but no row in `options` matches it.
   *
   * NOT the same thing as "unpublished", and it must not be reported as one:
   * the course was deleted or renamed upstream, or the upstream list failed to
   * load at all. Either way the banner will be dropped at render time, and the
   * stored value is NOT cleared — silently blanking a field because its target
   * moved is the wipe-on-unrelated-edit class this repo keeps meeting.
   */
  const missing = hasRef && kind && !selected && !loadError;

  function setKind(next) {
    // Changing the namespace clears the course. See the header — the
    // alternative is a document that validates and resolves to nothing.
    onChange({ upstreamId: '', courseId: '', kind: next });
  }

  return (
    <div className="space-y-3">
      {/* ── THE THREE FORM CONTROLS. Always rendered while this picker is on
          screen, so the payload parser sees the keys and does not fall back to
          the stored value — including when the admin has deliberately cleared
          the selection. `has()` vs `get()`; see bannerFormPayload. ── */}
      <input type="hidden" name={COURSE_REF_INPUTS.UPSTREAM_ID} value={value?.upstreamId ?? ''} />
      <input type="hidden" name={COURSE_REF_INPUTS.COURSE_ID} value={value?.courseId ?? ''} />
      <input type="hidden" name={COURSE_REF_INPUTS.KIND} value={kind} />

      {/* ── Namespace ── */}
      <div>
        <p className="text-xs font-bold text-9e-navy mb-1.5">
          ประเภทคอร์ส * <span className="font-normal text-9e-slate-dp-50">(ต้องเลือก)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {COURSE_KIND_IDS.map((id) => (
            <label
              key={id}
              className={
                'flex items-center gap-2 rounded-9e-md border px-3 py-2 text-sm cursor-pointer transition-colors '
                + (kind === id
                  ? 'border-9e-action bg-9e-ice text-9e-navy font-bold'
                  : 'border-gray-200 text-9e-slate-dp-50 hover:border-9e-air')
              }
            >
              <input
                type="radio"
                name="course_kind_choice"
                value={id}
                checked={kind === id}
                onChange={() => setKind(id)}
                className="accent-9e-action"
              />
              {COURSE_KIND_LABELS[id]}
            </label>
          ))}
        </div>
      </div>

      {/* ── Course ── */}
      {loadError ? (
        <p className="rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError}
          {hasRef
            ? ' — คอร์สที่บันทึกไว้เดิมยังคงอยู่และจะไม่ถูกล้าง'
            : ' — ลองรีเฟรชหน้านี้อีกครั้ง'}
        </p>
      ) : !kind ? (
        <p className="text-xs text-9e-slate-dp-50">
          เลือกประเภทคอร์สก่อน จึงจะค้นหาคอร์สได้
        </p>
      ) : (
        <SearchPicker
          options={inKind}
          getKey={(o) => `${o.kind}:${o.upstreamId}:${o.courseId}`}
          getSearchText={(o) => `${o.code} ${o.name}`.toLowerCase()}
          selected={selected}
          onPick={(o) =>
            onChange({ upstreamId: o.upstreamId, courseId: o.courseId, kind: o.kind })
          }
          onClear={() => onChange({ upstreamId: '', courseId: '', kind })}
          ariaLabel="ค้นหาคอร์ส"
          placeholder={`ค้นหา ${COURSE_KIND_SHORT_LABELS[kind]} จากรหัสหรือชื่อคอร์ส (${inKind.length} คอร์ส)`}
          emptyLabel="ไม่พบคอร์สที่ตรงกับคำค้น"
          inputClassName={inputClassName}
          renderOption={(o) => <CourseRow option={o} />}
          renderSelected={(o) => (
            <div className="rounded-9e-md border border-gray-200 bg-9e-ice/40 p-3">
              <CourseRow option={o} />
            </div>
          )}
        />
      )}

      {missing && (
        <p className="rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          ไม่พบคอร์สรหัส <code>{String(value.courseId || value.upstreamId).trim()}</code> ใน
          {' '}{COURSE_KIND_SHORT_LABELS[kind] ?? kind} — คอร์สนี้อาจถูกลบหรือเปลี่ยนรหัสแล้ว
          Banner นี้จะไม่แสดงบนหน้าแรก จนกว่าจะเลือกคอร์สใหม่
        </p>
      )}

      {selected && !selected.resolvable && (
        <p className="rounded-9e-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>คอร์สนี้ถูกซ่อนอยู่ (unpublished)</strong> — Banner ที่อ้างถึงคอร์สที่ถูกซ่อน
          จะถูกตัดออกจากหน้าแรกโดยไม่มีข้อความแจ้ง ให้เปิดเผยคอร์สนี้ก่อน หรือเลือกคอร์สอื่น
        </p>
      )}

      {error && (
        <p className="text-xs text-red-500">
          {Array.isArray(error) ? error[0] : String(error)}
        </p>
      )}
    </div>
  );
}

/**
 * One course line: name, then the code and the namespace.
 *
 * All three, because two of them are not enough to disambiguate: several
 * courses share a name across the two namespaces, and the CODE is what the
 * document stores — an admin auditing a record against the database needs to
 * see the value that is actually written, not only the pretty one.
 */
function CourseRow({ option }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-9e-navy truncate">
          {option.name || <span className="text-9e-slate-dp-50">(ไม่มีชื่อ)</span>}
        </div>
        <div className="text-xs text-9e-slate-dp-50">
          <code>{option.code}</code>
          {!option.resolvable && (
            <span className="ml-2 text-amber-700 font-bold">• ซ่อนอยู่</span>
          )}
        </div>
      </div>
      <span className="shrink-0 rounded-9e-sm border border-gray-300 px-2 py-0.5 text-[11px] text-9e-slate-dp-50">
        {COURSE_KIND_SHORT_LABELS[option.kind] ?? option.kind}
      </span>
    </div>
  );
}
