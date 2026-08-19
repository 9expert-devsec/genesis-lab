'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import * as LucideIcons from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { createBanner, updateBanner } from '@/lib/actions/banners';
import {
  ALL_TYPE_LABELS,
  BANNER_TYPE_HINTS,
  BANNER_TYPES,
  LEGACY_TYPE_HINTS,
  LEGACY_TYPE_IDS,
  LEGACY_TYPES,
} from '@/lib/banners/bannerTypes';
import { FEATURE_TAG_ICONS } from '@/lib/schemas/banner';

/**
 * The dropdown, built from the shared map instead of a local copy.
 *
 * ── THIS SLICE OFFERS THE LEGACY IDS ONLY ───────────────────────────────────
 * LEGACY_TYPE_IDS, not ALL_TYPE_IDS. The four new types have no form fields
 * behind them yet — no course picker, no article picker — so offering them
 * here would let an admin save a `course` record with nothing in it. The
 * schema ACCEPTS all nine (so nothing has to migrate yet); the form OFFERS
 * five. They widen together in the admin slice.
 *
 * ── THE LABELS LOST THEIR PIXEL SPEC, AND THAT IS THE FIX ───────────────────
 * These five read "Hero Image – Desktop (1920×700)" and so on, while the list
 * screen one click away read "Hero Image (Desktop)". Every one of the five
 * disagreed. The shared map holds the NAME; the spec is a hint, and still
 * renders on the upload field below where it is actionable.
 */
const TYPE_OPTIONS = LEGACY_TYPE_IDS.map((value) => ({
  value,
  label: ALL_TYPE_LABELS[value],
}));

