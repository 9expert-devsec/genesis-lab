'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterCourseOptions, courseOptionLabel } from '@/lib/courses/courseOptionFilter';
import { moveInArray } from './pagePath';
import { FieldBlock, INPUT_CLASS } from './fields';

/**
 * Choosing courses from a list, instead of typing codes into a textarea.
 *
 * Replaces `CourseIdsField` for the three section types that share it —
 * course_selector, bundle_courses and course_list[manual]. See
 * docs/course-picker-proposal.md §G step 3 for why this is the last step: it is
 * the only one that changes what an author's actions write into the document,
 * and the only one that can lose a stored code.
 *
 * ── THE RULE THAT BREAKS A PAGE IF IT IS MISSED ────────────────────────────
 * EVERY STORED ENTRY GETS A ROW, including a code this catalogue has never
 * heard of. The natural way to build this control is "render the selected items
 * from the catalogue" — and then a code absent from the catalogue silently has
 * no row, the author sees a shorter list, saves, and the code is gone for good
 * because the document no longer holds it.
 *
 * So the list below is driven by `value`, the stored array, and the catalogue is
 * consulted only for a NAME. No name found means the row shows the code alone,
 * marked. It never means the row disappears.
 *
 * `IconPicker` decided the same thing for icon names and wrote down why: the
 * trigger renders the stored value even when the validator rejects it, because
 * an author has to be able to see what is actually saved. This is that rule with
 * the nouns changed and one value grown into a list.
 *
 * ── AND THE CATALOGUE IS AUTHORITATIVE FOR NOTHING ─────────────────────────
 * It is a snapshot taken at page load; `resolveBuilderSectionData` is what says
 * whether a code resolves, and the warnings under this control read that and
 * only that. So a row marked “ไม่ทราบชื่อ” is a statement about THIS LIST — no
 * name for that code here — and never a claim that the course does not exist.
 * The two are read at different moments through different caches and are allowed
 * to disagree (§G step 2).
 *
 * That is also why nothing here validates, rejects or normalises a code. A code
 * the catalogue has not got is exactly the case that must survive.
 *
 * ── WHAT IT REUSES, AND WHAT HAD TO DIFFER ─────────────────────────────────
 * REUSED from `courseOptionFilter` — the MATCHING RULE, not a second copy of it:
 * `filterCourseOptions` (substring over code + name, with the สระอำ fold) and
 * `courseOptionLabel` for the option text. Both already covered by
 * test/pure/courseOptionFilter. `limit` is left off, and `excludeCode` — the
 * can't-reference-itself rule — does not apply here.
 *
 * REUSED from `IconPicker` — the SHELL: a portal-free exported body so the
 * render tier can assert on it (Dialog.Portal draws nothing under
 * renderToStaticMarkup), the fixed-size dialog, and the non-scrolling header
 * holding the search box with only the results scrolling behind a reserved
 * scrollbar gutter.
 *
 * DIFFERENT, and each difference is measured rather than preferred:
 *
 *   · NO RESULT CAP. IconPicker caps at 120 of ~5,000 and prints how many it is
 *     holding back. Here the worst single-character query matches 78 of 79, so a
 *     cap would never fire and a “showing N of M” line would be permanently
 *     false.
 *   · NO GROUP PILLS. 79 courses have no grouping worth inventing — the same
 *     call IconPicker made, for the same reason.
 *   · A LIST, NOT A VALUE. IconPicker is a trigger plus a dialog; the trigger
 *     shape does not carry over at all. This is rows plus an add-dialog plus a
 *     direct-entry box. One consequence worth naming: the dialog STAYS OPEN
 *     after a pick, because building a list of six means six picks and a dialog
 *     that closed each time would cost five extra round trips.
 *
 * NOT COPIED: the related-course chip picker inside CourseForm. §F.1 measured
 * four ways it is the wrong shape here — it caps at five, it hides
 * already-picked courses (which makes duplicates unexpressible), it
 * re-implements matching inline, and its inline copy filters on
 * `course_name_th`, a field 0 of 79 rows carry.
 */

/** code → name, for the rows. Built once per catalogue rather than per row. */
export function courseNameByCode(courses) {
  const map = new Map();
  for (const c of Array.isArray(courses) ? courses : []) {
    const code = typeof c?.course_id === 'string' ? c.course_id : '';
    if (code) map.set(code, typeof c?.course_name === 'string' ? c.course_name : '');
  }
  return map;
}

/**
 * The dialog's contents, WITHOUT the portal — the split exists so the render
 * tier can assert on it. `query` is a prop rather than state for the same
 * reason: a test can render the list at any filter value without typing.
 *
 * `selected` is the stored array. It is used ONLY to show how many times a
 * course is already in the list — never to remove it from the options. Hiding
 * an already-picked course is what makes duplicates unexpressible, and
 * duplicates are expressible on purpose (§D.4).
 */
