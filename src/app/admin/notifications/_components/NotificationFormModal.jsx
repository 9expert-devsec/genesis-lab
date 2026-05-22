'use client';

/**
 * NotificationFormModal — create + edit a SiteNotification.
 *
 * The same modal renders both flavours. A pair of tabs at the top
 * swaps the field set (`topbar` ↔ `popup`); the inline preview on the
 * right mirrors form state live using the real production components
 * so editors see the actual render, not an approximation.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  createNotification,
  updateNotification,
} from '@/lib/actions/site-notifications';
import { TopNotificationBarClient } from '@/components/notifications/TopNotificationBarClient';

// ── Helpers ────────────────────────────────────────────────────────

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultFromInitial(initial) {
  return {
    _id:          initial?._id ?? null,
    name:         initial?.name ?? '',
    display_type: initial?.display_type ?? 'topbar',
    active:       Boolean(initial?.active),
    starts_at:    toLocalInputValue(initial?.starts_at),
    ends_at:      toLocalInputValue(initial?.ends_at),
    weight:       Number.isFinite(Number(initial?.weight)) ? Number(initial.weight) : 0,
    page_scope_text: Array.isArray(initial?.page_scope) ? initial.page_scope.join('\n') : '',

    // TopBar
    message:            initial?.message ?? '',
    dismissible:        initial?.dismissible !== false,
    bg_color:           initial?.bg_color   ?? '#2486FF',
    text_color:         initial?.text_color ?? '#FFFFFF',
    bg_image_url:       initial?.bg_image_url ?? '',
    bg_image_public_id: initial?.bg_image_public_id ?? '',
    bg_image_size:      initial?.bg_image_size ?? 'auto',
    btn_label:          initial?.btn_label ?? '',
    btn_action:         initial?.btn_action ?? 'link',
    btn_href:           initial?.btn_href ?? '',
    btn_copy_value:     initial?.btn_copy_value ?? '',
    btn_copy_ok:        initial?.btn_copy_ok ?? 'คัดลอกแล้ว!',
    btn_new_tab:        Boolean(initial?.btn_new_tab),
    btn_bg_color:       initial?.btn_bg_color ?? '',
    btn_text_color:     initial?.btn_text_color ?? '',
    countdown_target:   toLocalInputValue(initial?.countdown_target),

    // Popup
    image_url:       initial?.image_url ?? '',
    image_public_id: initial?.image_public_id ?? '',
    popup_size:      initial?.popup_size ?? 'md',
    click_href:      initial?.click_href ?? '',
    click_new_tab:   initial?.click_new_tab !== false,
    trigger:         initial?.trigger ?? 'delay',
    delay_seconds:   initial?.delay_seconds ?? 3,
    scroll_pct:      initial?.scroll_pct ?? 40,
    cooldown_hours:  initial?.cooldown_hours ?? 24,
  };
}

// ── Reusable bits ──────────────────────────────────────────────────

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

/**
 * Color picker bound to a hex string; the swatch and the text input
 * stay in sync. Empty text → callback gets ''; lets editors clear a
 * color override (so the runtime fallback kicks in).
 */
function ColorInput({ value, onChange, placeholder }) {
  const safe = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 cursor-pointer rounded border border-[var(--surface-border)] bg-white"
      />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '#RRGGBB'}
        className={`${inputClass} flex-1 font-mono uppercase`}
      />
    </div>
  );
}

// ── Popup preview (image-only) ────────────────────────────────────

