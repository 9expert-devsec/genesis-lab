'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  createInstructor,
  updateInstructor,
  deleteInstructor,
} from '@/lib/actions/instructors';
import { MAX_PROGRAMS, appendProgramsToForm } from '@/lib/instructors/instructorPrograms';
import { MAX_SPECIALTIES, MAX_SPECIALTY_LENGTH } from '@/lib/instructors/instructorSpecialties';
import { PHOTO_SCALE, PHOTO_OFFSET_Y, PHOTO_OFFSET_X, photoCropValues } from '@/lib/instructors/photoCrop';
import InstructorPhotoPanel from '@/components/about/InstructorPhotoPanel';

export function InstructorsAdminClient({ instructors, programs = [], programsUnavailable = false }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | 'new' | <instructor>
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function handleDelete(i) {
    if (!window.confirm(`ลบวิทยากร "${i.name}" ?`)) return;
    setBusyId(i._id);
    setMsg(null);
    try {
      const res = await deleteInstructor(i._id);
      if (res?.ok) {
        setMsg({ type: 'ok', text: 'ลบสำเร็จ' });
        router.refresh();
      } else {
        setMsg({ type: 'err', text: res?.error ?? 'ลบไม่สำเร็จ' });
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-9e-navy dark:text-white">
              จัดการวิทยากร
            </h1>
            <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              เพิ่ม/แก้ไขข้อมูลวิทยากร — รูปเก็บที่ Cloudinary, master อยู่ที่ MSDB
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
          >
            + เพิ่มวิทยากร
          </button>
        </div>

        {msg && (
          <div
            className={
              'rounded-9e-md px-3 py-2 text-sm ' +
              (msg.type === 'ok'
                ? 'border border-green-200 bg-green-50 text-green-700'
                : 'border border-red-200 bg-red-50 text-red-700')
            }
          >
            {msg.text}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.length === 0 && (
            <p className="col-span-full rounded-9e-lg border border-dashed border-[var(--surface-border)] py-10 text-center text-sm text-9e-slate-dp-50">
              ยังไม่มีวิทยากร — กด <strong>+ เพิ่มวิทยากร</strong>
            </p>
          )}
          {instructors.map((i) => {
            const busy = busyId === i._id;
            return (
              <div
                key={i._id}
                className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]"
              >
                <div className="relative h-40 bg-9e-ice dark:bg-[#0D1B2A]">
                  {i.image_url ? (
                    <Image
                      src={i.image_url}
                      alt={i.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-9e-slate-dp-50">
                      ไม่มีรูป
                    </div>
                  )}
                  {!i.is_active && (
                    <span className="absolute right-2 top-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="text-sm font-bold text-9e-navy dark:text-white">{i.name}</h3>
                  {i.title && (
                    <p className="text-xs text-9e-slate-dp-50">{i.title}</p>
                  )}
                  {Array.isArray(i.specialties) && i.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {i.specialties.slice(0, 4).map((s) => (
                        <span key={s} className="rounded-full bg-9e-ice px-2 py-0.5 text-[10px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditing(i)}
                      className="flex-1 rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      disabled={busy}
                      className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {busy ? '…' : 'ลบ'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Rendered as a SIBLING of the page wrapper, not a child of it.

        `space-y-*` compiles to
            .space-y-N > :not([hidden]) ~ :not([hidden]) { margin-top: … }
        — a rule about CHILDREN. With the modal inside the wrapper its overlay
        picked up that margin-top; the overlay's own `inset-0` sets top AND
        bottom to 0 with height auto, which is over-constrained, so the margin
        won and the fixed layer was pushed down, leaving a band of page showing
        across the top of the viewport. Nothing on the overlay was wrong.

        This one is `space-y-6`, so its band was 24px rather than the 16px on
        the schedules screen — same defect, different gap. Fixed at the
        relationship rather than with an `!mt-0` on the overlay: any margin
        utility on any future wrapper would re-break that patch, while a sibling
        cannot be reached by `space-y-*` at all. See SchedulesAdminClient for
        the full note, including why not a portal.
      */}
      {editing && (
        <InstructorModal
          instructor={editing === 'new' ? null : editing}
          programs={programs}
          programsUnavailable={programsUnavailable}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function InstructorModal({ instructor, programs, programsUnavailable, onClose, onSaved }) {
  const isEdit = Boolean(instructor?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const [name, setName]               = useState(instructor?.name ?? '');
  const [nameEn, setNameEn]           = useState(instructor?.name_en ?? '');
  const [title, setTitle]             = useState(instructor?.title ?? '');
  const [bio, setBio]                 = useState(instructor?.bio ?? '');
  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImagePreview] = useState(instructor?.image_url ?? '');
  const [specialties, setSpecialties] = useState(instructor?.specialties ?? []);
  const [tagInput, setTagInput]       = useState('');
  const [isActive, setIsActive]       = useState(instructor?.is_active !== false);
  // MSDB program _ids in selection order, starting from what MSDB holds (the
  // page resolved it). Always sent back on save — see appendProgramsToForm.
  const [programIds, setProgramIds]   = useState(instructor?.programs ?? []);
  // Card photo crop — genesis-only, defaults when the instructor has none.
  const [crop, setCrop]               = useState(() => photoCropValues(instructor ?? {}));

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function addTag() {
    const v = tagInput.trim();
    if (!v) return;
    if (!specialties.includes(v)) setSpecialties((cur) => [...cur, v]);
    setTagInput('');
  }
  function removeTag(t) {
    setSpecialties((cur) => cur.filter((x) => x !== t));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set('name',    name);
    fd.set('name_en', nameEn);
    fd.set('title',   title);
    fd.set('bio',     bio);
    if (imageFile) fd.set('image', imageFile);
    else if (imagePreview) fd.set('image_url', imagePreview);
    for (const s of specialties) fd.append('specialties', s);
    appendProgramsToForm(fd, programIds);
    fd.set('photo_scale', String(crop.scale));
    fd.set('photo_offset_y', String(crop.offsetY));
    fd.set('photo_offset_x', String(crop.offsetX));
    if (isActive) fd.set('is_active', 'on');

    startTransition(async () => {
      const res = isEdit
        ? await updateInstructor(instructor._id, fd)
        : await createInstructor(fd);
      if (res?.ok) onSaved();
      else setError(res?.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-9e-lg bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            {isEdit ? 'แก้ไขวิทยากร' : 'เพิ่มวิทยากร'}
          </h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-9e-slate-dp-50 hover:text-9e-navy">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ชื่อ (ไทย) *</span>
            <input
              required
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ชื่อ (อังกฤษ)</span>
            <input
              type="text"
              name="name_en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. John Doe"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ตำแหน่ง</span>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ประวัติย่อ</span>
            <textarea
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={inputCls}
            />
          </label>

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">รูปภาพ</span>
            <div className="mt-1 flex items-center gap-3">
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="text-xs"
              />
            </div>
          </div>

          <PhotoCropField
            imageUrl={imagePreview}
            alt={name}
            value={crop}
            onChange={setCrop}
          />

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">ความเชี่ยวชาญ</span>
            <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              แสดงบนการ์ดอาจารย์ในหน้าเกี่ยวกับเรา คั่นด้วย | · สูงสุด {MAX_SPECIALTIES} รายการ รายการละไม่เกิน {MAX_SPECIALTY_LENGTH} ตัวอักษร
            </p>
            <div className="mt-1 flex gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                }}
                placeholder="พิมพ์แล้วกด Enter"
                className={inputCls + ' flex-1'}
              />
              <button type="button" onClick={addTag} className="rounded border border-[var(--surface-border)] px-3 text-9e-navy hover:bg-9e-ice dark:text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {specialties.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {specialties.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
                    {s}
                    <button type="button" onClick={() => removeTag(s)} aria-label="ลบ" className="text-9e-slate-dp-50 hover:text-red-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <ProgramPicker
            programs={programs}
            unavailable={programsUnavailable}
            value={programIds}
            onChange={setProgramIds}
          />

          <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            เผยแพร่ (Active)
          </label>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-6 py-3 dark:bg-[#111d2c]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
            >
              {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้าง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

/**
 * "ตำแหน่งรูปบนการ์ด": zoom and vertical offset for the /about-us card photo,
 * with a live preview rendered by the card's own InstructorPhotoPanel — what
 * the admin sees here is what ships. Saved with the rest of the form.
 */
function PhotoCropField({ imageUrl, alt, value, onChange }) {
  const isDefault =
    value.scale === PHOTO_SCALE.default
    && value.offsetY === PHOTO_OFFSET_Y.default
    && value.offsetX === PHOTO_OFFSET_X.default;
  return (
    <div>
      <span className="text-sm font-medium text-9e-navy dark:text-white">ตำแหน่งรูปบนการ์ด</span>
      <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        ปรับให้ศีรษะอยู่กลางและเห็นถึงช่วงอก ตามที่จะแสดงบนหน้าเกี่ยวกับเรา
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="w-full max-w-[220px] shrink-0 rounded-[18px] bg-9e-navy p-2">
          {imageUrl ? (
            <InstructorPhotoPanel
              imageUrl={imageUrl}
              alt={alt || 'ตัวอย่างรูปบนการ์ด'}
              scale={value.scale}
              offsetY={value.offsetY}
              offsetX={value.offsetX}
              sizes="220px"
              unoptimized={imageUrl.startsWith('blob:')}
            />
          ) : (
            <div className="about-instructor-panel flex items-center justify-center text-xs text-white/70">
              ยังไม่มีรูป
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          <label className="block text-xs text-9e-navy dark:text-white">
            <span className="flex justify-between">
              <span>ซูม</span>
              <span className="tabular-nums text-9e-slate-dp-50">{value.scale}%</span>
            </span>
            <input
              type="range"
              name="photo_scale"
              min={PHOTO_SCALE.min}
              max={PHOTO_SCALE.max}
              step={1}
              value={value.scale}
              onChange={(e) => onChange({ ...value, scale: Number(e.target.value) })}
              className="mt-1 w-full accent-9e-action"
            />
          </label>
          <label className="block text-xs text-9e-navy dark:text-white">
            <span className="flex justify-between">
              <span>เลื่อนขึ้น-ลง</span>
              <span className="tabular-nums text-9e-slate-dp-50">{value.offsetY}%</span>
            </span>
            <input
              type="range"
              name="photo_offset_y"
              min={PHOTO_OFFSET_Y.min}
              max={PHOTO_OFFSET_Y.max}
              step={0.5}
              value={value.offsetY}
              onChange={(e) => onChange({ ...value, offsetY: Number(e.target.value) })}
              className="mt-1 w-full accent-9e-action"
            />
          </label>
          <label className="block text-xs text-9e-navy dark:text-white">
            <span className="flex justify-between">
              <span>เลื่อนซ้าย-ขวา</span>
              <span className="tabular-nums text-9e-slate-dp-50">{value.offsetX}%</span>
            </span>
            <input
              type="range"
              name="photo_offset_x"
              min={PHOTO_OFFSET_X.min}
              max={PHOTO_OFFSET_X.max}
              step={0.5}
              value={value.offsetX}
              onChange={(e) => onChange({ ...value, offsetX: Number(e.target.value) })}
              className="mt-1 w-full accent-9e-action"
            />
          </label>
          <button
            type="button"
            disabled={isDefault}
            onClick={() => onChange({
              scale: PHOTO_SCALE.default,
              offsetY: PHOTO_OFFSET_Y.default,
              offsetX: PHOTO_OFFSET_X.default,
            })}
            className="rounded border border-[var(--surface-border)] px-3 py-1 text-xs text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            รีเซ็ตเป็นค่าเริ่มต้น
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "โปรแกรมที่สอน": chips in selection order (removable) above the list of
 * programs still available to add. Order = the order clicked; no reordering.
 */
function ProgramPicker({ programs, unavailable, value, onChange }) {
  const byId = new Map(programs.map((p) => [p.id, p]));
  const selected = value.map((id) => byId.get(id) ?? { id, name: id, iconUrl: '' });
  const available = programs.filter((p) => !value.includes(p.id));
  const full = value.length >= MAX_PROGRAMS;

  return (
    <div>
      <span className="text-sm font-medium text-9e-navy dark:text-white">โปรแกรมที่สอน</span>
      <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        ไอคอนเหล่านี้จะแสดงบนการ์ดอาจารย์ในหน้าเกี่ยวกับเรา · เลือกได้สูงสุด {MAX_PROGRAMS} รายการ ตามลำดับที่เลือก
      </p>
      {unavailable && (
        <p className="mt-1 text-xs text-red-600">
          โหลดรายการโปรแกรมไม่ได้ — ค่าเดิมจะถูกเก็บไว้ตามเดิม
        </p>
      )}

      {selected.length > 0 && (
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((p, i) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-9e-ice py-0.5 pl-1 pr-2 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
            >
              <span className="text-9e-slate-dp-50">{i + 1}.</span>
              {p.iconUrl && <img src={p.iconUrl} alt="" className="h-4 w-4 object-contain" />}
              {p.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== p.id))}
                aria-label={`เอา ${p.name} ออก`}
                className="text-9e-slate-dp-50 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {!unavailable && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] p-1">
          {available.length === 0 ? (
            <p className="px-2 py-1 text-xs text-9e-slate-dp-50">เลือกครบทุกโปรแกรมแล้ว</p>
          ) : (
            <ul className="grid grid-cols-2 gap-1">
              {available.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => onChange([...value, p.id])}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-9e-navy hover:bg-9e-ice disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
                  >
                    {p.iconUrl ? (
                      <img src={p.iconUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
