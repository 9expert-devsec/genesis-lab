'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, X } from 'lucide-react';
import {
  createMasterclassCourse,
  updateMasterclassCourse,
} from '@/lib/actions/masterclass';
import { SimpleRichTextEditor } from '@/components/admin/SimpleRichTextEditor';

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
const labelCls = 'block text-sm font-medium text-9e-navy dark:text-white';

const SCHEDULE_DAY_OPTIONS = ['เสาร์', 'อาทิตย์'];

function slugify(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^฀-๿a-z0-9\-_.~]/g, '');
}

function parseCsv(text) {
  return String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className="rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-bold text-9e-navy dark:text-white">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-9e-slate-dp-50 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="space-y-4 border-t border-[var(--surface-border)] px-5 py-4">{children}</div>}
    </fieldset>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </button>
      <span className="text-sm text-9e-navy dark:text-white">{label}</span>
    </label>
  );
}

// ── Dynamic string[] editor ───────────────────────────────────────────────────
function StringListEditor({ label, items, onChange, placeholder = '' }) {
  const add = () => onChange([...(items ?? []), '']);
  const update = (i, v) => onChange(items.map((it, idx) => (idx === i ? v : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div>
      {label && <span className={labelCls}>{label}</span>}
      <div className="mt-1 space-y-2">
        {(items ?? []).map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={it}
              placeholder={placeholder}
              onChange={(e) => update(i, e.target.value)}
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50"
              aria-label="ลบ"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <Plus size={14} /> เพิ่มรายการ
        </button>
      </div>
    </div>
  );
}

export function MasterclassCourseFormClient({ course }) {
  const router = useRouter();
  const isEdit = Boolean(course?._id);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Section 1 — basic
  const [slug, setSlug] = useState(course?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(Boolean(course?.slug));
  const [courseCode, setCourseCode] = useState(course?.course_code ?? '');
  const [titleTh, setTitleTh] = useState(course?.title_th ?? '');
  const [subtitleTh, setSubtitleTh] = useState(course?.subtitle_th ?? '');
  const [level, setLevel] = useState(course?.level ?? 'intermediate');
  const [displayOrder, setDisplayOrder] = useState(course?.display_order ?? 0);
  const [isPublished, setIsPublished] = useState(course?.is_published ?? false);
  const [isActive, setIsActive] = useState(course?.is_active ?? true);

  // Section 2 — cover
  const [coverImageUrl, setCoverImageUrl] = useState(course?.cover_image_url ?? '');

  // Section 3 — schedule
  const [durationDays, setDurationDays] = useState(course?.duration_days ?? 1);
  const [durationHours, setDurationHours] = useState(course?.duration_hours ?? 7);
  const [scheduleDays, setScheduleDays] = useState(course?.schedule_days ?? ['เสาร์']);
  const [timeStart, setTimeStart] = useState(course?.time_start ?? '09:00');
  const [timeEnd, setTimeEnd] = useState(course?.time_end ?? '17:00');

  // Section 4 — description
  const [descriptionHtml, setDescriptionHtml] = useState(course?.description_html ?? '');

  // Section 5 — tags
  const [tags, setTags] = useState(course?.tags ?? []);
  const [tagsText, setTagsText] = useState((course?.tags ?? []).join(', '));

  // Section 6 — dynamic lists
  const [suitableFor, setSuitableFor] = useState(course?.suitable_for ?? []);
  const [prerequisites, setPrerequisites] = useState(course?.prerequisites ?? []);
  const [objectives, setObjectives] = useState(course?.objectives ?? []);
  const [benefits, setBenefits] = useState(course?.benefits ?? []);
  const [equipmentRequired, setEquipmentRequired] = useState(course?.equipment_required ?? []);

  // Section 7 — system requirements
  const sr = course?.system_requirements ?? {};
  const [srOs, setSrOs] = useState(sr.os ?? []);
  const [srBrowsers, setSrBrowsers] = useState(sr.browsers ?? []);
  const [srAccounts, setSrAccounts] = useState(sr.accounts ?? []);
  const [srSoftware, setSrSoftware] = useState(sr.software ?? []);

  // Section 8 — license options
  const [licenseEnabled, setLicenseEnabled] = useState(course?.license_options?.enabled ?? false);
  const [licenseChoices, setLicenseChoices] = useState(course?.license_options?.choices ?? []);

  // Section 9 — instructors
  const [instructorIdsText, setInstructorIdsText] = useState((course?.instructor_ids ?? []).join(', '));

  // Section 10 — curriculum
  const [curriculum, setCurriculum] = useState(course?.curriculum ?? []);

  // ── handlers ────────────────────────────────────────────────────────────────
  function handleTitleChange(v) {
    setTitleTh(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function handleTagsTextChange(v) {
    setTagsText(v);
    setTags(parseCsv(v));
  }

  // license choices
  const addChoice = () =>
    setLicenseChoices((cur) => [
      ...cur,
      { value: '', label_th: '', require_detail: false, detail_type: null, detail_options: [], detail_label_th: '' },
    ]);
  const updateChoice = (i, patch) =>
    setLicenseChoices((cur) => cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeChoice = (i) =>
    setLicenseChoices((cur) => cur.filter((_, idx) => idx !== i));

  // curriculum sessions
  const addSession = () =>
    setCurriculum((cur) => [...cur, { session_label: '', modules: [] }]);
  const updateSession = (si, patch) =>
    setCurriculum((cur) => cur.map((s, idx) => (idx === si ? { ...s, ...patch } : s)));
  const removeSession = (si) =>
    setCurriculum((cur) => cur.filter((_, idx) => idx !== si));
  const moveSession = (si, dir) =>
    setCurriculum((cur) => {
      const next = [...cur];
      const j = si + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });

  // curriculum modules
  const addModule = (si) =>
    setCurriculum((cur) =>
      cur.map((s, idx) => {
        if (idx !== si) return s;
        const nextNo = (s.modules?.length ?? 0) + 1;
        return {
          ...s,
          modules: [...(s.modules ?? []), { module_no: nextNo, title: '', topics: [], workshop: '', output: '' }],
        };
      })
    );
  const updateModule = (si, mi, patch) =>
    setCurriculum((cur) =>
      cur.map((s, idx) =>
        idx !== si
          ? s
          : { ...s, modules: s.modules.map((m, j) => (j === mi ? { ...m, ...patch } : m)) }
      )
    );
  const removeModule = (si, mi) =>
    setCurriculum((cur) =>
      cur.map((s, idx) =>
        idx !== si ? s : { ...s, modules: s.modules.filter((_, j) => j !== mi) }
      )
    );

  function buildData() {
    return {
      slug: slug.trim(),
      course_code: courseCode.trim(),
      title_th: titleTh.trim(),
      subtitle_th: subtitleTh.trim(),
      description_html: descriptionHtml,
      cover_image_url: coverImageUrl.trim(),
      duration_days: Number(durationDays) || 0,
      duration_hours: Number(durationHours) || 0,
      schedule_days: scheduleDays,
      time_start: timeStart,
      time_end: timeEnd,
      level,
      tags,
      suitable_for: suitableFor.filter(Boolean),
      prerequisites: prerequisites.filter(Boolean),
      objectives: objectives.filter(Boolean),
      benefits: benefits.filter(Boolean),
      equipment_required: equipmentRequired.filter(Boolean),
      system_requirements: {
        os: srOs.filter(Boolean),
        browsers: srBrowsers.filter(Boolean),
        accounts: srAccounts.filter(Boolean),
        software: srSoftware.filter(Boolean),
      },
      license_options: {
        enabled: licenseEnabled,
        choices: licenseChoices.map((c) => ({
          ...c,
          detail_options: Array.isArray(c.detail_options) ? c.detail_options : parseCsv(c.detail_options),
        })),
      },
      instructor_ids: parseCsv(instructorIdsText),
      curriculum: curriculum.map((s) => ({
        session_label: s.session_label,
        modules: (s.modules ?? []).map((m) => ({
          module_no: Number(m.module_no) || 0,
          title: m.title,
          topics: (m.topics ?? []).filter(Boolean),
          workshop: m.workshop ?? '',
          output: m.output ?? '',
        })),
      })),
      is_published: isPublished,
      is_active: isActive,
      display_order: Number(displayOrder) || 0,
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!titleTh.trim()) {
      setError('กรุณากรอกชื่อหลักสูตร (title_th)');
      return;
    }
    if (!slug.trim()) {
      setError('กรุณากรอก slug');
      return;
    }
    const data = buildData();
    startTransition(async () => {
      try {
        const res = isEdit
          ? await updateMasterclassCourse(course._id, data)
          : await createMasterclassCourse(data);
        if (res?.ok === false) {
          setError(res.error || 'บันทึกไม่สำเร็จ');
          return;
        }
        router.push('/admin/masterclass');
        router.refresh();
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          {isEdit ? 'แก้ไขหลักสูตร Masterclass' : 'สร้างหลักสูตร Masterclass ใหม่'}
        </h1>
      </div>

      {error && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Section 1 — Basic info */}
      <Section title="1. ข้อมูลพื้นฐาน">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
              placeholder="auto-generate-from-title"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Course Code</label>
            <input type="text" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>ชื่อหลักสูตร (title_th) *</label>
            <input type="text" value={titleTh} onChange={(e) => handleTitleChange(e.target.value)} className={inputCls} required />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>คำโปรย (subtitle_th)</label>
            <input type="text" value={subtitleTh} onChange={(e) => setSubtitleTh(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>ระดับ (level)</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
              <option value="beginner">beginner — เริ่มต้น</option>
              <option value="intermediate">intermediate — กลาง</option>
              <option value="advanced">advanced — สูง</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>ลำดับการแสดง (display_order)</label>
            <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6 pt-1">
          <Toggle checked={isPublished} onChange={setIsPublished} label="เผยแพร่ (is_published)" />
          <Toggle checked={isActive} onChange={setIsActive} label="ใช้งาน (is_active)" />
        </div>
      </Section>

      {/* Section 2 — Cover image */}
      <Section title="2. รูปปก">
        <label className={labelCls}>Cover Image URL (Cloudinary)</label>
        <input
          type="text"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="https://res.cloudinary.com/…"
          className={inputCls}
        />
        {coverImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverImageUrl} alt="ตัวอย่างรูปปก" className="mt-2 h-32 rounded-lg object-cover" />
        )}
      </Section>

      {/* Section 3 — Schedule */}
      <Section title="3. ตารางเวลา">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>จำนวนวัน (duration_days)</label>
            <input type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>จำนวนชั่วโมง (duration_hours)</label>
            <input type="number" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>เวลาเริ่ม (time_start)</label>
            <input type="text" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} placeholder="09:00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>เวลาจบ (time_end)</label>
            <input type="text" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} placeholder="17:00" className={inputCls} />
          </div>
        </div>
        <div>
          <span className={labelCls}>วันที่จัด (schedule_days)</span>
          <div className="mt-2 flex gap-4">
            {SCHEDULE_DAY_OPTIONS.map((day) => (
              <label key={day} className="flex cursor-pointer items-center gap-2 text-sm text-9e-navy dark:text-white">
                <input
                  type="checkbox"
                  checked={scheduleDays.includes(day)}
                  onChange={(e) =>
                    setScheduleDays((cur) =>
                      e.target.checked ? [...cur, day] : cur.filter((d) => d !== day)
                    )
                  }
                  className="h-4 w-4 rounded border-[var(--surface-border)] text-9e-action focus:ring-9e-action"
                />
                {day}
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* Section 4 — Description */}
      <Section title="4. รายละเอียดหลักสูตร">
        <SimpleRichTextEditor
          value={descriptionHtml}
          onChange={setDescriptionHtml}
          placeholder="อธิบายหลักสูตรโดยย่อ…"
        />
      </Section>

      {/* Section 5 — Tags */}
      <Section title="5. แท็ก (Tags)">
        <label className={labelCls}>Tags (คั่นด้วยจุลภาค)</label>
        <input
          type="text"
          value={tagsText}
          onChange={(e) => handleTagsTextChange(e.target.value)}
          placeholder="Power BI, Excel, Data"
          className={inputCls}
        />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-9e-ice px-2 py-0.5 text-xs text-9e-action dark:bg-[#0D1B2A]"
              >
                {t}
                <button
                  type="button"
                  onClick={() => {
                    const next = tags.filter((_, idx) => idx !== i);
                    setTags(next);
                    setTagsText(next.join(', '));
                  }}
                  className="text-9e-slate-dp-50 hover:text-red-500"
                  aria-label="ลบแท็ก"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Section 6 — Dynamic lists */}
      <Section title="6. รายการต่าง ๆ">
        <StringListEditor label="เหมาะสำหรับ (suitable_for)" items={suitableFor} onChange={setSuitableFor} />
        <StringListEditor label="พื้นฐานที่ต้องมี (prerequisites)" items={prerequisites} onChange={setPrerequisites} />
        <StringListEditor label="วัตถุประสงค์ (objectives)" items={objectives} onChange={setObjectives} />
        <StringListEditor label="ประโยชน์ที่ได้รับ (benefits)" items={benefits} onChange={setBenefits} />
        <StringListEditor label="อุปกรณ์ที่ต้องเตรียม (equipment_required)" items={equipmentRequired} onChange={setEquipmentRequired} />
      </Section>

      {/* Section 7 — System requirements */}
      <Section title="7. ความต้องการของระบบ">
        <StringListEditor label="ระบบปฏิบัติการ (os)" items={srOs} onChange={setSrOs} />
        <StringListEditor label="เว็บเบราว์เซอร์ (browsers)" items={srBrowsers} onChange={setSrBrowsers} />
        <StringListEditor label="บัญชีที่ต้องใช้ (accounts)" items={srAccounts} onChange={setSrAccounts} />
        <StringListEditor label="โปรแกรมที่ต้องติดตั้ง (software)" items={srSoftware} onChange={setSrSoftware} />
      </Section>

      {/* Section 8 — License options */}
      <Section title="8. License Options" defaultOpen={false}>
        <Toggle checked={licenseEnabled} onChange={setLicenseEnabled} label="เปิดใช้งาน License Options" />
        {licenseEnabled && (
          <div className="space-y-3">
            {licenseChoices.map((c, i) => (
              <div key={i} className="rounded-9e-md border border-[var(--surface-border)] p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>value</label>
                    <input type="text" value={c.value} onChange={(e) => updateChoice(i, { value: e.target.value })} placeholder="own / 9expert" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>label_th</label>
                    <input type="text" value={c.label_th} onChange={(e) => updateChoice(i, { label_th: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>detail_type</label>
                    <select
                      value={c.detail_type ?? ''}
                      onChange={(e) => updateChoice(i, { detail_type: e.target.value || null })}
                      className={inputCls}
                    >
                      <option value="">none</option>
                      <option value="dropdown">dropdown</option>
                      <option value="text">text</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>detail_label_th</label>
                    <input type="text" value={c.detail_label_th} onChange={(e) => updateChoice(i, { detail_label_th: e.target.value })} className={inputCls} />
                  </div>
                  {c.detail_type === 'dropdown' && (
                    <div className="md:col-span-2">
                      <label className={labelCls}>detail_options (คั่นด้วยจุลภาค)</label>
                      <input
                        type="text"
                        value={Array.isArray(c.detail_options) ? c.detail_options.join(', ') : c.detail_options}
                        onChange={(e) => updateChoice(i, { detail_options: parseCsv(e.target.value) })}
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Toggle checked={c.require_detail} onChange={(v) => updateChoice(i, { require_detail: v })} label="require_detail" />
                  <button type="button" onClick={() => removeChoice(i)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
                    <X size={12} /> ลบตัวเลือก
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addChoice}
              className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              <Plus size={14} /> เพิ่มตัวเลือก
            </button>
          </div>
        )}
      </Section>

      {/* Section 9 — Instructors */}
      <Section title="9. วิทยากร" defaultOpen={false}>
        <label className={labelCls}>Instructor IDs (MongoDB _id, comma-separated)</label>
        <input
          type="text"
          value={instructorIdsText}
          onChange={(e) => setInstructorIdsText(e.target.value)}
          placeholder="65f…, 65a…"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ดู ID ได้จากหน้า /admin/instructors
        </p>
      </Section>

      {/* Section 10 — Curriculum */}
      <Section title="10. หัวข้อการฝึกอบรม (Curriculum)" defaultOpen={false}>
        <div className="space-y-4">
          {curriculum.map((session, si) => (
            <div key={si} className="rounded-9e-md border border-[var(--surface-border)] p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={session.session_label}
                  onChange={(e) => updateSession(si, { session_label: e.target.value })}
                  placeholder="ภาคเช้า (09:00–12:30)"
                  className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm font-semibold text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                />
                <button type="button" onClick={() => moveSession(si, -1)} className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs disabled:opacity-40" disabled={si === 0}>↑</button>
                <button type="button" onClick={() => moveSession(si, 1)} className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs disabled:opacity-40" disabled={si === curriculum.length - 1}>↓</button>
                <button type="button" onClick={() => removeSession(si)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  <X size={12} />
                </button>
              </div>

              <div className="mt-3 space-y-3 pl-3">
                {(session.modules ?? []).map((mod, mi) => (
                  <div key={mi} className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={mod.module_no}
                        onChange={(e) => updateModule(si, mi, { module_no: e.target.value })}
                        className="w-16 rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1.5 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                      />
                      <input
                        type="text"
                        value={mod.title}
                        onChange={(e) => updateModule(si, mi, { title: e.target.value })}
                        placeholder="ชื่อโมดูล"
                        className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-1.5 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                      />
                      <button type="button" onClick={() => removeModule(si, mi)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        <X size={12} />
                      </button>
                    </div>
                    <div className="mt-3">
                      <StringListEditor label="หัวข้อย่อย (topics)" items={mod.topics} onChange={(v) => updateModule(si, mi, { topics: v })} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className={labelCls}>Workshop</label>
                        <input type="text" value={mod.workshop} onChange={(e) => updateModule(si, mi, { workshop: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>ผลลัพธ์ (output)</label>
                        <input type="text" value={mod.output} onChange={(e) => updateModule(si, mi, { output: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addModule(si)}
                  className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                >
                  <Plus size={14} /> เพิ่ม Module
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addSession}
            className="inline-flex items-center gap-1 rounded-9e-md border border-9e-action px-3 py-1.5 text-sm font-medium text-9e-action hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
          >
            <Plus size={14} /> เพิ่ม Session
          </button>
        </div>
      </Section>

      {/* Submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--surface-border)] bg-white/95 px-6 py-3 backdrop-blur dark:bg-[#0D1B2A]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#111d2c]"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-9e-md bg-9e-action px-6 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </form>
  );
}