function PopupPreview({ form, imagePreview }) {
  const sizeClass =
    form.popup_size === 'sm' ? 'max-w-[260px]' :
    form.popup_size === 'lg' ? 'max-w-[380px]' :
    'max-w-[320px]';
  return (
    <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] bg-9e-ice/30 p-4 dark:bg-[#0D1B2A]/30">
      <div className={`mx-auto ${sizeClass} overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        {imagePreview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imagePreview}
            alt="preview"
            className="block h-auto w-full"
            draggable={false}
          />
        ) : (
          <div className="flex h-40 items-center justify-center bg-gray-100 text-xs italic text-gray-400">
            อัปโหลดรูปเพื่อดูพรีวิว
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function NotificationFormModal({ initial, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState(() => defaultFromInitial(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // File state is tracked outside the main form object so a transient
  // File reference never lands in the payload accidentally.
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef(null);

  // Keep the preview in sync with whichever side (popup/topbar) owns the
  // image when the user flips display_type.
  useEffect(() => {
    const initialUrl =
      form.display_type === 'popup' ? form.image_url : form.bg_image_url;
    if (!imageFile) setImagePreview(initialUrl || '');
  }, [form.display_type, form.image_url, form.bg_image_url, imageFile]);

  const isEdit = Boolean(initial?._id);

  function patch(p) {
    setForm((f) => ({ ...f, ...p }));
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview('');
    if (form.display_type === 'popup') {
      patch({ image_url: '', image_public_id: '' });
    } else {
      patch({ bg_image_url: '', bg_image_public_id: '' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Upload image first if a new file was selected. Passing raw File
    // objects through Server Actions trips Vercel's FUNCTION_PAYLOAD_TOO_LARGE.
    let uploadedImageUrl      = form.image_url;
    let uploadedImagePublicId = form.image_public_id;
    let uploadedBgUrl         = form.bg_image_url;
    let uploadedBgPublicId    = form.bg_image_public_id;

    if (imageFile) {
      const fd = new FormData();
      fd.append('file', imageFile);
      fd.append('folder', 'notifications');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'อัปโหลดรูปไม่สำเร็จ');
        setSubmitting(false);
        return;
      }
      if (form.display_type === 'popup') {
        uploadedImageUrl      = json.url;
        uploadedImagePublicId = json.publicId;
      } else {
        uploadedBgUrl      = json.url;
        uploadedBgPublicId = json.publicId;
      }
    }

    const payload = {
      ...form,
      starts_at:        fromLocalInputValue(form.starts_at),
      ends_at:          fromLocalInputValue(form.ends_at),
      countdown_target: fromLocalInputValue(form.countdown_target),
      weight:    Number(form.weight) || 0,
      delay_seconds:  Number(form.delay_seconds)  || 0,
      scroll_pct:     Number(form.scroll_pct)     || 0,
      cooldown_hours: Number(form.cooldown_hours) || 0,
      page_scope: form.page_scope_text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      image_url:          uploadedImageUrl,
      image_public_id:    uploadedImagePublicId,
      bg_image_url:       uploadedBgUrl,
      bg_image_public_id: uploadedBgPublicId,
    };
    delete payload.page_scope_text;

    try {
      const result = isEdit
        ? await updateNotification(form._id, payload)
        : await createNotification(payload);
      if (result?.ok === false) {
        setError(result.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      router.refresh();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  // Synthetic doc for the topbar preview — uses the same fields as a
  // real notification so the preview renders identically to production.
  const previewBar = useMemo(
    () => ({
      _id: form._id || `preview-${form.display_type}`,
      name: form.name,
      message: form.message,
      dismissible: form.dismissible,
      bg_color: form.bg_color,
      text_color: form.text_color,
      bg_image_url: form.display_type === 'topbar' ? imagePreview : '',
      bg_image_size: form.bg_image_size,
      btn_label: form.btn_label,
      btn_action: form.btn_action,
      btn_href: form.btn_href,
      btn_copy_value: form.btn_copy_value,
      btn_copy_ok: form.btn_copy_ok,
      btn_new_tab: form.btn_new_tab,
      btn_bg_color: form.btn_bg_color,
      btn_text_color: form.btn_text_color,
      countdown_target: fromLocalInputValue(form.countdown_target),
      page_scope: [],
    }),
    [form, imagePreview]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-[9501] flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-9e-lg bg-white shadow-2xl dark:bg-[#111d2c]">
        <header className="flex items-center justify-between border-b border-[var(--surface-border)] px-6 py-4">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            {isEdit ? 'แก้ไข Notification' : 'เพิ่ม Notification ใหม่'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-full p-1 text-9e-slate-dp-50 hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#0D1B2A] dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Type tabs */}
        <div className="border-b border-[var(--surface-border)] px-6 pt-3">
          <div className="inline-flex gap-1 rounded-9e-md bg-9e-ice p-1 dark:bg-[#0D1B2A]">
            {[
              { v: 'topbar', l: 'Top Bar' },
              { v: 'popup',  l: 'Popup' },
            ].map((opt) => {
              const active = form.display_type === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    patch({ display_type: opt.v });
                  }}
                  className={
                    'rounded-9e-md px-4 py-1.5 text-sm font-semibold transition-colors ' +
                    (active
                      ? 'bg-white text-9e-action shadow-sm dark:bg-[#111d2c] dark:text-9e-air'
                      : 'text-9e-navy hover:bg-white/60 dark:text-white dark:hover:bg-[#111d2c]/60')
                  }
                >
                  {opt.l}
                </button>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_360px]"
        >
          {/* ── Form fields ──────────────────────────────────────── */}
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {/* Common */}
            <Field label="ชื่อ (สำหรับ Admin)">
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                className={inputClass}
                placeholder="เช่น Black Friday Promo Bar"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="เริ่มแสดง">
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => patch({ starts_at: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="หยุดแสดง">
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => patch({ ends_at: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Weight" hint="ค่าน้อยมาก่อน">
                <input
                  type="number"
                  value={form.weight}
                  onChange={(e) => patch({ weight: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label=" ">
                <label className="mt-2 flex items-center gap-2 text-sm text-9e-navy dark:text-white">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => patch({ active: e.target.checked })}
                  />
                  Active
                </label>
              </Field>
            </div>

            <Field label="Page Scope" hint="เว้นว่างเพื่อแสดงทุกหน้า (1 path/บรรทัด)">
              <textarea
                rows={3}
                value={form.page_scope_text}
                onChange={(e) => patch({ page_scope_text: e.target.value })}
                className={inputClass}
                placeholder={'/promotions\n/training-course'}
              />
            </Field>

            {/* ── TopBar fields ───────────────────────────────── */}
            {form.display_type === 'topbar' && (
              <>
                <Field label="ข้อความ">
                  <input
                    type="text"
                    required
                    value={form.message}
                    onChange={(e) => patch({ message: e.target.value })}
                    className={inputClass}
                    placeholder="ข้อความที่แสดงในแถบ"
                  />
                </Field>

                <Field label=" ">
                  <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
                    <input
                      type="checkbox"
                      checked={form.dismissible}
                      onChange={(e) => patch({ dismissible: e.target.checked })}
                    />
                    อนุญาตให้ผู้ใช้ปิดได้
                  </label>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="สีพื้นหลัง (BG)">
                    <ColorInput
                      value={form.bg_color}
                      onChange={(v) => patch({ bg_color: v })}
                      placeholder="#2486FF"
                    />
                  </Field>
                  <Field label="สีตัวอักษร">
                    <ColorInput
                      value={form.text_color}
                      onChange={(v) => patch({ text_color: v })}
                      placeholder="#FFFFFF"
                    />
                  </Field>
                </div>

                <Field label="ภาพพื้นหลัง (Optional)">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="text-xs"
                  />
                  {imagePreview && (
                    <div className="mt-2 flex items-start gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt=""
                        className="h-20 w-40 rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="text-xs text-red-500 hover:underline"
                      >
                        ลบภาพ
                      </button>
                    </div>
                  )}
                </Field>

                {imagePreview && (
                  <Field label="วิธีปรับขนาดภาพพื้นหลัง">
                    <select
                      value={form.bg_image_size}
                      onChange={(e) => patch({ bg_image_size: e.target.value })}
                      className={inputClass}
                    >
                      <option value="auto">Auto (อัตโนมัติ)</option>
                      <option value="contain">Contain (ทั้งหมด)</option>
                      <option value="cover">Cover (เต็มพื้นที่)</option>
                    </select>
                  </Field>
                )}

                <div className="space-y-3 rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/30 p-3 dark:bg-[#0D1B2A]/30">
                  <p className="text-xs font-bold text-9e-navy dark:text-white">
                    ปุ่ม CTA (Optional)
                  </p>

                  <Field label="Label">
                    <input
                      type="text"
                      value={form.btn_label}
                      onChange={(e) => patch({ btn_label: e.target.value })}
                      className={inputClass}
                      placeholder="เช่น ดูรายละเอียด"
                    />
                  </Field>

                  <Field label="Action">
                    <div className="flex gap-4 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="btn-action"
                          value="link"
                          checked={form.btn_action === 'link'}
                          onChange={() => patch({ btn_action: 'link' })}
                        />
                        Link
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="btn-action"
                          value="copy"
                          checked={form.btn_action === 'copy'}
                          onChange={() => patch({ btn_action: 'copy' })}
                        />
                        Copy
                      </label>
                    </div>
                  </Field>

                  {form.btn_action === 'link' ? (
                    <>
                      <Field label="URL">
                        <input
                          type="text"
                          value={form.btn_href}
                          onChange={(e) => patch({ btn_href: e.target.value })}
                          className={inputClass}
                          placeholder="/promotions/abc หรือ https://…"
                        />
                      </Field>
                      <label className="flex items-center gap-2 text-xs text-9e-navy dark:text-white">
                        <input
                          type="checkbox"
                          checked={form.btn_new_tab}
                          onChange={(e) => patch({ btn_new_tab: e.target.checked })}
                        />
                        เปิดในแท็บใหม่
                      </label>
                    </>
                  ) : (
                    <>
                      <Field label="ค่าที่จะคัดลอก">
                        <input
                          type="text"
                          value={form.btn_copy_value}
                          onChange={(e) => patch({ btn_copy_value: e.target.value })}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="ข้อความหลังคัดลอก">
                        <input
                          type="text"
                          value={form.btn_copy_ok}
                          onChange={(e) => patch({ btn_copy_ok: e.target.value })}
                          className={inputClass}
                        />
                      </Field>
                    </>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="สีพื้นปุ่ม" hint="เว้นว่าง = ใช้สีระบบ">
                      <ColorInput
                        value={form.btn_bg_color}
                        onChange={(v) => patch({ btn_bg_color: v })}
                        placeholder="auto"
                      />
                    </Field>
                    <Field label="สีตัวอักษรปุ่ม" hint="เว้นว่าง = ใช้สีระบบ">
                      <ColorInput
                        value={form.btn_text_color}
                        onChange={(v) => patch({ btn_text_color: v })}
                        placeholder="auto"
                      />
                    </Field>
                  </div>
                </div>

                <Field
                  label="Countdown ถึงวันที่ (Optional)"
                  hint="เว้นว่างถ้าไม่ต้องการนับถอยหลัง — จะแสดง ⏱ HH:MM:SS ในแถบ"
                >
                  <input
                    type="datetime-local"
                    value={form.countdown_target}
                    onChange={(e) => patch({ countdown_target: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </>
            )}

            {/* ── Popup fields ────────────────────────────────── */}
            {form.display_type === 'popup' && (
              <>
                <Field label="รูปภาพ Popup (แนะนำกว้าง ≤ 600px)">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="text-xs"
                  />
                  {imagePreview && (
                    <div className="mt-2 flex items-start gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt=""
                        className="h-32 w-auto max-w-xs rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="text-xs text-red-500 hover:underline"
                      >
                        ลบภาพ
                      </button>
                    </div>
                  )}
                </Field>

                <Field label="URL เมื่อคลิกที่ภาพ (Optional)">
                  <input
                    type="text"
                    value={form.click_href}
                    onChange={(e) => patch({ click_href: e.target.value })}
                    className={inputClass}
                    placeholder="เว้นว่างถ้าไม่ต้องการให้คลิกได้"
                  />
                </Field>

                {form.click_href && (
                  <label className="flex items-center gap-2 text-xs text-9e-navy dark:text-white">
                    <input
                      type="checkbox"
                      checked={form.click_new_tab}
                      onChange={(e) => patch({ click_new_tab: e.target.checked })}
                    />
                    เปิดในแท็บใหม่
                  </label>
                )}

                <Field label="Trigger">
                  <select
                    value={form.trigger}
                    onChange={(e) => patch({ trigger: e.target.value })}
                    className={inputClass}
                  >
                    <option value="immediate">Immediate (แสดงทันที)</option>
                    <option value="delay">Delay (หลังหน่วงเวลา)</option>
                    <option value="exit_intent">Exit Intent (เมื่อ cursor ออกจากหน้า)</option>
                    <option value="scroll">Scroll (เมื่อ scroll ถึง %)</option>
                  </select>
                </Field>

                {form.trigger === 'delay' && (
                  <Field label="หน่วงกี่วินาที">
                    <input
                      type="number"
                      min="0"
                      value={form.delay_seconds}
                      onChange={(e) => patch({ delay_seconds: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                )}

                {form.trigger === 'scroll' && (
                  <Field label="แสดงเมื่อ scroll ถึง (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.scroll_pct}
                      onChange={(e) => patch({ scroll_pct: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                )}

                <Field label="Cooldown (ชั่วโมง)" hint="0 = แสดงทุกครั้ง">
                  <input
                    type="number"
                    min="0"
                    value={form.cooldown_hours}
                    onChange={(e) => patch({ cooldown_hours: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* ── Preview ─────────────────────────────────────────── */}
          <div className="border-t border-[var(--surface-border)] bg-9e-ice/40 px-5 py-4 dark:bg-[#0D1B2A]/40 lg:border-l lg:border-t-0">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50 dark:text-[#94a3b8]">
              Live Preview
            </p>
            {form.display_type === 'topbar' ? (
              <div className="overflow-hidden rounded-9e-md border border-dashed border-[var(--surface-border)]">
                <TopNotificationBarClient bar={previewBar} />
              </div>
            ) : (
              <PopupPreview form={form} imagePreview={imagePreview} />
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="col-span-full flex items-center justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-6 py-3 dark:bg-[#111d2c]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
            >
              {submitting ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้าง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}