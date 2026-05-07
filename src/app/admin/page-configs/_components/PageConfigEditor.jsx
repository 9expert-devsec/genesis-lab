'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  saveProgramConfig,
  saveSkillConfig,
  deleteProgramConfig,
  deleteSkillConfig,
} from '@/lib/actions/page-configs';

/**
 * Generic editor for ProgramPageConfig / SkillPageConfig. Renders a
 * collapsible row per upstream item; expanding reveals the edit form
 * (urlSlug, metaTitle, metaDescription, ogImage, isPublished).
 *
 * `kind` switches which server action runs; everything else is
 * identical between the two flavours.
 */
export function PageConfigEditor({ kind, items, configs, urlPrefix }) {
  const configById = useMemo(() => {
    const map = new Map();
    for (const c of configs ?? []) {
      const key = kind === 'program' ? c.programId : c.skillId;
      map.set(String(key), c);
    }
    return map;
  }, [configs, kind]);

  const [openId, setOpenId] = useState(null);

  return (
    <ul className="divide-y divide-[var(--surface-border)] rounded-2xl border border-[var(--surface-border)] bg-white dark:bg-9e-navy">
      {items.length === 0 ? (
        <li className="px-4 py-6 text-center text-sm text-9e-slate">
          ไม่พบรายการ
        </li>
      ) : (
        items.map((item) => {
          const config = configById.get(item.id);
          const isOpen = openId === item.id;
          return (
            <li key={item.id} className="px-4 py-3">
              <Row
                item={item}
                config={config}
                urlPrefix={urlPrefix}
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : item.id)}
              />
              {isOpen && (
                <EditForm
                  kind={kind}
                  item={item}
                  config={config}
                  onSaved={() => setOpenId(null)}
                />
              )}
            </li>
          );
        })
      )}
    </ul>
  );
}

function Row({ item, config, urlPrefix, isOpen, onToggle }) {
  const slug = config?.urlSlug || item.id.toLowerCase();
  const isCustomSlug = Boolean(config?.urlSlug);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 text-left"
    >
      {item.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.iconUrl}
          alt=""
          className="h-7 w-7 shrink-0 object-contain"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-9e-navy dark:text-white">
          {item.name}{' '}
          <span className="ml-2 font-normal text-xs text-9e-slate">
            ({item.id})
          </span>
        </p>
        <p className="truncate text-xs text-9e-slate dark:text-[#94a3b8]">
          {urlPrefix}
          <span
            className={
              isCustomSlug
                ? 'font-medium text-9e-action'
                : 'italic text-9e-slate'
            }
          >
            {slug}
          </span>
          {!isCustomSlug && ' (default)'}
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-9e-ice px-2 py-1 text-xs font-medium text-9e-slate dark:bg-[#111d2c] dark:text-[#94a3b8]">
        {isOpen ? 'ปิด' : 'แก้ไข'}
      </span>
    </button>
  );
}

function EditForm({ kind, item, config, onSaved }) {
  const [form, setForm] = useState({
    urlSlug: config?.urlSlug ?? '',
    metaTitle: config?.metaTitle ?? '',
    metaDescription: config?.metaDescription ?? '',
    ogImage: config?.ogImage ?? '',
    isPublished: config?.isPublished ?? true,
  });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  const update = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const onSave = () => {
    setFeedback(null);
    startTransition(async () => {
      const action = kind === 'program' ? saveProgramConfig : saveSkillConfig;
      const result = await action(item.id, form);
      if (result?.ok) {
        setFeedback({ type: 'ok', message: 'บันทึกแล้ว' });
        setTimeout(onSaved, 600);
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  };

  const onDelete = () => {
    if (!config?._id) return;
    if (!window.confirm('ลบการตั้งค่า URL & SEO ของรายการนี้?')) return;
    startTransition(async () => {
      const action = kind === 'program' ? deleteProgramConfig : deleteSkillConfig;
      await action(item.id);
      setForm({
        urlSlug: '',
        metaTitle: '',
        metaDescription: '',
        ogImage: '',
        isPublished: true,
      });
      setFeedback({ type: 'ok', message: 'ลบแล้ว' });
      setTimeout(onSaved, 600);
    });
  };

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-9e-ice p-4 dark:bg-[#0f1e30]">
      <Field label="URL Slug" hint="ไม่ใส่ / นำหน้า เช่น power-bi">
        <input
          type="text"
          value={form.urlSlug}
          onChange={update('urlSlug')}
          placeholder={item.id.toLowerCase()}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white"
        />
      </Field>

      <Field label="Meta Title">
        <input
          type="text"
          value={form.metaTitle}
          onChange={update('metaTitle')}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white"
        />
      </Field>

      <Field label="Meta Description">
        <textarea
          value={form.metaDescription}
          onChange={update('metaDescription')}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white"
        />
      </Field>

      <Field label="OG Image URL">
        <input
          type="url"
          value={form.ogImage}
          onChange={update('ogImage')}
          placeholder="https://..."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-9e-navy dark:text-white"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input
          type="checkbox"
          checked={form.isPublished}
          onChange={update('isPublished')}
          className="h-4 w-4 rounded border-gray-300"
        />
        เผยแพร่หน้านี้ (ถ้าปิด หน้าจะ 404)
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-lg bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {config?._id && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-9e-navy"
          >
            ลบ
          </button>
        )}
        {feedback && (
          <span
            className={
              'text-xs ' +
              (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')
            }
          >
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-9e-slate dark:text-[#94a3b8]">
        {label}
        {hint && <span className="ml-2 font-normal italic">{hint}</span>}
      </p>
      {children}
    </div>
  );
}
