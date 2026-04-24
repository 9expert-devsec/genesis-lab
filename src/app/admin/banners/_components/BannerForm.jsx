'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createBanner, updateBanner } from '@/lib/actions/banners';

const TYPE_OPTIONS = [
  { value: 'youtube',              label: 'Video Banner (YouTube)' },
  { value: 'image_desktop',        label: 'Hero Image – Desktop (1920×700)' },
  { value: 'image_mobile',         label: 'Hero Image – Mobile (360×584)' },
  { value: 'image_button_desktop', label: 'Section Banner + Button – Desktop (1920×700)' },
  { value: 'image_button_mobile',  label: 'Section Banner + Button – Mobile (360×584)' },
];

export function BannerForm({ banner }) {
  const isEdit = !!banner?._id;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(banner?.type ?? 'image_desktop');
  const [imagePreview, setImagePreview] = useState(banner?.image_url ?? '');
  const [errors, setErrors] = useState({});

  const isYouTube = type === 'youtube';
  const isImage   = type.startsWith('image');
  const hasButton = type.includes('button');

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
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
        </>
      )}

      {/* Image upload */}
      {isImage && (
        <Field
          label="รูปภาพ Banner *"
          error={errors.image_url}
          hint={type.includes('desktop') ? '1920×700 px แนะนำ' : '360×584 px แนะนำ'}
        >
          <input type="hidden" name="image_url" value={banner?.image_url ?? ''} />
          <input type="hidden" name="image_public_id" value={banner?.image_public_id ?? ''} />
          <input
            type="file"
            name="image_file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-9e-slate file:mr-4 file:py-2 file:px-4
              file:rounded-9e-md file:border-0 file:text-sm file:font-bold
              file:bg-9e-primary file:text-white hover:file:bg-9e-brand file:cursor-pointer"
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
          className="w-4 h-4 rounded accent-9e-primary"
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
          className="px-6 py-2.5 bg-9e-primary hover:bg-9e-brand text-white font-bold
            rounded-9e-md transition-colors disabled:opacity-50 text-sm"
        >
          {isPending ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'สร้าง Banner'}
        </button>
        <a
          href="/admin/banners"
          className="px-6 py-2.5 border border-gray-300 text-9e-slate font-bold
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
      {hint && <p className="mt-1 text-xs text-9e-slate">{hint}</p>}
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
        : 'border-gray-200 hover:border-9e-sky focus:ring-9e-primary/20'
    }`;
}
