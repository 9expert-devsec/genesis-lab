'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { createCourse, updateCourse } from '@/lib/actions/courses';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BulletTextarea } from '@/components/admin/BulletTextarea';
import { TrainingTopicsEditor } from '@/components/admin/TrainingTopicsEditor';

/**
 * Genesis course editor — MSDB field parity.
 *
 * Layout follows the upstream MSDB admin form so admins moving between
 * the two have a familiar mental model. The form collects FormData
 * via `new FormData(form)` on submit, so every input below — including
 * the hidden inputs rendered by ImageUploadField, BulletTextarea, and
 * TrainingTopicsEditor — is picked up automatically. The server-side
 * `shapePayload()` in `src/lib/actions/courses.js` is the source of
 * truth for field names; keep the `name=` attributes here in sync.
 */
const COURSE_LEVELS = [
  { value: '1', label: '1 · Beginner' },
  { value: '2', label: '2 · Intermediate' },
  { value: '3', label: '3 · Advanced' },
  { value: '4', label: '4 · Expert' },
];

export function CourseForm({
  initial = null,
  skills = [],
  programs = [],
  allCourses = [],
  mode = 'create',
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // ── Section 1 ─────────────────────────────────────────────────────
  const [courseId, setCourseId] = useState(initial?.course_id ?? '');

  // ── Section 4: program + skills ───────────────────────────────────
  const initialSkillIds = (() => {
    if (!initial?.skills) return [];
    return initial.skills.map((s) => s?._id ?? s).filter(Boolean).map(String);
  })();
  const [selectedSkillIds, setSelectedSkillIds] = useState(initialSkillIds);

  function toggleSkill(id) {
    setSelectedSkillIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  // ── Section 5: related courses ────────────────────────────────────
  // The upstream payload returns populated course objects. Strip them
  // back to course_id strings so the chips + the resolver share the
  // same key (resolver lives in src/lib/api/resolveIds.js).
  const initialRelatedCodes = (() => {
    if (!Array.isArray(initial?.related_courses)) return [];
    return initial.related_courses
      .map((c) => (typeof c === 'string' ? c : c?.course_id))
      .filter(Boolean)
      .map(String);
  })();
  const [relatedCodes, setRelatedCodes] = useState(initialRelatedCodes);
  const [relatedQuery, setRelatedQuery] = useState('');

  const relatedOptions = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    return allCourses
      .filter((c) => {
        if (!c?.course_id) return false;
        if (relatedCodes.includes(c.course_id)) return false; // hide picked
        if (initial && c.course_id === initial.course_id) return false; // can't reference self
        if (!q) return true;
        return (
          c.course_id.toLowerCase().includes(q) ||
          (c.course_name || '').toLowerCase().includes(q) ||
          (c.course_name_th || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [allCourses, relatedQuery, relatedCodes, initial]);

  function pickRelated(code) {
    if (relatedCodes.length >= 5) return;
    if (relatedCodes.includes(code)) return;
    setRelatedCodes((cur) => [...cur, code]);
    setRelatedQuery('');
  }
  function dropRelated(code) {
    setRelatedCodes((cur) => cur.filter((c) => c !== code));
  }

  // Lookup helper for chip labels.
  const codeToName = useMemo(() => {
    const m = new Map();
    for (const c of allCourses) {
      if (c?.course_id) {
        m.set(c.course_id, c.course_name_th || c.course_name || c.course_id);
      }
    }
    return m;
  }, [allCourses]);

  // ── previous_course (single) ──────────────────────────────────────
  const initialPreviousCode =
    initial?.previous_course?.course_id ??
    (typeof initial?.previous_course === 'string'
      ? initial.previous_course
      : '') ??
    '';
  const [previousCourse, setPreviousCourse] = useState(initialPreviousCode);

  // ── submit ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const action =
        mode === 'edit'
          ? () => updateCourse(initial?._id, fd)
          : () => createCourse(fd);
      const res = await action();
      if (res?.ok) {
        router.push('/admin/courses');
        router.refresh();
      } else {
        setError(res?.error ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  // Pre-cooked defaults that map upstream populated objects.
  const programId = initial?.program?._id ?? initial?.program ?? '';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          {mode === 'edit' ? 'แก้ไขหลักสูตร' : 'สร้างหลักสูตรใหม่'}
        </h1>
        <Link
          href="/admin/courses"
          className="text-sm text-9e-action hover:underline"
        >
          ← กลับ
        </Link>
      </div>

      {error && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────
          Section 1 — ข้อมูลหลัก
      ─────────────────────────────────────────────────────────── */}
      <Section title="1. ข้อมูลหลัก">
        <Field label="ชื่อหลักสูตร (course_name) *">
          <input
            required
            type="text"
            name="course_name"
            defaultValue={initial?.course_name ?? ''}
            className={inputCls}
          />
        </Field>

        <Field
          label={`รหัสหลักสูตร (course_id) ${mode === 'create' ? '*' : ''}`}
          hint={
            mode === 'edit'
              ? 'แก้ไขไม่ได้หลังจากสร้างแล้ว — ใช้เป็น URL slug + key อ้างอิงอื่นๆ'
              : 'ตัวพิมพ์ใหญ่ + ขีดกลาง เช่น "POWER-BI-PQ"'
          }
        >
          <input
            required={mode === 'create'}
            readOnly={mode === 'edit'}
            type="text"
            name="course_id"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value.toUpperCase())}
            placeholder="POWER-BI-PQ"
            className={
              inputCls +
              ' font-mono text-xs' +
              (mode === 'edit' ? ' cursor-not-allowed opacity-70' : '')
            }
          />
        </Field>

        <Field
          label="คำอธิบายสั้น (course_teaser)"
          hint="สูงสุด 200 ตัวอักษร — ใช้สำหรับ card / SEO"
        >
          <textarea
            rows={2}
            maxLength={200}
            name="course_teaser"
            defaultValue={initial?.course_teaser ?? ''}
            className={inputCls}
          />
        </Field>

        <Field
          label="เนื้อหา (title)"
          hint="ฟิลด์ rich-text หลัก — รองรับ HTML. ใน MSDB ชื่อ field คือ &quot;title&quot; แม้จะเก็บ body"
        >
          <textarea
            rows={8}
            name="title"
            defaultValue={initial?.title ?? ''}
            className={inputCls + ' font-mono text-xs'}
          />
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 2 — สื่อ เวลา ราคา & ลำดับ
      ─────────────────────────────────────────────────────────── */}
      <Section title="2. สื่อ เวลา ราคา และลำดับ">
        <ImageUploadField
          name="course_cover_url"
          currentUrl={initial?.course_cover_url ?? ''}
          folder="courses/covers"
          label="รูปปกหลักสูตร (course_cover_url)"
          hint="แนะนำ 800×450px (16:9) · JPG/WebP · ไม่เกิน 5MB"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="จำนวนวันอบรม (course_trainingdays)">
            <input
              type="number"
              min="0"
              step="0.5"
              name="course_trainingdays"
              defaultValue={initial?.course_trainingdays ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="จำนวนชั่วโมง (course_traininghours)">
            <input
              type="number"
              min="0"
              step="1"
              name="course_traininghours"
              defaultValue={initial?.course_traininghours ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="ระดับ (course_levels)">
            <select
              name="course_levels"
              defaultValue={String(initial?.course_levels ?? '1')}
              className={inputCls}
            >
              {COURSE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Field>

          <Field label="ราคา (course_price)">
            <input
              type="number"
              min="0"
              step="1"
              name="course_price"
              defaultValue={initial?.course_price ?? ''}
              className={inputCls}
            />
          </Field>
          <Field
            label="ราคาสุทธิ (course_netprice)"
            hint="ราคาหลังหักส่วนลด — เว้นว่างถ้าเท่ากับ course_price"
          >
            <input
              type="number"
              min="0"
              step="1"
              name="course_netprice"
              defaultValue={initial?.course_netprice ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="ลำดับแสดงผล (sort_order)">
            <input
              type="number"
              step="1"
              name="sort_order"
              defaultValue={initial?.sort_order ?? 0}
              className={inputCls}
            />
          </Field>
        </div>

        <Field
          label="หลักสูตรก่อนหน้า (previous_course)"
          hint="เลือกหลักสูตรที่เป็นพื้นฐานก่อน — ใช้ใน roadmap"
        >
          <select
            name="previous_course"
            value={previousCourse}
            onChange={(e) => setPreviousCourse(e.target.value)}
            className={inputCls}
          >
            <option value="">— ไม่มี —</option>
            {allCourses
              .filter((c) => c?.course_id && c.course_id !== initial?.course_id)
              .map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_name_th || c.course_name} ({c.course_id})
                </option>
              ))}
          </select>
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 3 — รูปแบบคอร์ส (checkboxes)
      ─────────────────────────────────────────────────────────── */}
      <Section title="3. รูปแบบคอร์ส">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CheckboxField
            name="course_type_public"
            label="Public (เผยแพร่บนเว็บ)"
            defaultChecked={initial ? initial.course_type_public !== false : true}
          />
          <CheckboxField
            name="course_type_inhouse"
            label="In-house (รับจัดในองค์กร)"
            defaultChecked={Boolean(initial?.course_type_inhouse)}
          />
          <CheckboxField
            name="course_workshop_status"
            label="Workshop"
            defaultChecked={Boolean(initial?.course_workshop_status)}
          />
          <CheckboxField
            name="course_certificate_status"
            label="มอบใบรับรอง (Certificate)"
            defaultChecked={Boolean(initial?.course_certificate_status)}
          />
          <CheckboxField
            name="course_promote_status"
            label="โปรโมตเป็นพิเศษ"
            defaultChecked={Boolean(initial?.course_promote_status)}
          />
        </div>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 4 — โปรแกรม & สกิล
      ─────────────────────────────────────────────────────────── */}
      <Section title="4. โปรแกรม และ Skills">
        <Field label="โปรแกรม (program)">
          <select
            name="program"
            defaultValue={programId}
            className={inputCls}
          >
            <option value="">— ไม่ระบุ —</option>
            {programs.map((p) => (
              <option key={p._id ?? p.program_id} value={p._id ?? p.program_id}>
                {p.name ?? p.program_name ?? p.label ?? p._id}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Skills" hint="กดเลือกหลายค่าได้">
          <div className="flex flex-wrap gap-1.5">
            {skills.length === 0 && (
              <span className="text-xs text-9e-slate-dp-50">
                โหลด skills ไม่ได้
              </span>
            )}
            {skills.map((s) => {
              const id = String(s._id ?? s.skill_id ?? '');
              if (!id) return null;
              const active = selectedSkillIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSkill(id)}
                  className={
                    'rounded-full px-3 py-1 text-xs transition-colors ' +
                    (active
                      ? 'bg-9e-action text-white'
                      : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                  }
                >
                  {s.name ?? s.skill_name ?? id}
                </button>
              );
            })}
          </div>
          {selectedSkillIds.map((id) => (
            <input key={id} type="hidden" name="skills" value={id} />
          ))}
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 5 — Related courses (max 5)
      ─────────────────────────────────────────────────────────── */}
      <Section
        title="5. หลักสูตรที่เกี่ยวข้อง"
        hint="พิมพ์เพื่อค้นหา แล้วคลิกเพื่อเพิ่ม (สูงสุด 5 หลักสูตร)"
      >
        {relatedCodes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {relatedCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-9e-action px-3 py-0.5 text-xs text-white"
              >
                <span className="font-mono">{code}</span>
                <span className="opacity-80">·</span>
                <span>{codeToName.get(code) || code}</span>
                <button
                  type="button"
                  onClick={() => dropRelated(code)}
                  aria-label="ลบ"
                  className="ml-1 rounded-full hover:bg-white/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {relatedCodes.length < 5 && (
          <div className="relative">
            <input
              type="text"
              value={relatedQuery}
              onChange={(e) => setRelatedQuery(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา course_id หรือชื่อ"
              className={inputCls}
            />
            {relatedQuery && relatedOptions.length > 0 && (
              <ul className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white shadow-lg dark:bg-[#0D1B2A]">
                {relatedOptions.map((c) => (
                  <li key={c.course_id}>
                    <button
                      type="button"
                      onClick={() => pickRelated(c.course_id)}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#111d2c]"
                    >
                      <span className="font-mono text-9e-action">
                        {c.course_id}
                      </span>{' '}
                      <span className="text-9e-navy dark:text-white">
                        {c.course_name_th || c.course_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {relatedCodes.map((code) => (
          <input key={code} type="hidden" name="related_courses" value={code} />
        ))}
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 6 — รายละเอียดคอร์ส (bullets)
      ─────────────────────────────────────────────────────────── */}
      <Section title="6. รายละเอียดคอร์ส">
        <BulletTextarea
          name="course_objectives"
          label="วัตถุประสงค์ (course_objectives)"
          hint="แต่ละบรรทัดคือหนึ่งวัตถุประสงค์"
          defaultValue={initial?.course_objectives}
        />
        <BulletTextarea
          name="course_target_audience"
          label="กลุ่มเป้าหมาย (course_target_audience)"
          defaultValue={initial?.course_target_audience}
        />
        <BulletTextarea
          name="course_prerequisites"
          label="ความรู้พื้นฐาน (course_prerequisites)"
          defaultValue={initial?.course_prerequisites}
        />
        <BulletTextarea
          name="course_system_requirements"
          label="ความต้องการของระบบ (course_system_requirements)"
          defaultValue={initial?.course_system_requirements}
        />
        <BulletTextarea
          name="bullets"
          label="ไฮไลต์ (bullets)"
          hint="คำโปรย bullet ที่แสดงในหน้า course"
          defaultValue={initial?.bullets}
        />
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 7 — Training Topics
      ─────────────────────────────────────────────────────────── */}
      <Section
        title="7. หัวข้ออบรม (training_topics)"
        hint="แต่ละหัวข้อหลักมีหัวข้อย่อยได้หลายอัน — 1 บรรทัด = 1 หัวข้อย่อย"
      >
        <TrainingTopicsEditor
          name="training_topics"
          initialTopics={Array.isArray(initial?.training_topics)
            ? initial.training_topics.map((t) => ({
                topic: t?.topic ?? '',
                subtopics: Array.isArray(t?.subtopics)
                  ? t.subtopics
                  : (t?.subtopics ?? ''),
              }))
            : []}
        />
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 8 — เอกสาร/ลิงก์ประกอบ (URL arrays)
      ─────────────────────────────────────────────────────────── */}
      <Section title="8. เอกสาร / ลิงก์ประกอบ">
        <BulletTextarea
          name="course_doc_paths"
          label="เอกสารประกอบ (course_doc_paths)"
          defaultValue={initial?.course_doc_paths}
          urls
        />
        <BulletTextarea
          name="course_lab_paths"
          label="ไฟล์ Lab (course_lab_paths)"
          defaultValue={initial?.course_lab_paths}
          urls
        />
        <BulletTextarea
          name="course_case_study_paths"
          label="Case study (course_case_study_paths)"
          defaultValue={initial?.course_case_study_paths}
          urls
        />
        <BulletTextarea
          name="website_urls"
          label="เว็บไซต์อ้างอิง (website_urls)"
          defaultValue={initial?.website_urls}
          urls
        />
        <BulletTextarea
          name="exam_links"
          label="ลิงก์ข้อสอบ (exam_links)"
          defaultValue={initial?.exam_links}
          urls
        />
      </Section>

      {/* ─── Submit row ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : mode === 'edit' ? 'บันทึก' : 'สร้าง'}
        </button>
        <Link
          href="/admin/courses"
          className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}

// ── shared bits ─────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:border-9e-action focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

function Section({ title, hint, children }) {
  return (
    <section className="space-y-4 rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]">
      <div>
        <h2 className="text-base font-bold text-9e-navy dark:text-white">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-9e-navy dark:text-white">
        {label}
      </span>
      {hint && (
        <span className="mt-0.5 block text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </span>
      )}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CheckboxField({ name, label, defaultChecked }) {
  return (
    <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
