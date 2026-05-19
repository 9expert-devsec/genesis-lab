'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCourse, updateCourse } from '@/lib/actions/courses';

/**
 * CourseForm — MSDB-aligned field names (curl-verified).
 *
 * The FormData keys this component emits ARE the MSDB field names, so
 * `shapePayload` in src/lib/actions/courses.js can forward them
 * verbatim:
 *   course_name           display name
 *   course_teaser         card / SEO snippet
 *   title                 LONG rich-text body (yes — MSDB calls it
 *                         "title" even though it's the description)
 *   course_trainingdays   number of training days
 *   course_price          price (THB)
 *   course_cover_url      cover image URL
 *   course_type_public    boolean — show on public site
 *   course_type_inhouse   boolean — available for in-house bookings
 *   program               ObjectId
 *   skills[]              ObjectId[]
 */
export function CourseForm({
  initial = null,
  skills = [],
  programs = [],
  mode = 'create',
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const [courseName, setCourseName]   = useState(initial?.course_name ?? '');
  const [courseTeaser, setCourseTeaser] = useState(initial?.course_teaser ?? '');
  // Note: `initial.title` here is the MSDB body field, not a heading.
  const [bodyTitle, setBodyTitle]     = useState(initial?.title ?? '');
  const [program, setProgram]         = useState(
    initial?.program?._id ?? initial?.program ?? ''
  );
  const initialSkillIds = (() => {
    if (!initial?.skills) return [];
    return initial.skills.map((s) => s?._id ?? s).filter(Boolean);
  })();
  const [skillIds, setSkillIds]       = useState(initialSkillIds);
  const [trainingDays, setTrainingDays] = useState(
    initial?.course_trainingdays != null ? String(initial.course_trainingdays) : ''
  );
  const [price, setPrice]             = useState(
    initial?.course_price != null ? String(initial.course_price) : ''
  );
  const [coverUrl, setCoverUrl]       = useState(initial?.course_cover_url ?? '');
  // Default to public-only for new courses; preserve existing flags on edit.
  const [isPublic, setIsPublic]       = useState(
    initial ? initial.course_type_public !== false : true
  );
  const [isInhouse, setIsInhouse]     = useState(
    Boolean(initial?.course_type_inhouse)
  );

  function toggleSkill(id) {
    setSkillIds((cur) =>
      cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set('course_name',         courseName);
    fd.set('course_teaser',       courseTeaser);
    fd.set('title',               bodyTitle);
    fd.set('program',             program);
    for (const id of skillIds) fd.append('skills', id);
    fd.set('course_trainingdays', trainingDays);
    fd.set('course_price',        price);
    fd.set('course_cover_url',    coverUrl);
    if (isPublic)  fd.set('course_type_public',  'on');
    if (isInhouse) fd.set('course_type_inhouse', 'on');

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

      <div className="grid gap-4 rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]">
        <Field label="ชื่อหลักสูตร *">
          <input
            required
            type="text"
            name="course_name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="คำอธิบายสั้น (course_teaser)" hint="สูงสุด 200 ตัวอักษร — ใช้สำหรับ card / SEO">
          <textarea
            rows={2}
            maxLength={200}
            name="course_teaser"
            value={courseTeaser}
            onChange={(e) => setCourseTeaser(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field
          label="เนื้อหา (title)"
          hint="ฟิลด์ rich-text หลัก — รองรับ HTML. ชื่อ field ใน MSDB คือ &quot;title&quot; แม้จะเก็บ body"
        >
          <textarea
            rows={8}
            name="title"
            value={bodyTitle}
            onChange={(e) => setBodyTitle(e.target.value)}
            className={inputCls + ' font-mono text-xs'}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="โปรแกรม">
            <select
              name="program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
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

          <Field label="ช่องทาง" hint="เลือกได้พร้อมกัน — Public แสดงในเว็บ, Inhouse เปิดให้จองแบบในองค์กร">
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
                <input
                  type="checkbox"
                  name="course_type_public"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4"
                />
                Public (เผยแพร่บนเว็บ)
              </label>
              <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
                <input
                  type="checkbox"
                  name="course_type_inhouse"
                  checked={isInhouse}
                  onChange={(e) => setIsInhouse(e.target.checked)}
                  className="h-4 w-4"
                />
                In-house (รับจัดในองค์กร)
              </label>
            </div>
          </Field>

          <Field label="จำนวนวันอบรม">
            <input
              type="number"
              min="0"
              step="0.5"
              name="course_trainingdays"
              value={trainingDays}
              onChange={(e) => setTrainingDays(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="ราคา (บาท)">
            <input
              type="number"
              min="0"
              step="1"
              name="course_price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Skills" hint="กดเลือกหลายค่าได้">
          <div className="flex flex-wrap gap-1.5">
            {skills.length === 0 && (
              <span className="text-xs text-9e-slate-dp-50">
                โหลด skills ไม่ได้ — สร้างหลักสูตรได้แต่จะไม่มี skill mapping
              </span>
            )}
            {skills.map((s) => {
              const id = s._id ?? s.skill_id;
              const active = skillIds.includes(id);
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
        </Field>

        <Field label="URL รูปหน้าปก (course_cover_url)">
          <input
            type="url"
            name="course_cover_url"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
            className={inputCls + ' font-mono text-xs'}
          />
        </Field>
      </div>

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

const inputCls =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:border-9e-action focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

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
