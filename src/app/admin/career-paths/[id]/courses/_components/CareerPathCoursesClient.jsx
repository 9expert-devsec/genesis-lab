'use client';

/**
 * CareerPathCoursesClient — admin settings for Career Path Registration.
 *
 * Post-redesign this page is now narrowly scoped:
 *   • Toggle registration open/closed.
 *   • Set a manual `requiredSelections` override (legacy field — the
 *     new registration form derives counts from each curriculum group's
 *     `chooseMin/chooseMax`, so 0 = "use curriculum defaults").
 *   • Read-only preview of the curriculum so admins can confirm the
 *     groups + ordering before flipping the toggle. Curriculum is
 *     edited on the main /admin/career-paths/[id]/edit page — not here.
 *
 * The legacy `localCourses` editor was removed. The field still lives
 * on the model for backwards compatibility but the registration flow
 * no longer reads it.
 */

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, Info, Layers } from 'lucide-react';
import { updateCareerPathCourses } from '@/lib/actions/career-paths';

const inputClass =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy placeholder:text-9e-slate-dp-50 focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:bg-[#0D1B2A] dark:text-white';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-9e-navy dark:text-white">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </span>
      )}
    </label>
  );
}

export function CareerPathCoursesClient({ careerPath }) {
  const cpId = careerPath?.career_path_id ?? careerPath?._id;
  const curriculum = Array.isArray(careerPath?.curriculum) ? careerPath.curriculum : [];

  const [requiredSelections, setRequiredSelections] = useState(
    Number(careerPath?.requiredSelections) || 0
  );
  const [registrationOpen, setRegistrationOpen] = useState(
    Boolean(careerPath?.registrationOpen)
  );
  const [bannerUrl, setBannerUrl] = useState(careerPath?.registerBannerUrl ?? '');
  const [bannerPublicId, setBannerPublicId] = useState(
    careerPath?.registerBannerPublicId ?? ''
  );
  const [bannerUploading, setBannerUploading] = useState(false);

  const [saving, startSave] = useTransition();
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  async function handleBannerSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    setToast(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'career-paths');
      const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setToast({ type: 'err', text: json.error || 'อัปโหลด banner ไม่สำเร็จ' });
        return;
      }
      setBannerUrl(json.url ?? '');
      setBannerPublicId(json.publicId ?? '');
    } catch (err) {
      setToast({ type: 'err', text: err?.message ?? 'อัปโหลด banner ไม่สำเร็จ' });
    } finally {
      setBannerUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleBannerClear() {
    setBannerUrl('');
    setBannerPublicId('');
  }

  function handleSave() {
    setToast(null);
    startSave(async () => {
      try {
        const res = await updateCareerPathCourses(cpId, {
          requiredSelections,
          registrationOpen,
          registerBannerUrl:      bannerUrl,
          registerBannerPublicId: bannerPublicId,
        });
        if (res?.ok) {
          setToast({ type: 'ok', text: 'บันทึกสำเร็จ' });
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast({ type: 'err', text: res?.error || 'บันทึกไม่สำเร็จ' });
        }
      } catch (err) {
        setToast({ type: 'err', text: err?.message ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Link
        href="/admin/career-paths"
        className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> กลับไปยังรายการ Career Path
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            ตั้งค่าการลงทะเบียน
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {careerPath?.title || careerPath?.api_slug || cpId}
          </p>
        </div>
        {toast && (
          <span
            className={
              'rounded-full px-3 py-1 text-xs font-medium ' +
              (toast.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-100'
                : 'bg-red-50 text-red-700 border border-red-100')
            }
          >
            {toast.text}
          </span>
        )}
      </header>

      {/* ── Settings ─────────────────────────────────────────── */}
      <section className="space-y-4 rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]">
        <h2 className="text-sm font-bold text-9e-navy dark:text-white">
          ตั้งค่า
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="จำนวนคอร์สที่ต้องเลือก (override)"
            hint="0 = ใช้ค่า chooseMin/chooseMax ที่ตั้งไว้ใน curriculum (แนะนำ)"
          >
            <input
              type="number"
              min={0}
              value={requiredSelections}
              onChange={(e) => setRequiredSelections(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field
            label="สถานะ"
            hint="ปิด = หน้าสมัครจะแสดงข้อความ ‘ยังไม่เปิดรับสมัคร’"
          >
            <label className="mt-2 flex items-center gap-2 text-sm text-9e-navy dark:text-white">
              <input
                type="checkbox"
                checked={registrationOpen}
                onChange={(e) => setRegistrationOpen(e.target.checked)}
              />
              เปิดรับสมัคร
            </label>
          </Field>
        </div>

        <Field
          label="Banner รูปหน้าลงทะเบียน (Optional)"
          hint="แนะนำขนาด 900×300px หรืออัตราส่วน 3:1"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerSelect}
            disabled={bannerUploading}
            className="text-xs"
          />
          {bannerUploading && (
            <p className="mt-2 text-xs text-9e-slate-dp-50">กำลังอัปโหลด…</p>
          )}
          {bannerUrl && (
            <div className="mt-3 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerUrl}
                alt="banner preview"
                className="h-20 w-60 rounded object-cover"
              />
              <button
                type="button"
                onClick={handleBannerClear}
                className="text-xs text-red-600 hover:underline"
              >
                ลบ
              </button>
            </div>
          )}
        </Field>
      </section>

      {/* ── Prerequisite explainer ───────────────────────────── */}
      <section className="flex items-start gap-3 rounded-9e-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-9e-navy dark:border-[#1e3a5f] dark:bg-[#0D1B2A]/50 dark:text-white">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-9e-action" />
        <div className="space-y-2">
          <p className="font-semibold">ลำดับคอร์ส &amp; Prerequisites (อัตโนมัติ)</p>
          <p className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ระบบกำหนดเงื่อนไขก่อนหน้าให้อัตโนมัติ — กลุ่มคอร์สใน curriculum ถูกจัดเรียงเป็นลำดับ
            ผู้สมัครต้องเลือกรอบในกลุ่มก่อนหน้าให้ครบก่อน จึงจะปลดล็อกกลุ่มถัดไปได้ และวันที่เริ่ม
            ในกลุ่มถัดไปต้องมาหลังจากวันที่สิ้นสุดของกลุ่มก่อนหน้าทั้งหมด — ไม่ต้องตั้งค่า prerequisite
            รายคอร์สเอง
          </p>
          <Link
            href={`/admin/career-paths/${cpId}/edit`}
            className="inline-flex items-center gap-1 text-xs font-medium text-9e-action hover:underline"
          >
            แก้ไขลำดับกลุ่มได้ที่ หน้า Career Path Edit
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* ── Curriculum read-only preview ─────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-9e-navy dark:text-white">
            <Layers className="h-4 w-4" /> Curriculum ({curriculum.length} กลุ่ม)
          </h2>
        </div>

        {curriculum.length === 0 ? (
          <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] bg-9e-ice/30 p-8 text-center text-sm text-9e-slate-dp-50 dark:bg-[#0D1B2A]/30">
            ยังไม่มี curriculum — กรุณาเพิ่มกลุ่ม + คอร์สที่หน้า{' '}
            <Link
              href={`/admin/career-paths/${cpId}/edit`}
              className="font-medium text-9e-action hover:underline"
            >
              แก้ไข Career Path
            </Link>
          </div>
        ) : (
          curriculum.map((group, gi) => {
            const kindRaw = String(group?.kind ?? '').toLowerCase();
            const isChoice = kindRaw === 'choice';
            const items = Array.isArray(group?.items) ? group.items : [];
            return (
              <article
                key={gi}
                className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]"
              >
                <header className="mb-3 flex flex-wrap items-baseline gap-2">
                  <span className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] font-medium text-9e-action dark:bg-[#0D1B2A]">
                    กลุ่มที่ {gi + 1}
                  </span>
                  <h3 className="text-base font-bold text-9e-navy dark:text-white">
                    {group.title || `กลุ่มที่ ${gi + 1}`}
                  </h3>
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                      (isChoice
                        ? 'border-amber-100 bg-amber-50 text-amber-700'
                        : 'border-green-100 bg-green-50 text-green-700')
                    }
                  >
                    {isChoice
                      ? `Choice · ${group.chooseMin ?? 1}–${group.chooseMax ?? 1}`
                      : 'Fixed (เลือกทุกคอร์ส)'}
                  </span>
                </header>

                {group.description && (
                  <p className="mb-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {group.description}
                  </p>
                )}

                {items.length === 0 ? (
                  <p className="text-xs italic text-9e-slate-dp-50">
                    ไม่มีคอร์สในกลุ่มนี้
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--surface-border)] text-sm">
                    {items.map((it, ii) => {
                      const code = it?.snap?.code ?? it?.course_id ?? '—';
                      const name = it?.snap?.name ?? it?.externalName ?? '—';
                      return (
                        <li
                          key={ii}
                          className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                        >
                          <span className="font-medium text-9e-navy dark:text-white">
                            {name}
                          </span>
                          <span className="font-mono text-xs text-9e-action">
                            {code}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* ── Save ────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-6 py-3 dark:bg-[#111d2c]">
        <Link
          href="/admin/career-paths"
          className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}
