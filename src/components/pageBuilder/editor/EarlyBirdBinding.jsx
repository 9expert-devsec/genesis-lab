'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCourseRoundsForPage } from '@/lib/actions/course-promos';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { Field, Group, TextInput, Warn, INPUT_CLASS } from './fields';
import { CourseSelectPicker } from './CoursePicker';
// ADDED beside the statements above rather than folded into any — the standing
// rule in this repo.
//
// `windowEndFromInput` / `toDateInput` already own "the last instant of this
// named day, in Asia/Bangkok" and "the YYYY-MM-DD a date box should show, in
// Bangkok". This panel had its own hand-rolled pair and both were wrong in the
// two ways publishWindow.js's header describes — see the deadline field below.
// One definition of end-of-day for the whole codebase is the entire point.
import { windowEndFromInput, toDateInput } from '@/lib/pageBuilder/publishWindow';
// The Thai date label, zone-pinned. Used to echo the interpreted date back to
// the author, because <input type="date"> renders mm/dd/yyyy under a non-Thai
// browser locale and 05/09 reads as 5 September to the person typing it.
import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';
// The SAME derivation the write-through uses, so the panel shows the date that
// will actually be stored rather than a second opinion about it.
import { earlyBirdDeadline } from '@/lib/earlyBird/pageWriteThrough';

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

/**
 * ── THE LOCAL `dateValue` IS GONE — IT READ THE UTC CALENDAR ──────────────
 * It was `new Date(v).toISOString().slice(0, 10)`, which is precisely the
 * `String(v).slice(0, 10)` that `toDateInput` was written to replace: it names
 * the UTC day, so every instant stored as a Bangkok end-of-day
 * (`…T16:59:59.999Z`) is fine but anything later in the UTC day shows the wrong
 * date. The shared reader answers "the Bangkok calendar day this instant is
 * in", which is the only question a date box is asking.
 */

/**
 * ── 4b + 4c: WHAT ACTUALLY ENDS THIS PROMOTION, IN ONE LINE ────────────────
 *
 * Two dates can end an Early Bird and they mean DIFFERENT THINGS, which is why
 * they are still two fields and not one:
 *
 *   สิ้นสุดโปรโมชัน  the author's own date — stops the SPECIAL PRICE.
 *   publishEndDate  the page's publish window — removes the WHOLE PAGE.
 *
 * The stored deadline is the earlier of them, because whichever arrives first
 * genuinely ends the offer; every read path re-checks `deadline`, so folding
 * the window's end into it closes the promotion with no read-path change. That
 * rule is correct and is not what this component is for — this says what it
 * RESOLVED TO, and which side won, so an author reads a date instead of doing
 * the arithmetic.
 *
 * ── AND IT WARNS WHEN NOTHING ENDS IT ─────────────────────────────────────
 * Neither date set is a legitimate state — an Early Bird that runs until
 * somebody switches it off — and an easy one to reach by accident, because it
 * is what an untouched form looks like. So it is a warning and not a refusal,
 * and it says what will have to happen (a hand switch-off) rather than only
 * that something is missing.
 */
function DeadlineSummary({ binding, page }) {
  const own = binding?.deadline ?? null;
  const window = page?.publishEndDate ?? null;
  const resolved = earlyBirdDeadline(binding, page);

  if (!resolved) {
    return (
      <Warn>
        ยังไม่มีวันสิ้นสุด — Early Bird นี้จะแสดงต่อไปเรื่อย ๆ จนกว่าจะปิดเอง
        ตั้งวันสิ้นสุดโปรโมชัน หรือกำหนดวันสิ้นสุดการเผยแพร่ของหน้านี้
      </Warn>
    );
  }

  // WHICH date won, decided by comparing instants rather than by re-running the
  // rule — the resolved value is already the answer, so this only labels it.
  const t = resolved.getTime();
  const fromWindow = window != null && window !== '' && new Date(window).getTime() === t;
  const fromOwn = own != null && own !== '' && new Date(own).getTime() === t;
  const source = fromOwn && fromWindow
    ? 'ตรงกันทั้งสองวัน'
    : fromWindow
      ? 'มาจากวันสิ้นสุดการเผยแพร่ของหน้านี้'
      : 'มาจากวันสิ้นสุดโปรโมชัน';

  return (
    <p className="mb-3 rounded-9e-sm border border-[var(--surface-border)] px-2.5 py-2 text-[11px] leading-relaxed text-9e-slate-dp-50">
      โปรจะสิ้นสุด <strong>{formatThaiDate(resolved)}</strong> ({source})
    </p>
  );
}

/** One round, as a line an author can recognise. */
function roundLabel(round) {
  const days = formatRoundDays(round?.dates, { showMonth: true });
  const label = days && days !== '-' ? days : String(round?._id ?? '');
  return round?.status ? `${label} · ${round.status}` : label;
}

/**
 * ── `canEdit` — READ-ONLY, NEVER HIDDEN ───────────────────────────────────
 * An admin without the `promotions` menu key may still edit and save this page;
 * what they may not do is CHANGE the binding, because it sets a commercial
 * price and reserves a course against every other page. So the panel renders,
 * disabled, with a line saying which permission is missing.
 *
 * Hiding it would read as a missing feature and be reported as one — and it
 * would also hide a binding that IS in force, which an author needs to be able
 * to see even when they cannot change it.
 *
 * IT IS NOT THE GUARD. `updatePageIdentity` re-checks the same predicate and
 * refuses the save; this only stops an author filling in a form that will be
 * rejected. Defaults to true so every existing caller is unchanged.
 */