export function BannerForm({ banner }) {
  const isEdit = !!banner?._id;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(banner?.type ?? LEGACY_TYPES.IMAGE_DESKTOP);
  const [imagePreview, setImagePreview] = useState(banner?.image_url ?? '');
  const [featureTags, setFeatureTags] = useState(banner?.feature_tags ?? []);
  const [errors, setErrors] = useState({});

  // BEHAVIOUR UNCHANGED — the literals are gone, the tests are the same ones.
  // `BANNER_TYPES.IMAGE` is the string 'image', so `startsWith` still matches
  // all four legacy image_* ids exactly as before.
  //
  // These two SUBSTRING tests are on borrowed time and the admin slice replaces
  // them: `hasButton` reads a naming convention rather than a field, and
  // `isImage` will answer true for the new `image` id as well — which is right
  // by accident, not by design.
  const isYouTube = type === LEGACY_TYPES.YOUTUBE;
  const isImage   = type.startsWith(BANNER_TYPES.IMAGE);
  const hasButton = type.includes('button');

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function addFeatureTag() {
    setFeatureTags((tags) =>
      tags.length >= 3 ? tags : [...tags, { icon: '', line1: '', line2: '' }]
    );
  }

  function updateFeatureTag(index, field, value) {
    setFeatureTags((tags) =>
      tags.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function removeFeatureTag(index) {
    setFeatureTags((tags) => tags.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.set('active', formData.get('active') === 'on' ? 'true' : 'false');

    startTransition(async () => {
      const result = isEdit
        ? await updateBanner(banner._id, formData)
        : await createBanner(formData);

      if (result.ok) {
        router.push('/admin/banners');
        router.refresh();
      } else {
        setErrors(result.errors ?? {});
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Title */}
      <Field label="ชื่อ Banner *" error={errors.title}>
        <input
          name="title"
          defaultValue={banner?.title ?? ''}
          required
          className={inputCls(errors.title)}
          placeholder="ชื่อ Banner"
        />
      </Field>

      {/* Type selector */}
      <Field label="ประเภท Banner *" error={errors.type}>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={inputCls(errors.type)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {/* YouTube fields */}
      {isYouTube && (
        <>
          <Field
            label="YouTube Video ID *"
            error={errors.youtube_id}
            hint="เช่น vZLIM8SQgdE (ส่วน ID ใน URL: youtube.com/watch?v=ID)"
          >
            <input
              name="youtube_id"
              defaultValue={banner?.youtube_id ?? ''}
              required={isYouTube}
              className={inputCls(errors.youtube_id)}
              placeholder="vZLIM8SQgdE"
            />
          </Field>
          <Field
            label="Slide Text"
            error={errors.slide_text}
            hint="ข้อความแสดงข้างๆ วิดีโอ (HTML ได้)"
          >
            <textarea
              name="slide_text"
              defaultValue={banner?.slide_text ?? ''}
              rows={4}
              className={inputCls(errors.slide_text)}
            />
          </Field>

          {/* Feature tags editor — youtube only */}
          <div>
            <label className="block text-sm font-bold text-9e-navy mb-1.5">
              Feature Tags (สูงสุด 3)
            </label>
            <p className="mb-3 text-xs text-9e-slate-dp-50">
              แสดงใต้ข้อความในแบนเนอร์ YouTube — ไม่บังคับ
            </p>

            <div className="space-y-3">
              {featureTags.map((tag, i) => {
                const Ico = tag.icon ? LucideIcons[tag.icon] : null;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-9e-md border border-gray-200 bg-9e-ice/40 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-9e-md bg-white border border-gray-200 text-9e-navy">
                        {Ico ? <Ico size={18} /> : <span className="text-xs text-9e-slate-dp-50">—</span>}
                      </span>
                      <select
                        value={tag.icon}
                        onChange={(e) => updateFeatureTag(i, 'icon', e.target.value)}
                        className={inputCls(false) + ' w-40'}
                      >
                        <option value="">— ไม่มีไอคอน —</option>
                        {FEATURE_TAG_ICONS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1 space-y-2">
                      <input
                        value={tag.line1}
                        onChange={(e) => updateFeatureTag(i, 'line1', e.target.value)}
                        className={inputCls(false)}
                        placeholder="บรรทัด 1 เช่น ผู้นำระดับโลก"
                        maxLength={60}
                      />
                      <input
                        value={tag.line2}
                        onChange={(e) => updateFeatureTag(i, 'line2', e.target.value)}
                        className={inputCls(false)}
                        placeholder="บรรทัด 2 เช่น ร่วมแบ่งปันมุมมอง"
                        maxLength={60}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFeatureTag(i)}
                      aria-label="ลบแท็ก"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-9e-md
                        text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addFeatureTag}
              disabled={featureTags.length >= 3}
              className="mt-3 px-4 py-2 text-sm font-bold rounded-9e-md border border-gray-300
                text-9e-navy hover:bg-9e-ice transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              เพิ่มแท็ก
            </button>

            <input
              type="hidden"
              name="feature_tags_json"
              value={JSON.stringify(featureTags)}
            />
          </div>
        </>
      )}

      {/* Image upload */}
      {isImage && (
        <Field
          label="รูปภาพ Banner *"
          error={errors.image_url}
          // Was `type.includes('desktop') ? '1920×700…' : '360×584…'` — a sixth
          // copy of the specs AND a substring test that would silently answer
          // "mobile" for the new `image` type, which contains neither word.
          hint={LEGACY_TYPE_HINTS[type] ?? BANNER_TYPE_HINTS[type]}
        >
          <input type="hidden" name="image_url" value={banner?.image_url ?? ''} />
          <input type="hidden" name="image_public_id" value={banner?.image_public_id ?? ''} />
          <input
            type="file"
            name="image_file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:py-2 file:px-4
              file:rounded-9e-md file:border-0 file:text-sm file:font-bold
              file:bg-9e-action file:text-white hover:file:bg-9e-brand file:cursor-pointer"
          />
          {imagePreview && (
            <div className="mt-3 relative w-full h-40 rounded-9e-md overflow-hidden bg-9e-ice border border-[var(--surface-border)]">
              <Image
                src={imagePreview}
                alt="preview"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}
        </Field>
      )}

      {/* Link URL — shared */}
      <Field
        label={isYouTube ? 'URL ลิงก์ที่ปุ่ม' : 'URL ลิงก์ (คลิกที่รูป)'}
        error={errors.link_url}
      >
        <input
          name="link_url"
          type="url"
          defaultValue={banner?.link_url ?? ''}
          className={inputCls(errors.link_url)}
          placeholder="https://..."
        />
      </Field>

      {/* Link text — for button types and youtube */}
      {(hasButton || isYouTube) && (
        <Field
          label="ข้อความปุ่ม (Link Text)"
          error={errors.link_text}
          hint="เช่น ดูหลักสูตรทั้งหมดที่นี่"
        >
          <input
            name="link_text"
            defaultValue={banner?.link_text ?? ''}
            className={inputCls(errors.link_text)}
            placeholder="ดูหลักสูตรทั้งหมดที่นี่"
          />
        </Field>
      )}

      {/* Weight / order */}
      <Field
        label="ลำดับการแสดง (Weight)"
        error={errors.weight}
        hint="ตัวเลขน้อย = แสดงก่อน (ลบได้ เช่น -97 แสดงก่อนสุด)"
      >
        <input
          name="weight"
          type="number"
          defaultValue={banner?.weight ?? 0}
          className={inputCls(errors.weight)}
        />
      </Field>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <input
          name="active"
          type="checkbox"
          id="active"
          defaultChecked={banner?.active ?? true}
          className="w-4 h-4 rounded accent-9e-action"
        />
        <label htmlFor="active" className="text-sm font-medium text-9e-navy">
          แสดง Banner นี้ (Active)
        </label>
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-9e-action hover:bg-9e-brand text-white font-bold
            rounded-9e-md transition-colors disabled:opacity-50 text-sm"
        >
          {isPending ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'สร้าง Banner'}
        </button>
        <a
          href="/admin/banners"
          className="px-6 py-2.5 border border-gray-300 text-9e-slate-dp-50 font-bold
            rounded-9e-md hover:bg-9e-ice transition-colors text-sm"
        >
          ยกเลิก
        </a>
      </div>
    </form>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-9e-navy mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-9e-slate-dp-50">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-500">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError) {
  return `w-full border rounded-9e-md px-4 py-2.5 text-sm text-9e-navy bg-white
    focus:outline-none focus:ring-2 transition-colors
    ${
      hasError
        ? 'border-red-400 focus:ring-red-200'
        : 'border-gray-200 hover:border-9e-air focus:ring-9e-action/20'
    }`;
}
