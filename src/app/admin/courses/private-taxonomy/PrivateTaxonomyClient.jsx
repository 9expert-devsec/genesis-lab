'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import {
  createPrivateTaxonomyItem,
  updatePrivateTaxonomyItem,
  deletePrivateTaxonomyItem,
} from '@/lib/actions/private-taxonomy';

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const EMPTY = { kind: 'program', name: '', logoUrl: '', color: '#005CFF' };
const inputCls =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm';

/** Colour input + hex text + a live swatch, as one control. */
function ColorField({ value, onChange }) {
  const valid = HEX6.test(value ?? '');
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="เลือกสี"
        value={valid ? value : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-11 shrink-0 cursor-pointer rounded-9e-sm border border-[var(--surface-border)] p-0.5"
      />
      <input
        type="text"
        value={value ?? ''}
        placeholder="#RRGGBB"
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={value && !valid ? true : undefined}
        className={`${inputCls} font-mono ${value && !valid ? 'border-red-400' : ''}`}
      />
      <span
        aria-hidden="true"
        className="h-9 w-16 shrink-0 rounded-9e-sm border border-[var(--surface-border)]"
        style={{ background: valid ? `linear-gradient(135deg, ${value}, #ffffff)` : 'transparent' }}
        title="ตัวอย่างพื้นหลัง hero"
      />
    </div>
  );
}

function ItemForm({ initial, onDone }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial ?? EMPTY);
  const [error, setError] = useState(null);
  const isEdit = Boolean(initial?._id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = isEdit
        ? await updatePrivateTaxonomyItem(initial._id, form)
        : await createPrivateTaxonomyItem(form);
      if (res?.ok !== true) {
        setError(res?.error ?? 'บันทึกไม่สำเร็จ');
        return;
      }
      if (!isEdit) setForm(EMPTY);
      router.refresh();
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-9e-md border border-[var(--surface-border)] p-4">
      {!isEdit && (
        <div className="flex gap-4 text-sm" role="radiogroup">
          {[['program', 'โปรแกรม'], ['skill', 'Skill']].map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input type="radio" name="kind" value={v} checked={form.kind === v} onChange={() => set('kind', v)} />
              {l}
            </label>
          ))}
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">ชื่อ *</span>
        <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
      </label>
      <div className="text-sm">
        <span className="mb-1 block font-medium">
          สี {form.kind === 'program' ? '* (พื้นหลัง hero)' : '(ไม่บังคับ)'}
        </span>
        <ColorField value={form.color} onChange={(v) => set('color', v)} />
      </div>
      <ImageUploadField
        name="logoUrl"
        currentUrl={form.logoUrl}
        folder="private-taxonomy"
        label="โลโก้"
        hint="รูปภาพ (JPG/PNG/WebP/SVG) ไม่เกิน 5MB"
        aspect="1/1"
        onChange={(url) => set('logoUrl', url)}
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-9e-md bg-9e-action px-4 py-1.5 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'เพิ่ม'}
        </button>
        {isEdit && (
          <button type="button" onClick={onDone} className="rounded-9e-md border px-4 py-1.5 text-sm">
            ยกเลิก
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ title, rows }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  function remove(row) {
    if (!window.confirm(`ลบ "${row.name}" ?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deletePrivateTaxonomyItem(row._id);
      if (res?.ok !== true) setError(res?.error ?? 'ลบไม่สำเร็จ');
      router.refresh();
    });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">ยังไม่มีรายการ</p>
      ) : (
        <ul className="divide-y divide-[var(--surface-border)] rounded-9e-md border border-[var(--surface-border)]">
          {rows.map((row) => (
            <li key={row._id} className="p-3">
              {editing === row._id ? (
                <ItemForm initial={row} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-full border border-[var(--surface-border)]"
                    style={{ background: row.color || 'transparent' }}
                  />
                  {row.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  ) : null}
                  <span className="flex-1 text-sm font-medium">{row.name}</span>
                  <span className="font-mono text-xs text-[var(--text-secondary)]">{row.color}</span>
                  <button type="button" onClick={() => setEditing(row._id)} className="rounded-9e-md border px-2 py-1 text-xs">
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(row)}
                    className="rounded-9e-md border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrivateTaxonomyClient({ items = [] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <div>
        <h2 className="mb-2 text-lg font-bold text-[var(--text-primary)]">เพิ่มรายการ</h2>
        <ItemForm />
      </div>
      <div className="space-y-8">
        <Section title="โปรแกรม (Custom)" rows={items.filter((i) => i.kind === 'program')} />
        <Section title="Skill (Custom)" rows={items.filter((i) => i.kind === 'skill')} />
      </div>
    </div>
  );
}
