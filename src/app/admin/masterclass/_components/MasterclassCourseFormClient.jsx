'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Plus,
  X,
  Upload,
  Download,
  Image as ImageIcon,
  Youtube,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  createMasterclassCourse,
  updateMasterclassCourse,
} from '@/lib/actions/masterclass';
import { SimpleRichTextEditor } from '@/components/admin/SimpleRichTextEditor';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BulletTextarea } from '@/components/admin/BulletTextarea';

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
  const [gradientFrom, setGradientFrom] = useState(course?.hero_gradient_from ?? '#2486FF');
  const [gradientTo,   setGradientTo]   = useState(course?.hero_gradient_to   ?? '#005CFF');
  const [courseOutlineUrl, setCourseOutlineUrl] = useState(course?.course_outline_url ?? '');

  // Section 2.5 — gallery (images + YouTube)
  const [gallery, setGallery] = useState(course?.gallery ?? []);

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

  // Section 7 — system requirements (rich text)
  const [srHtml, setSrHtml] = useState(course?.system_requirements_html ?? '');

  // Section 8 — license options
  const [licenseEnabled, setLicenseEnabled] = useState(course?.license_options?.enabled ?? false);
  const [licenseChoices, setLicenseChoices] = useState(course?.license_options?.choices ?? []);
  const [licenseGlobalAck, setLicenseGlobalAck] = useState(
    course?.license_options?.global_ack ?? {
      enabled: false,
      label_th: 'ยอมรับเงื่อนไขสำหรับผู้เข้าอบรมทุกท่าน',
      popup_title: '',
      html_content: '',
      checkbox_label: 'รับทราบเงื่อนไขทั้งหมด',
    }
  );

  // Section 9 — instructors
  const [instructorIds, setInstructorIds] = useState(course?.instructor_ids ?? []);
  const [instructorList, setInstructorList] = useState([]);
  useEffect(() => {
    fetch('/api/admin/instructors/all')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setInstructorList(data); })
      .catch(() => {});
  }, []);

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

  // gallery operations
  function addImage() {
    setGallery((g) => [...g, { type: 'image', url: '', alt: '', order: g.length }]);
  }
  function addYoutube() {
    setGallery((g) => [...g, { type: 'youtube', videoId: '', alt: '', order: g.length }]);
  }
  function updateRow(i, field, value) {
    setGallery((g) => g.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }
  function removeRow(i) {
    setGallery((g) => g.filter((_, idx) => idx !== i));
  }
  function moveRow(i, dir) {
    setGallery((g) => {
      const j = i + dir;
      if (j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
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
  const updateGlobalAck = (patch) =>
    setLicenseGlobalAck((cur) => ({ ...cur, ...patch }));

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
          modules: [...(s.modules ?? []), { module_no: nextNo, title: '', topics: [], topics_html: '', workshop: '', output: '' }],
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
      hero_gradient_from: gradientFrom,
      hero_gradient_to:   gradientTo,
      gallery: gallery.map((item, i) => ({ ...item, order: i })),
      course_outline_url: courseOutlineUrl.trim(),
      duration_days: Number(durationDays) || 0,
      duration_hours: Number(durationHours) || 0,
      schedule_days: scheduleDays,
      time_start: timeStart,
      time_end: timeEnd,
      level,
      tags,
      suitable_for: (suitableFor ?? [])
        .map((it) => (typeof it === 'string' ? { label: it, image_url: '' } : it))
        .filter((it) => it.label?.trim()),
      prerequisites: prerequisites.filter(Boolean),
      objectives: objectives.filter(Boolean),
      benefits: benefits.filter(Boolean),
      equipment_required: equipmentRequired.filter(Boolean),
      system_requirements_html: srHtml,
      license_options: {
        enabled: licenseEnabled,
        choices: licenseChoices.map((c) => ({
          ...c,
          detail_options: Array.isArray(c.detail_options) ? c.detail_options : parseCsv(c.detail_options),
        })),
        global_ack: licenseGlobalAck,
      },
      instructor_ids: instructorIds,
      curriculum: curriculum.map((s) => ({
        session_label: s.session_label,
        modules: (s.modules ?? []).map((m) => ({
          module_no: Number(m.module_no) || 0,
          title: m.title,
          topics: (m.topics ?? []).filter(Boolean),
          topics_html: m.topics_html ?? '',
          output: m.output ?? '',
          content_html: m.content_html ?? '',
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
        <ImageUploadField
          name="cover_image_url"
          label="Cover Image"
          folder="masterclass"
          currentUrl={coverImageUrl ?? ''}
          aspect="16/9"
          hint="แนะนำขนาด 1280×720px (16:9) — อัพโหลดหรือวาง Cloudinary URL"
          onChange={(url) => setCoverImageUrl(url)}
        />

        {/* Gradient (used when no cover image) */}
        <div className="mt-4">
          <p className="text-sm font-medium text-9e-navy dark:text-white mb-2">
            Hero Gradient (fallback เมื่อไม่มีรูป)
          </p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span>จากสี (From)</span>
              <input
                type="color"
                value={gradientFrom}
                onChange={(e) => setGradientFrom(e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-[var(--surface-border)] p-0.5"
              />
              <span className="font-mono text-xs">{gradientFrom}</span>
            </label>
            <span className="text-gray-300">→</span>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span>ถึงสี (To)</span>
              <input
                type="color"
                value={gradientTo}
                onChange={(e) => setGradientTo(e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-[var(--surface-border)] p-0.5"
              />
              <span className="font-mono text-xs">{gradientTo}</span>
            </label>
            {/* Live preview */}
            <div
              className="h-8 w-24 rounded-lg border border-gray-200"
              style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
            />
          </div>
        </div>

        {/* Course Outline PDF */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-9e-navy dark:text-white">
            Course Outline (PDF)
          </label>
          <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            อัพโหลด PDF หรือวาง URL ตรงๆ
          </p>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              placeholder="https://..."
              value={courseOutlineUrl ?? ''}
              onChange={(e) => setCourseOutlineUrl(e.target.value)}
              className={inputCls + ' flex-1'}
            />
            <label className="flex cursor-pointer items-center gap-1.5 rounded-9e-md border border-9e-action px-3 py-2 text-sm text-9e-action hover:bg-9e-action/5 transition-colors whitespace-nowrap">
              <Upload size={14} />
              อัพโหลด PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('folder', 'masterclass');
                  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
                  const result = await res.json().catch(() => ({}));
                  if (result?.url) setCourseOutlineUrl(result.url);
                }}
              />
            </label>
          </div>
          {courseOutlineUrl && (
            <a
              href={courseOutlineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-9e-action hover:underline"
            >
              <Download size={11} /> ดูไฟล์ที่อัพโหลด
            </a>
          )}
        </div>
      </Section>

      {/* Section 2.5 — Gallery (images + YouTube) */}
      <Section title="2.5 แกลเลอรี (รูป / YouTube)">
        <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          สไลด์ในส่วนหัว (Hero) — เรียงตามลำดับ: วิดีโอ YouTube ก่อน → รูปปก → รูปในแกลเลอรี
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addImage}
            className="inline-flex items-center gap-2 rounded-9e-md border border-9e-action px-4 py-2 text-sm text-9e-action transition-colors hover:bg-9e-action hover:text-white"
          >
            <ImageIcon className="h-4 w-4" />
            เพิ่มรูปภาพ
          </button>
          <button
            type="button"
            onClick={addYoutube}
            className="inline-flex items-center gap-2 rounded-9e-md border border-red-500 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-500 hover:text-white"
          >
            <Youtube className="h-4 w-4" />
            เพิ่ม YouTube
          </button>
        </div>

        {gallery.length === 0 ? (
          <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] py-8 text-center text-sm text-9e-slate-dp-50">
            ยังไม่มีรูปภาพหรือวิดีโอ
          </p>
        ) : (
          <div className="space-y-3">
            {gallery.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-9e-md border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                      item.type === 'youtube'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {item.type === 'youtube' ? (
                      <Youtube className="h-3 w-3" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                    {item.type === 'youtube' ? 'YouTube' : 'Image'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveRow(i, -1)}
                      disabled={i === 0}
                      aria-label="ย้ายขึ้น"
                      className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice disabled:opacity-30 dark:hover:bg-white/5"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(i, 1)}
                      disabled={i === gallery.length - 1}
                      aria-label="ย้ายลง"
                      className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice disabled:opacity-30 dark:hover:bg-white/5"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label="ลบ"
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {item.type === 'youtube' ? (
                  <>
                    <input
                      type="text"
                      value={item.videoId ?? ''}
                      onChange={(e) => updateRow(i, 'videoId', e.target.value)}
                      placeholder="YouTube Video ID (เช่น dQw4w9WgXcQ)"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={item.alt ?? ''}
                      onChange={(e) => updateRow(i, 'alt', e.target.value)}
                      placeholder="คำอธิบาย (alt)"
                      className={inputCls}
                    />
                  </>
                ) : (
                  <>
                    <ImageUploadField
                      name={`gallery_image_${i}`}
                      label="รูปภาพ"
                      folder="masterclass"
                      currentUrl={item.url ?? ''}
                      aspect="16/9"
                      onChange={(url) => updateRow(i, 'url', url)}
                    />
                    <input
                      type="text"
                      value={item.alt ?? ''}
                      onChange={(e) => updateRow(i, 'alt', e.target.value)}
                      placeholder="Alt text (สำหรับ accessibility + SEO)"
                      className={inputCls}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
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
        {/* suitable_for — label + background image per card */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-9e-navy dark:text-white">
              หลักสูตรนี้เหมาะสำหรับ (suitable_for)
            </span>
            <button
              type="button"
              onClick={() =>
                setSuitableFor((cur) => [...(cur ?? []), { label: '', image_url: '' }])
              }
              className="flex items-center gap-1 text-xs text-9e-action hover:underline"
            >
              <Plus size={12} /> เพิ่ม
            </button>
          </div>
          <div className="space-y-3">
            {(suitableFor ?? []).map((item, i) => {
              // Support legacy string[] during migration
              const label     = typeof item === 'string' ? item : item.label;
              const image_url = typeof item === 'string' ? '' : item.image_url;
              return (
                <div
                  key={i}
                  className="flex gap-2 items-start rounded-lg border border-[var(--surface-border)] p-3"
                >
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="เช่น Data / Business Analyst"
                      value={label}
                      onChange={(e) => {
                        const next = [...(suitableFor ?? [])];
                        next[i] = { label: e.target.value, image_url };
                        setSuitableFor(next);
                      }}
                      className={inputCls}
                    />
                    <ImageUploadField
                      name={`suitable_for_image_${i}`}
                      label="Background Image (hover)"
                      folder="masterclass"
                      currentUrl={image_url}
                      aspect="16/9"
                      hint="ภาพ background เมื่อ hover — แนะนำ 400×300px"
                      onChange={(url) => {
                        const next = [...(suitableFor ?? [])];
                        next[i] = { label, image_url: url };
                        setSuitableFor(next);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSuitableFor((cur) => (cur ?? []).filter((_, j) => j !== i))
                    }
                    className="mt-1 text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <BulletTextarea
          label="พื้นฐานของผู้เข้าอบรม (prerequisites)"
          hint="1 บรรทัด = 1 รายการ"
          rows={6}
          defaultValue={prerequisites ?? []}
          onChange={(raw) =>
            setPrerequisites(raw.split('\n').map((s) => s.trim()).filter(Boolean))
          }
        />

        <BulletTextarea
          label="วัตถุประสงค์ (objectives)"
          hint="1 บรรทัด = 1 รายการ"
          rows={6}
          defaultValue={objectives ?? []}
          onChange={(raw) =>
            setObjectives(raw.split('\n').map((s) => s.trim()).filter(Boolean))
          }
        />

        <BulletTextarea
          label="ประโยชน์ที่จะได้รับ (benefits)"
          hint="1 บรรทัด = 1 รายการ"
          rows={6}
          defaultValue={benefits ?? []}
          onChange={(raw) =>
            setBenefits(raw.split('\n').map((s) => s.trim()).filter(Boolean))
          }
        />

        <BulletTextarea
          label="อุปกรณ์ที่ต้องการ (equipment_required)"
          hint="1 บรรทัด = 1 รายการ"
          rows={3}
          defaultValue={equipmentRequired ?? []}
          onChange={(raw) =>
            setEquipmentRequired(raw.split('\n').map((s) => s.trim()).filter(Boolean))
          }
        />
      </Section>

      {/* Section 7 — System requirements */}
      <Section title="7. ความต้องการของระบบ">
        <SimpleRichTextEditor
          value={srHtml}
          onChange={(html) => setSrHtml(html)}
          placeholder="พิมพ์ความต้องการของระบบ เช่น OS, Browser, บัญชี, โปรแกรม..."
        />
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
                <div className="mt-3 border-t border-[var(--surface-border)] pt-3">
                  <Toggle
                    checked={c.info_popup?.enabled ?? false}
                    onChange={(v) => updateChoice(i, { info_popup: { ...(c.info_popup ?? {}), enabled: v } })}
                    label="เปิด Popup แจ้งเงื่อนไข"
                  />
                  {c.info_popup?.enabled && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className={labelCls}>ชื่อหัวข้อ Popup</label>
                        <input
                          type="text"
                          value={c.info_popup?.popup_title ?? ''}
                          onChange={(e) =>
                            updateChoice(i, {
                              info_popup: { ...(c.info_popup ?? {}), popup_title: e.target.value },
                            })
                          }
                          placeholder="เช่น ข้อกำหนดการใช้ License ส่วนตัว"
                          className={inputCls}
                        />
                        <p className="mt-1 text-xs text-9e-slate-dp-50">
                          ถ้าว่างจะใช้ label_th แทน
                        </p>
                      </div>
                      <div>
                        <label className={labelCls}>เนื้อหา Popup</label>
                        <SimpleRichTextEditor
                          value={c.info_popup?.html_content ?? ''}
                          onChange={(html) =>
                            updateChoice(i, {
                              info_popup: { ...(c.info_popup ?? {}), html_content: html },
                            })
                          }
                          placeholder="พิมพ์เนื้อหาเงื่อนไขที่จะแสดงใน Popup…"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>ข้อความ Checkbox</label>
                        <input
                          type="text"
                          value={c.info_popup?.checkbox_label ?? 'รับทราบเงื่อนไขทั้งหมด'}
                          onChange={(e) => updateChoice(i, { info_popup: { ...(c.info_popup ?? {}), checkbox_label: e.target.value } })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}
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

            <hr className="border-[var(--surface-border)]" />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-9e-navy dark:text-white">
                Global Acknowledgement (แสดงเมื่อเลือก แยกรายคน)
              </p>

              <Toggle
                checked={licenseGlobalAck.enabled}
                onChange={(v) => updateGlobalAck({ enabled: v })}
                label="เปิดใช้ Global Checkbox"
              />

              {licenseGlobalAck.enabled && (
                <div className="space-y-3 rounded-9e-md border border-[var(--surface-border)] p-3">

                  <div>
                    <label className={labelCls}>ข้อความบน Checkbox Card</label>
                    <input
                      type="text"
                      value={licenseGlobalAck.label_th}
                      onChange={(e) => updateGlobalAck({ label_th: e.target.value })}
                      placeholder="ยอมรับเงื่อนไขสำหรับผู้เข้าอบรมทุกท่าน"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>ชื่อหัวข้อ Popup</label>
                    <input
                      type="text"
                      value={licenseGlobalAck.popup_title}
                      onChange={(e) => updateGlobalAck({ popup_title: e.target.value })}
                      placeholder="เช่น เงื่อนไขการใช้ License ทั้งหมด"
                      className={inputCls}
                    />
                    <p className="mt-1 text-xs text-9e-slate-dp-50">ถ้าว่างจะใช้ label_th แทน</p>
                  </div>

                  <div>
                    <label className={labelCls}>เนื้อหา Popup</label>
                    <SimpleRichTextEditor
                      value={licenseGlobalAck.html_content}
                      onChange={(html) => updateGlobalAck({ html_content: html })}
                      placeholder="พิมพ์เนื้อหาเงื่อนไขที่จะแสดงใน Popup…"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>ข้อความ Checkbox ใน Popup</label>
                    <input
                      type="text"
                      value={licenseGlobalAck.checkbox_label}
                      onChange={(e) => updateGlobalAck({ checkbox_label: e.target.value })}
                      className={inputCls}
                    />
                  </div>

                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Section 9 — Instructors */}
      <Section title="9. วิทยากร" defaultOpen={false}>
        <div>
          <label className={labelCls + ' mb-2 block'}>วิทยากร (Instructors)</label>
          {instructorList.length === 0 ? (
            <p className="text-xs text-gray-400">กำลังโหลดรายชื่อวิทยากร...</p>
          ) : (
            <div className="space-y-2">
              {instructorList.map((inst) => {
                const id       = String(inst._id);
                const selected = (instructorIds ?? []).includes(id);
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--surface-border)] px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setInstructorIds((cur) =>
                          selected
                            ? (cur ?? []).filter((x) => x !== id)
                            : [...(cur ?? []), id]
                        )
                      }
                    />
                    {inst.image_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={inst.image_url}
                        alt={inst.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-9e-navy dark:text-white">{inst.name}</p>
                      {inst.title && (
                        <p className="text-xs text-gray-400">{inst.title}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
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
                      <label className="block text-sm font-medium text-9e-navy dark:text-white mb-1">Topics</label>
                      <SimpleRichTextEditor
                        value={mod.topics_html ?? ''}
                        onChange={(html) => updateModule(si, mi, { topics_html: html })}
                        placeholder="พิมพ์หัวข้อ... ใช้ Bullet List หรือ Ordered List ได้"
                      />
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>ผลลัพธ์ (output)</label>
                      <input
                        type="text"
                        value={mod.output ?? ''}
                        onChange={(e) => updateModule(si, mi, { output: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    {/* Additional content (rich text) */}
                    <div className="mt-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">
                        เนื้อหาเพิ่มเติม (HTML) — optional
                      </label>
                      <SimpleRichTextEditor
                        value={mod.content_html ?? ''}
                        onChange={(html) => updateModule(si, mi, { content_html: html })}
                        placeholder="เนื้อหาเพิ่มเติม รายละเอียด หรือ note..."
                      />
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
