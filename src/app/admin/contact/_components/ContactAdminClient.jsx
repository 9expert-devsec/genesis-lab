'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { toEmbedUrl } from '@/lib/youtube';
import {
  saveContactVideo,
  saveTransportMap,
} from '@/lib/actions/contact';

export function ContactAdminClient({ initialVideo, initialMap }) {
  const [tab, setTab] = useState('video');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { key: 'video',     label: 'วิดีโอ' },
          { key: 'transport', label: 'การเดินทาง' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t.key
                ? 'border-9e-action text-9e-action'
                : 'border-transparent text-9e-slate-dp-50 hover:text-9e-navy dark:hover:text-white')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'video' ? (
        <VideoSection initialVideo={initialVideo} />
      ) : (
        <TransportSection initialMap={initialMap} />
      )}
    </div>
  );
}

// ── Video tab ──────────────────────────────────────────────────────

function VideoSection({ initialVideo }) {
  const [form, setForm] = useState({
    youtube_url: initialVideo?.youtube_url ?? '',
    title_th:    initialVideo?.title_th    ?? '',
    title_en:    initialVideo?.title_en    ?? '',
  });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const embedUrl = toEmbedUrl(form.youtube_url);

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveContactVideo(form);
      if (result?.ok) {
        setFeedback({ type: 'ok', message: 'บันทึกแล้ว' });
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,400px)]">
      <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-white p-6 dark:bg-[#111d2c]">
        <Field
          label="YouTube URL"
          hint="เว้นว่าง = ซ่อนส่วนวิดีโอบนหน้าเว็บ"
        >
          <input
            type="text"
            value={form.youtube_url}
            onChange={update('youtube_url')}
            placeholder="https://youtu.be/... หรือ youtube.com/watch?v=... หรือ /embed/..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
          {form.youtube_url && !embedUrl && (
            <p className="mt-1 text-xs text-red-600">
              URL ไม่ถูกต้อง — ตรวจสอบรูปแบบลิงก์ YouTube
            </p>
          )}
        </Field>

        <Field label="หัวข้อ (ภาษาไทย)">
          <input
            type="text"
            value={form.title_th}
            onChange={update('title_th')}
            placeholder="เช่น แนะนำ 9Expert Training"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
        </Field>

        <Field label="หัวข้อ (English)">
          <input
            type="text"
            value={form.title_en}
            onChange={update('title_en')}
            placeholder="e.g. Welcome to 9Expert Training"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
        </Field>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-lg bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          {feedback && (
            <span className={'text-xs ' + (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')}>
              {feedback.message}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">พรีวิว</p>
        {embedUrl ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-black">
            <iframe
              src={embedUrl}
              title="พรีวิววิดีโอ"
              className="aspect-video w-full"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-[var(--surface-border)] bg-9e-ice text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A] dark:text-[#94a3b8]">
            กรอก URL ที่ถูกต้องเพื่อดูพรีวิว
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transport tab (singleton map) ──────────────────────────────────

function TransportSection({ initialMap }) {
  const [mapForm, setMapForm] = useState({
    image_url:       initialMap?.image_url ?? '',
    image_public_id: initialMap?.image_public_id ?? '',
    caption_th:      initialMap?.caption_th ?? '',
  });
  const [mapFile, setMapFile] = useState(null);
  const [mapPreview, setMapPreview] = useState('');
  const [mapPending, startMapTransition] = useTransition();
  const [mapMessage, setMapMessage] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    setMapFile(file);
    setMapPreview(file ? URL.createObjectURL(file) : '');
  }

  function handleCaptionChange(e) {
    setMapForm((f) => ({ ...f, caption_th: e.target.value }));
  }

  function handleSaveMap() {
    setMapMessage(null);
    startMapTransition(async () => {
      const fd = new FormData();
      fd.append('image_url',       mapForm.image_url);
      fd.append('image_public_id', mapForm.image_public_id);
      fd.append('caption_th',      mapForm.caption_th);
      if (mapFile) fd.append('image_file', mapFile);

      const res = await saveTransportMap(fd);
      if (res?.ok) {
        setMapForm({
          image_url:       res.data.image_url,
          image_public_id: res.data.image_public_id,
          caption_th:      res.data.caption_th,
        });
        setMapFile(null);
        setMapPreview('');
        setMapMessage({ kind: 'success', text: 'บันทึกแผนที่การเดินทางแล้ว' });
      } else {
        setMapMessage({ kind: 'error', text: res?.error || 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  const previewSrc = mapPreview || mapForm.image_url;

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-white p-6 dark:bg-[#111d2c]">
      <Field
        label="รูปแผนที่การเดินทาง"
        hint="แนะนำ: PNG หรือ JPG, อัตราส่วน 16:10, ความกว้างอย่างน้อย 1200px"
      >
        {previewSrc && (
          <div className="relative mb-3 inline-block max-h-72 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
            <Image
              src={previewSrc}
              alt="พรีวิวแผนที่"
              width={800}
              height={500}
              className="max-h-72 w-auto"
              unoptimized
            />
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
        />
      </Field>

      <Field label="คำอธิบายใต้ภาพ (ไม่บังคับ)" hint="ขึ้นบรรทัดใหม่ได้">
        <textarea
          rows={3}
          value={mapForm.caption_th}
          onChange={handleCaptionChange}
          placeholder="เช่น อาคารเอเวอร์กรีน เพลส ชั้น 2 ซอยวรฤทธิ์ ถนนพญาไท"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSaveMap}
          disabled={mapPending}
          className="rounded-lg bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {mapPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {mapMessage && (
          <span
            className={
              'text-xs ' +
              (mapMessage.kind === 'success' ? 'text-green-600' : 'text-red-600')
            }
          >
            {mapMessage.text}
          </span>
        )}
      </div>
    </div>
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
