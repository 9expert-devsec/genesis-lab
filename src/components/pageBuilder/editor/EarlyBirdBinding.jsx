'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCourseRoundsForPage } from '@/lib/actions/course-promos';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { Field, Group, TextInput, Warn, INPUT_CLASS } from './fields';
import { CourseSelectPicker } from './CoursePicker';

/**
 * The page-level Early Bird binding — course, round, price, deadline, label.
 *
 * ── WHY IT IS HERE AND NOT IN A SECTION ───────────────────────────────────
 * The course detail page has to find this, and it cannot scan page sections to
 * do it. So the binding is page CONFIGURATION, it lives beside the other
 * promotion settings, and the page save writes it through to EarlyBirdConfig
 * (see lib/earlyBird/pageWriteThrough.js). Nothing here writes anything: every
 * control dispatches a page patch, and the save path owns the rest.
 *
 * ── `bundle` HAS NO BRANCH IN THIS FILE, DELIBERATELY ─────────────────────
 * It is a declared `promotionKind` with no UI. The select below offers two
 * values, and a page already stored as `bundle` keeps that value — the control
 * shows it, unchanged, rather than silently rewriting an author's data to
 * something this round happens to render.
 */

/** The two kinds this panel can SET. `bundle` is storable and not offerable. */
const OFFERED_KINDS = [
  { value: 'none', label: 'ไม่มี' },
  { value: 'early_bird', label: 'Early Bird' },
];

const KIND_LABELS = { none: 'ไม่มี', early_bird: 'Early Bird', bundle: 'แพ็กเกจ (ยังไม่รองรับ)' };

/** `2026-09-08T00:00:00.000Z` → `2026-09-08`, for `<input type="date">`. */
function dateValue(v) {
  if (!v) return '';
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10);
}

/** One round, as a line an author can recognise. */
function roundLabel(round) {
  const days = formatRoundDays(round?.dates, { showMonth: true });
  const label = days && days !== '-' ? days : String(round?._id ?? '');
  return round?.status ? `${label} · ${round.status}` : label;
}

