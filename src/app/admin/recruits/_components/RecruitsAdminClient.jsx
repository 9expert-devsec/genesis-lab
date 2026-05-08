'use client';

import { useState, useTransition } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Minus,
  X,
  MapPin,
  Clock,
} from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  createRecruit,
  updateRecruit,
  deleteRecruit,
  toggleRecruitActive,
  reorderRecruits,
} from '@/lib/actions/recruits';

const TYPE_LABEL = {
  'full-time':  'งานประจำ',
  'part-time':  'พาร์ทไทม์',
  'contract':   'สัญญาจ้าง',
  'internship': 'ฝึกงาน',
};

const EMPTY_FORM = {
  title:           '',
  slug:            '',
  department:      '',
  location:        '',
  employmentType:  'full-time',
  applyEmail:      '',
  active:          true,
  description:     '',
  responsibilities: [''],
  qualifications:  [''],
  benefits:        [''],
};

export function RecruitsAdminClient({ initialRecruits }) {
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: recruits,
    setItems: setRecruits,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialRecruits, async (next) => {
    setRecruits(next.map((r, idx) => ({ ...r, order: idx })));
    setBusy('__reorder__');
    try {
      await reorderRecruits(next.map((r) => r._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggleActive(row) {
    setBusy(row._id);
    startTransition(async () => {
      await toggleRecruitActive(row._id, !row.active);
      setRecruits((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, active: !r.active } : r))
      );
      setBusy(null);
    });
  }

  function handleDelete(row) {
    if (!window.confirm(`ลบประกาศ "${row.title}"?`)) return;
    setBusy(row._id);
    startTransition(async () => {
      await deleteRecruit(row._id);
      setRecruits((cur) => cur.filter((r) => r._id !== row._id));
      setBusy(null);
    });
  }

  function handleCreated(newDoc) {
    if (newDoc) setRecruits((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    setRecruits((cur) => cur.map((r) => (r._id === updated._id ? updated : r)));
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ทั้งหมด {recruits.length} ตำแหน่ง
        </p>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มตำแหน่งงาน'}
        </button>
      </div>

      {showAdd && (
        <RecruitForm
          mode="create"
          onSubmit={async (formObj) => {
            const res = await createRecruit(formObj);
            if (res?.ok) handleCreated(res.data);
            return res;
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="space-y-2">
        {recruits.length === 0 && (
          <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] bg-white p-10 text-center text-9e-slate-dp-50 dark:bg-[#111d2c] dark:text-[#94a3b8]">
            ยังไม่มีประกาศงาน — กด <strong>เพิ่มตำแหน่งงาน</strong> เพื่อเริ่มต้น
          </div>
        )}

        {recruits.map((row, i) => {
          const isDragging = draggingIndex === i;
          const isDropTarget =
            dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
          const isEditing = editingId === row._id;

          if (isEditing) {
            return (
              <div
                key={row._id}
                className="rounded-9e-lg border border-9e-action/40 bg-white p-1 dark:bg-[#111d2c]"
              >
                <RecruitForm
                  mode="edit"
                  initial={row}
                  onSubmit={async (formObj) => {
                    const res = await updateRecruit(row._id, formObj);
                    if (res?.ok) handleUpdated(res.data);
                    return res;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            );
          }

          return (
            <div
              key={row._id}
              {...getDragProps(i)}
              className={
                'flex items-center gap-3 rounded-9e-lg border border-[var(--surface-border)] bg-white p-3 transition-all duration-150 dark:bg-[#111d2c] ' +
                (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                (row.active ? '' : 'opacity-60')
              }
            >
              <DragHandle />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-9e-navy dark:text-white">
                    {row.title}
                  </h3>
                  {row.department && (
                    <span className="rounded-full bg-9e-signature-950 px-2 py-0.5 text-[11px] text-9e-brand dark:bg-9e-signature-900">
                      {row.department}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {row.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {row.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {TYPE_LABEL[row.employmentType] ?? row.employmentType}
                  </span>
                  <span className="text-[11px]">slug: {row.slug}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleActive(row)}
                disabled={busy === row._id}
                aria-label={row.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                className={`relative h-4 w-8 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  row.active ? 'bg-9e-action' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                    row.active ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingId(row._id);
                  setShowAdd(false);
                }}
                className="inline-flex items-center gap-1 rounded border border-9e-action px-2.5 py-1.5 text-xs text-9e-action hover:bg-9e-action hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" /> แก้ไข
              </button>

              <button
                type="button"
                onClick={() => handleDelete(row)}
                disabled={busy === row._id}
                className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-[#3a1818]"
              >
                <Trash2 className="h-3.5 w-3.5" /> ลบ
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Form ───────────────────────────────────────────────────────────

function RecruitForm({ mode, initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => normalizeForm(initial));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  const setField = (k) => (e) => {
    const value =
      e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value ?? e;
    setForm((f) => ({ ...f, [k]: value }));
  };

  function setListItem(key, idx, value) {
    setForm((f) => {
      const next = [...(f[key] ?? [])];
      next[idx] = value;
      return { ...f, [key]: next };
    });
  }

  function addListItem(key) {
    setForm((f) => ({ ...f, [key]: [...(f[key] ?? []), ''] }));
  }

  function removeListItem(key, idx) {
    setForm((f) => {
      const next = (f[key] ?? []).filter((_, i) => i !== idx);
      return { ...f, [key]: next.length > 0 ? next : [''] };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    const title = form.title.trim();
    if (!title) {
      setFeedback({ type: 'err', message: 'กรุณากรอกชื่อตำแหน่ง' });
      return;
    }
    const description = form.description.trim();
    if (!description) {
      setFeedback({ type: 'err', message: 'กรุณากรอกคำอธิบายตำแหน่ง' });
      return;
    }

    const payload = {
      title,
      slug: form.slug.trim(),
      department:     form.department.trim(),
      location:       form.location.trim(),
      employmentType: form.employmentType,
      applyEmail:     form.applyEmail.trim(),
      active:         Boolean(form.active),
      description,
      responsibilities: form.responsibilities.map((s) => s.trim()).filter(Boolean),
      qualifications:   form.qualifications.map((s) => s.trim()).filter(Boolean),
      benefits:         form.benefits.map((s) => s.trim()).filter(Boolean),
    };

    startTransition(async () => {
      const res = await onSubmit(payload);
      if (!res?.ok) {
        setFeedback({ type: 'err', message: res?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]"
    >
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">
        {mode === 'edit' ? 'แก้ไขตำแหน่งงาน' : 'เพิ่มตำแหน่งงานใหม่'}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="ชื่อตำแหน่งงาน *">
          <Input value={form.title} onChange={setField('title')} placeholder="เช่น Senior Frontend Developer" />
        </Field>
        <Field label="slug" hint="เว้นว่าง = สร้างจากชื่อ">
          <Input value={form.slug} onChange={setField('slug')} placeholder="senior-frontend-developer" />
        </Field>
        <Field label="แผนก">
          <Input value={form.department} onChange={setField('department')} placeholder="Training, Marketing..." />
        </Field>
        <Field label="สถานที่ทำงาน">
          <Input value={form.location} onChange={setField('location')} placeholder="กรุงเทพ, Hybrid..." />
        </Field>
        <Field label="ประเภทงาน">
          <select
            value={form.employmentType}
            onChange={setField('employmentType')}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          >
            <option value="full-time">งานประจำ (full-time)</option>
            <option value="part-time">พาร์ทไทม์ (part-time)</option>
            <option value="contract">สัญญาจ้าง (contract)</option>
            <option value="internship">ฝึกงาน (internship)</option>
          </select>
        </Field>
        <Field label="อีเมลรับใบสมัคร" hint="เว้นว่าง = training@9expert.co.th">
          <Input
            type="email"
            value={form.applyEmail}
            onChange={setField('applyEmail')}
            placeholder="hr@9expert.co.th"
          />
        </Field>
      </div>

      <Field label="คำอธิบายตำแหน่ง *">
        <textarea
          rows={4}
          value={form.description}
          onChange={setField('description')}
          placeholder="ภาพรวมของตำแหน่ง บทบาท และเป้าหมาย"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <DynamicList
        label="หน้าที่รับผิดชอบ"
        values={form.responsibilities}
        onChange={(i, v) => setListItem('responsibilities', i, v)}
        onAdd={() => addListItem('responsibilities')}
        onRemove={(i) => removeListItem('responsibilities', i)}
      />

      <DynamicList
        label="คุณสมบัติที่ต้องการ"
        values={form.qualifications}
        onChange={(i, v) => setListItem('qualifications', i, v)}
        onAdd={() => addListItem('qualifications')}
        onRemove={(i) => removeListItem('qualifications', i)}
      />

      <DynamicList
        label="สวัสดิการ"
        values={form.benefits}
        onChange={(i, v) => setListItem('benefits', i, v)}
        onAdd={() => addListItem('benefits')}
        onRemove={(i) => removeListItem('benefits', i)}
      />

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input
          type="checkbox"
          checked={Boolean(form.active)}
          onChange={setField('active')}
          className="h-4 w-4 rounded accent-9e-action"
        />
        เปิดรับสมัคร
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'เพิ่มตำแหน่ง'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-9e-slate-dp-50 hover:bg-gray-50 dark:border-[#1e3a5f] dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </button>
        {feedback && (
          <span className={'text-xs ' + (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')}>
            {feedback.message}
          </span>
        )}
      </div>
    </form>
  );
}

function normalizeForm(initial) {
  if (!initial) return { ...EMPTY_FORM };
  return {
    title:           initial.title ?? '',
    slug:            initial.slug ?? '',
    department:      initial.department ?? '',
    location:        initial.location ?? '',
    employmentType:  initial.employmentType ?? 'full-time',
    applyEmail:      initial.applyEmail ?? '',
    active:          initial.active ?? true,
    description:     initial.description ?? '',
    responsibilities: initial.responsibilities?.length ? [...initial.responsibilities] : [''],
    qualifications:   initial.qualifications?.length   ? [...initial.qualifications]   : [''],
    benefits:         initial.benefits?.length         ? [...initial.benefits]         : [''],
  };
}

function DynamicList({ label, values, onChange, onAdd, onRemove }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
        {label}
      </p>
      <div className="space-y-2">
        {(values ?? []).map((v, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={v}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={`รายการที่ ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="ลบรายการ"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-9e-slate-dp-50 hover:bg-gray-50 dark:border-[#1e3a5f] dark:hover:bg-[#0D1B2A]"
            >
              <Minus size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 rounded border border-9e-action px-3 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
      >
        <Plus className="h-3 w-3" /> เพิ่มรายการ
      </button>
    </div>
  );
}

function Input({ type = 'text', ...props }) {
  return (
    <input
      type={type}
      {...props}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
    />
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
        {label}
        {hint && <span className="ml-2 font-normal italic">{hint}</span>}
      </p>
      {children}
    </div>
  );
}