export function CoursePickerBody({ query, onQueryChange, courses, selected = [], onPick }) {
  const matches = filterCourseOptions(courses, query);
  const counts = useMemo(() => {
    const m = new Map();
    for (const code of Array.isArray(selected) ? selected : []) {
      if (typeof code === 'string' && code) m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  }, [selected]);

  return (
    <>
      <div data-testid="course-picker-header" className="mb-3 shrink-0 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" aria-hidden />
          <input
            type="search"
            data-testid="course-picker-search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ค้นหาด้วยรหัสหรือชื่อคอร์ส"
            aria-label="ค้นหาคอร์ส"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-1.5 pl-8 pr-2 text-[13px] text-9e-navy placeholder:text-9e-slate-dp-50 focus:border-9e-action/40 focus:outline-none dark:text-white"
          />
        </div>
        {/* No cap, so this is a plain count and never a "showing N of M". */}
        <p data-testid="course-picker-count" className="text-[10px] text-9e-slate-dp-50">
          {matches.length === 0
            ? 'ไม่พบคอร์สที่ตรงกับคำค้นหา'
            : `พบ ${matches.length} คอร์ส — เลือกซ้ำได้ ถ้าต้องการให้แสดงมากกว่าหนึ่งครั้ง`}
        </p>
      </div>

      <div data-testid="course-picker-scroll" className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <ul className="space-y-1">
          {matches.map((course) => {
            const already = counts.get(course.course_id) ?? 0;
            return (
              <li key={course.course_id}>
                <button
                  type="button"
                  data-testid="course-option"
                  data-code={course.course_id}
                  data-already={already}
                  onClick={() => onPick(course.course_id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-9e-md border px-2 py-1.5 text-left text-[12px]',
                    'border-[var(--surface-border)] text-9e-navy hover:border-9e-action/40 hover:text-9e-action',
                    'dark:text-white'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{courseOptionLabel(course)}</span>
                  {already > 0 && (
                    <span className="shrink-0 rounded-full border border-[var(--surface-border)] px-1.5 py-0.5 text-[10px] text-9e-slate-dp-50">
                      อยู่ในรายการแล้ว {already}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/** The add-dialog. Stays open after a pick — see the header. */
function CoursePickerDialog({ courses, selected, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) setQuery(''); setOpen(o); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-testid="course-picker-trigger"
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-9e-md border border-dashed',
            'border-[var(--surface-border)] px-2 py-2 text-xs text-9e-slate-dp-50',
            'hover:border-9e-action/40 hover:text-9e-action'
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> เลือกคอร์สจากรายการ
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(36rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'flex flex-col h-[min(32rem,calc(100dvh-4rem))]'
          )}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">เลือกคอร์ส</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-9e-navy">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            ค้นหาและเลือกคอร์สเพื่อเพิ่มลงในรายการ — เลือกได้หลายคอร์สโดยไม่ต้องปิดหน้าต่าง
          </Dialog.Description>

          <CoursePickerBody
            query={query}
            onQueryChange={setQuery}
            courses={courses}
            selected={selected}
            onPick={onPick}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * One stored entry. Driven by the CODE, never by the catalogue.
 *
 * Three states, and the marks say different things on purpose:
 *   · a code with a name  — the ordinary row
 *   · a code with no name — “ไม่ทราบชื่อ”, the house wording for an unknown
 *     value (labelOf answers 'ไม่ทราบชนิด' the same way). A statement about
 *     this list, NOT about the course: the resolver decides existence, and its
 *     own red warning sits under this control.
 *   · an empty code       — “ว่าง”. A stored '' is what a trailing newline in
 *     the old textarea left behind (§D.5). This control cannot create one; it
 *     shows the one already there so an author can remove it, rather than
 *     stripping it on load and rewriting a stored array nobody asked to change.
 */
function SelectedRow({ code, name, index, total, onMove, onRemove }) {
  const empty = code === '';
  return (
    <li
      data-testid="course-row"
      data-code={code}
      className="mb-1 flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-2 py-1.5"
    >
      <span className="w-5 shrink-0 text-[10px] font-bold text-9e-slate-dp-50">#{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[12px]', empty ? 'text-9e-slate-dp-50' : 'text-9e-navy dark:text-white')}>
          {empty ? 'ว่าง' : code}
        </span>
        {!empty && (
          name
            ? <span className="block truncate text-[10px] text-9e-slate-dp-50">{name}</span>
            : <span data-testid="course-row-unnamed" className="block truncate text-[10px] text-amber-700 dark:text-amber-400">ไม่ทราบชื่อ</span>
        )}
      </span>
      {/* Buttons rather than dragging, and the ends are disabled rather than
          wrapping — the same call ItemList made, for the same keyboard reason. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button" data-move="up" data-row={index} disabled={index === 0}
          aria-label={`ย้ายรหัสที่ ${index + 1} ขึ้น`} onClick={() => onMove(index, 'up')}
          className="rounded p-0.5 text-9e-slate-dp-50 enabled:hover:bg-9e-ice enabled:hover:text-9e-action disabled:opacity-30 dark:enabled:hover:bg-9e-navy"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button" data-move="down" data-row={index} disabled={index === total - 1}
          aria-label={`ย้ายรหัสที่ ${index + 1} ลง`} onClick={() => onMove(index, 'down')}
          className="rounded p-0.5 text-9e-slate-dp-50 enabled:hover:bg-9e-ice enabled:hover:text-9e-action disabled:opacity-30 dark:enabled:hover:bg-9e-navy"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button" aria-label={`ลบรหัสที่ ${index + 1}`} onClick={() => onRemove(index)}
          className="rounded p-0.5 text-9e-slate-dp-50 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </span>
    </li>
  );
}

/**
 * The field: the stored list as rows, an add-dialog, and a box for typing a code
 * directly.
 *
 * ── DIRECT ENTRY IS NOT A FALLBACK ─────────────────────────────────────────
 * It is the reason the picker can be the normal path. A code upstream has not
 * published yet, or one this catalogue snapshot missed, has to remain
 * authorable — otherwise the picker becomes the only way to express a value and
 * a perfectly good code becomes untypeable. What is typed is stored verbatim,
 * trimmed and nothing else, exactly as the textarea stored it.
 *
 * ── INDEX KEYS, AND WHY THEY ARE SAFE HERE ─────────────────────────────────
 * The same analysis ItemList carries, and it holds for the same reason: these
 * rows have no local state and no uncontrolled input, so after a move each row
 * re-renders from the next entry's props and nothing is retained. The one thing
 * a matched key DOES retain is focus, which is why the move handler moves focus
 * to where the entry went. Give a row an input of its own and this stops being
 * true.
 */
export function CourseIdsPicker({ value, onChange, courses = [], label, hint }) {
  const ids = Array.isArray(value) ? value : [];
  const names = useMemo(() => courseNameByCode(courses), [courses]);
  const [typed, setTyped] = useState('');

  const containerRef = useRef(null);
  const pendingFocus = useRef(null);
  useEffect(() => {
    const want = pendingFocus.current;
    pendingFocus.current = null;
    if (!want || !containerRef.current) return;
    const at = (dir) => containerRef.current.querySelector(`[data-move="${dir}"][data-row="${want.index}"]`);
    const target = at(want.dir);
    const fallback = at(want.dir === 'up' ? 'down' : 'up');
    const el = target && !target.disabled ? target : fallback;
    if (el && !el.disabled) el.focus();
  });

  // APPEND, never merge. Picking a course already in the list adds a second
  // entry — that is the feature, and round 47's warning is what says so.
  const append = (code) => onChange([...ids, code]);

  const addTyped = () => {
    const code = typed.trim();
    if (!code) return;
    append(code);
    setTyped('');
  };

  const move = (i, dir) => {
    const to = dir === 'up' ? i - 1 : i + 1;
    // Refused HERE rather than in moveInArray, which clamps a destination
    // instead of rejecting it — asking it to move entry 0 to -1 hands back a
    // NEW array in the SAME order, which would dirty the page for a press that
    // changed nothing. Same reasoning as ItemList's.
    if (to < 0 || to >= ids.length) return;
    pendingFocus.current = { index: to, dir };
    const next = moveInArray(ids, i, to);
    if (next === ids) return;
    onChange(next);
  };

  const remove = (i) => onChange(ids.filter((_, k) => k !== i));

  return (
    <FieldBlock label={label ?? 'คอร์สในรายการ'} hint={hint ?? 'ลำดับที่แสดงคือลำดับในรายการนี้'}>
      <div ref={containerRef}>
        {ids.length > 0 && (
          <ul data-testid="course-rows" className="mb-2">
            {ids.map((raw, i) => {
              const code = typeof raw === 'string' ? raw.trim() : '';
              return (
                <SelectedRow
                  key={i}
                  code={code}
                  name={names.get(code) ?? ''}
                  index={i}
                  total={ids.length}
                  onMove={move}
                  onRemove={remove}
                />
              );
            })}
          </ul>
        )}

        <CoursePickerDialog courses={courses} selected={ids} onPick={append} />

        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            data-testid="course-code-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }}
            placeholder="หรือพิมพ์รหัสคอร์สเอง เช่น MSE-AI"
            aria-label="พิมพ์รหัสคอร์สเพื่อเพิ่มเอง"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            data-testid="course-code-add"
            onClick={addTyped}
            className="shrink-0 rounded-9e-sm border border-[var(--surface-border)] px-2.5 py-2 text-xs text-9e-slate-dp-50 hover:border-9e-action/40 hover:text-9e-action"
          >
            เพิ่ม
          </button>
        </div>
      </div>
    </FieldBlock>
  );
}