export function EarlyBirdBinding({ page, patch, courses = [] }) {
  const kind = page?.promotionKind ?? 'none';
  const binding = page?.earlyBird ?? {};
  const courseRef = String(binding.courseRef ?? '').trim();
  const courseCode = String(binding.courseCode ?? '').trim();

  /** Merge one field, keeping the rest — the shape PageSettingsDialog uses for `seo`. */
  const patchBinding = (p) => patch({ earlyBird: { ...binding, ...p } });

  /**
   * ── THE ONE SETTER FOR BOTH IDENTIFIERS ───────────────────────────────────
   * `courseCode` and `courseRef` are written HERE and nowhere else, always
   * together, always off the same catalogue row. Neither is derivable from the
   * other on the client, and upstream is asymmetric about which it accepts:
   *
   *   courseCode  addresses `EarlyBirdConfig.course_id`, is what the
   *               write-through reads, and is what `course-rename` maintains.
   *   courseRef   the upstream ObjectId, and the ONLY thing `/schedules`
   *               accepts (`course=<_id>`); the code is silently ignored there.
   *
   * A binding carrying one without the other is therefore not a partial success
   * — it is a row that either cannot be written or can never show a round. The
   * page schema refuses that pair outright; this setter is what makes the state
   * unreachable from the UI in the first place, and the direct-entry box is
   * turned off below for the same reason.
   *
   * Clearing the selection clears BOTH and the round with them. So does picking
   * a course the catalogue somehow does not carry — a ref pointing at the
   * PREVIOUS course while the code names a new one is the worst of the three
   * states, and it is the one a "keep what we had" fallback would produce.
   */
  const byCode = useMemo(() => {
    const map = new Map();
    for (const c of Array.isArray(courses) ? courses : []) {
      if (c?.course_id) map.set(String(c.course_id), c);
    }
    return map;
  }, [courses]);

  const pickCourse = (code) => {
    const next = String(code ?? '').trim();
    const row = next ? byCode.get(next) : null;
    const ref = row?._id ? String(row._id) : '';
    patchBinding({
      // Both, or neither. A code whose row carries no ObjectId is not storable
      // as a binding, so it is not stored as half of one.
      courseCode: ref ? next : '',
      courseRef: ref,
      // The round belonged to the OLD course. Keeping it would submit a round
      // id that does not belong to the bound course, which resolves to nothing
      // and renders a registration link into a blank step 1.
      scheduleId: '',
    });
  };

  /**
   * The rounds for the bound course.
   *
   * Keyed on `courseRef` — the ObjectId — because `/schedules` takes
   * `course=<ObjectId>`, the opposite convention from `/public-course`. Passing
   * the code returns nothing, silently.
   *
   * No URL state is read or written here: the binding lives in the page patch,
   * and this is a fetch keyed on it.
   */
  const [rounds, setRounds] = useState([]);
  const [loadingRounds, setLoadingRounds] = useState(false);
  useEffect(() => {
    if (kind !== 'early_bird' || !courseRef) { setRounds([]); return; }
    let live = true;
    setLoadingRounds(true);
    getCourseRoundsForPage(courseRef)
      .then((rows) => { if (live) setRounds(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setRounds([]); })
      .finally(() => { if (live) setLoadingRounds(false); });
    return () => { live = false; };
  }, [kind, courseRef]);

  /**
   * A round the author saved that upstream no longer returns still shows, as
   * itself, selected. Round 64 settled this for the bundle's chosen rounds and
   * it is the same call: quietly emptying the control would drop a binding the
   * author cannot see was dropped.
   */
  const savedRound = String(binding.scheduleId ?? '').trim();
  const roundMissing = savedRound !== '' && !rounds.some((r) => String(r?._id) === savedRound);

  return (
    <Group title="Early Bird">
      <Field label="ชนิดโปรโมชัน" hint="เลือก Early Bird เพื่อผูกหลักสูตรและรอบอบรมกับหน้านี้">
        <select
          className={INPUT_CLASS}
          value={kind}
          onChange={(e) => {
            const next = e.target.value;
            // Switching AWAY releases the claim on save — the write-through
            // deletes only rows this page owns. The binding's own fields are
            // left as they are so switching back does not retype them.
            patch({ promotionKind: next });
          }}
        >
          {/* A stored `bundle` stays selectable-as-current rather than being
              rewritten to something this panel happens to render. */}
          {!OFFERED_KINDS.some((k) => k.value === kind) && (
            <option value={kind}>{KIND_LABELS[kind] ?? kind}</option>
          )}
          {OFFERED_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </Field>

      {kind === 'early_bird' && (
        <>
          <CourseSelectPicker
            value={courseCode}
            onChange={pickCourse}
            courses={courses}
            label="หลักสูตร"
            hint="หลักสูตรที่ Early Bird นี้ใช้ — หนึ่งหลักสูตรมีได้เพียง Early Bird เดียว"
            /**
             * NO TYPED-CODE ESCAPE HATCH HERE. It is a second writer that sets a
             * code with no ObjectId beside it, which is the half-set state this
             * panel's setter and the page schema both refuse. A course missing
             * from the catalogue has no ObjectId, so it has no rounds and no
             * registration CTA — binding it would be a row that looks configured
             * and does nothing. That is a catalogue bug to report, not something
             * to route around from here.
             */
            allowDirectEntry={false}
          />
          {/**
            * The half-set state, which is now only reachable from data that
            * predates this guard or was seeded directly.
            *
            * THE COPY DOES NOT TELL THE AUTHOR TO DO WHAT THEY JUST DID. The
            * previous wording said "เลือกจากรายการ" — advice an author had
            * already followed, on a panel that had itself just listed the
            * course — because the catalogue was crossing without its ObjectId
            * and every pick landed here. It now describes the state and names
            * the one action that resolves it.
            */}
          {courseCode !== '' && courseRef === '' && (
            <Warn tone="red">
              หลักสูตรนี้ยังไม่มีรหัสอ้างอิงสำหรับดึงรอบอบรม จึงยังใช้งานไม่ได้ —
              เลือกหลักสูตรนี้อีกครั้งเพื่อผูกใหม่ ถ้ายังไม่หาย แปลว่าหลักสูตรนี้ไม่มีในแคตตาล็อก
              โปรดแจ้งผู้ดูแลระบบ
            </Warn>
          )}

          <Field
            label="รอบอบรม"
            hint="ปุ่มสมัครจะพาไปที่แบบฟอร์มสมัครปกติของรอบนี้"
          >
            <select
              className={INPUT_CLASS}
              value={savedRound}
              disabled={!courseRef || loadingRounds}
              onChange={(e) => patchBinding({ scheduleId: e.target.value })}
            >
              <option value="">
                {loadingRounds ? 'กำลังโหลดรอบอบรม…' : '— ยังไม่ได้เลือกรอบ —'}
              </option>
              {/* The saved-but-missing round, kept as its own option so the
                  select can show it as selected rather than falling back. */}
              {roundMissing && <option value={savedRound}>{`ไม่พบรอบนี้แล้ว (${savedRound})`}</option>}
              {rounds.map((r) => (
                <option key={String(r?._id)} value={String(r?._id)}>{roundLabel(r)}</option>
              ))}
            </select>
          </Field>
          {roundMissing && (
            <Warn>รอบที่เลือกไว้ไม่อยู่ในรายการรอบที่เปิดรับแล้ว — เลือกรอบใหม่ก่อนเผยแพร่</Warn>
          )}

          <Field label="ราคาพิเศษ (บาท)" hint="เว้นว่างถ้ายังไม่กำหนด — 0 หมายถึงฟรีจริง ๆ">
            <TextInput
              value={binding.specialPrice ?? ''}
              onChange={(v) => {
                const t = String(v).trim();
                // '' is "not set" and 0 is a real price. Number('') is 0, so the
                // empty case has to be caught before the conversion.
                patchBinding({ specialPrice: t === '' ? null : Number(t) });
              }}
            />
          </Field>

          <Field
            label="สิ้นสุดโปรโมชัน"
            hint="ถ้าหน้านี้มีวันสิ้นสุดการเผยแพร่ ระบบจะใช้วันที่ที่มาถึงก่อน"
          >
            <input
              type="date"
              className={INPUT_CLASS}
              value={dateValue(binding.deadline)}
              onChange={(e) =>
                patchBinding({ deadline: e.target.value ? `${e.target.value}T23:59:59.000Z` : null })
              }
            />
          </Field>

          <Field label="ป้ายกำกับ" hint='ข้อความบนป้าย เช่น "Early Bird"'>
            <TextInput
              value={binding.labelTh ?? ''}
              onChange={(v) => patchBinding({ labelTh: v })}
            />
          </Field>

          {/**
            * ── THE SCHEDULING GAP, SAID OUT LOUD ────────────────────────────
            * Visible text, not a tooltip, and not softened. `is_active` is
            * derived from whether the page is publicly visible RIGHT NOW, and
            * nothing runs at `publishStartDate` to flip it — so an Early Bird
            * on a page scheduled for the future does not appear on the course
            * page at the scheduled moment. It appears when the page is actually
            * published. An author who reads "ตั้งเวลาเผยแพร่" elsewhere in this
            * dialog would otherwise reasonably assume it works here too, and
            * find out from a customer.
            */}
          <p className="mt-1 rounded-9e-sm border border-[var(--surface-border)] px-2.5 py-2 text-[11px] leading-relaxed text-9e-slate-dp-50">
            Early Bird จะแสดงบนหน้าหลักสูตร <strong>เมื่อหน้านี้ถูกเผยแพร่จริงแล้วเท่านั้น</strong> —
            การตั้งเวลาเผยแพร่ล่วงหน้ายังไม่ทำให้ Early Bird เริ่มทำงานตามเวลานั้นเอง
            ต้องกลับมาเผยแพร่หน้านี้เมื่อถึงเวลา
            ส่วนการจองสิทธิ์หลักสูตรจะเกิดขึ้นทันทีที่บันทึก
            เพื่อไม่ให้หน้าอื่นมาผูกหลักสูตรเดียวกันซ้ำ
          </p>
        </>
      )}
    </Group>
  );
}