export function EarlyBirdBinding({ page, patch, courses = [], canEdit = true }) {
  const kind = page?.promotionKind ?? 'none';
  const binding = page?.earlyBird ?? {};
  const courseRef = String(binding.courseRef ?? '').trim();
  const courseCode = String(binding.courseCode ?? '').trim();

  /**
   * Merge one field, keeping the rest — the shape PageSettingsDialog uses for
   * `seo`. Every write in this panel goes through here or through the kind
   * select, and both refuse when `canEdit` is false: a disabled attribute is a
   * rendering hint, and a guard at the one setter is what makes the read-only
   * state a property of the component rather than of its markup.
   */
  const patchBinding = (p) => {
    if (!canEdit) return;
    patch({ earlyBird: { ...binding, ...p } });
  };

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
      {!canEdit && (
        <p className="mb-3 rounded-9e-sm border border-[var(--surface-border)] px-2.5 py-2 text-[11px] leading-relaxed text-9e-slate-dp-50">
          คุณดูการตั้งค่า Early Bird ได้ แต่แก้ไขไม่ได้ —
          ต้องมีสิทธิ์เข้าถึงเมนู “โปรโมชัน” จึงจะเปลี่ยนได้
          ส่วนอื่นของหน้านี้ยังแก้ไขและบันทึกได้ตามปกติ
        </p>
      )}
      <Field label="ชนิดโปรโมชัน" hint="เลือก Early Bird เพื่อผูกหลักสูตรและรอบอบรมกับหน้านี้">
        <select
          className={INPUT_CLASS}
          value={kind}
          disabled={!canEdit}
          onChange={(e) => {
            if (!canEdit) return;
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
          {!canEdit ? (
            /*
              A DIFFERENT CONTROL, not a disabled one. CourseSearchSelect has no
              disabled state, and a combobox that opens, filters and accepts a
              click while `patchBinding` silently discards the result is worse
              than plain text: it looks like it worked. This says what is bound
              and offers nothing.
            */
            <Field label="หลักสูตร" hint="แก้ไขไม่ได้ — ต้องมีสิทธิ์เมนู “โปรโมชัน”">
              <p className={INPUT_CLASS}>{courseCode || '— ยังไม่ได้เลือกคอร์ส —'}</p>
            </Field>
          ) : (
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
          )}
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
              disabled={!canEdit || !courseRef || loadingRounds}
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
              disabled={!canEdit}
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
            hint="วันสุดท้ายที่ยังได้ราคาพิเศษ (ถึง 23:59 น. ของวันนั้น)"
          >
            <input
              type="date"
              className={INPUT_CLASS}
              disabled={!canEdit}
              value={toDateInput(binding.deadline)}
              /**
               * ── 4a: THE BOUNDARY WAS SEVEN HOURS LATE ──────────────────
               * This wrote `${value}T23:59:59.000Z` — end of day in UTC, which
               * is 06:59 the NEXT morning in Bangkok. MEASURED for a picked
               * 2026-09-21: stored 2026-09-21T23:59:59.000Z = 22/09 06:59:59
               * Bangkok, so the special price survived seven hours into a day
               * the author had already ended. `windowEndFromInput` stores
               * 2026-09-21T16:59:59.999Z = 21/09 23:59:59 Bangkok — the day the
               * author names is a day the promotion runs, all of it and no more.
               *
               * It also REFUSES a date that does not exist: `new Date` rolls
               * '2026-02-31' into 3 March rather than failing, so a shape check
               * plus NaN would have stored a deadline three days past anything
               * typed. Null there means "no bound", same as a cleared box.
               */
              onChange={(e) => patchBinding({ deadline: windowEndFromInput(e.target.value) })}
            />
            {/**
              * ── 4d: THE INTERPRETED DATE, ECHOED BACK ────────────────────
              * `<input type="date">` renders in the BROWSER's locale, so a Thai
              * admin on an en-US profile sees mm/dd/yyyy and reads 05/09 as
              * 5 September when it means 9 May. The control's format is not
              * ours to set — `lang` is a hint browsers may ignore — so the
              * repo's existing answer is used instead: render the interpreted
              * date back in Thai, the same `formatThaiDate` the promotions grid
              * label uses. A mis-typed date is then visible before it is saved,
              * not after it ends the promotion on the wrong day.
              */}
            {binding.deadline && (
              <span className="mt-1 block text-xs text-9e-slate-dp-50">
                = {formatThaiDate(binding.deadline)}
              </span>
            )}
          </Field>

          {/**
            * ── 4b: THE RESOLVED DATE, NOT THE RULE ──────────────────────────
            * This used to explain the earlier-of-two rule in prose and leave the
            * author to compute the answer. It states the answer, and names which
            * of the two dates produced it — the rule is still discoverable, from
            * the result rather than instead of it.
            *
            * It reads `earlyBirdDeadline`, the SAME pure function the
            * write-through uses, so the panel cannot show a date the save would
            * not store. A second local "earlier of the two" here would be the
            * drift this whole module was factored to prevent.
            */}
          <DeadlineSummary binding={binding} page={page} />

          <Field label="ป้ายกำกับ" hint='ข้อความบนป้าย เช่น "Early Bird"'>
            <TextInput
              disabled={!canEdit}
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
