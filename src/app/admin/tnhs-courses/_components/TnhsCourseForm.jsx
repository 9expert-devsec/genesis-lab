'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Plus } from 'lucide-react';
import { createTnhsCourse } from '@/lib/actions/tnhs-courses';

const inputClass =
  'w-full rounded-9e-md border-2 border-gray-200 bg-transparent px-3 py-2.5 text-sm text-9e-navy placeholder:text-9e-slate-lt-400/60 dark:placeholder:text-9e-slate-dp-400/60 transition-colors focus:border-9e-action focus:outline-none focus:ring-2 focus:ring-9e-action/20';

export function TnhsCourseForm() {
  const router = useRouter();
  const formRef = useRef(null);
  const [cover, setCover] = useState('');
  const [message, setMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Checkboxes only appear in FormData when checked — normalize to the
    // 'true'/'false' string the action expects.
    fd.set('is_active', fd.get('is_active') === 'on' ? 'true' : 'false');

    startTransition(async () => {
      const result = await createTnhsCourse(fd);
      if (result.ok) {
        setMessage({ type: 'ok', text: 'เพิ่ม Course สำเร็จแล้ว' });
        formRef.current?.reset();
        setCover('');
        setTimeout(() => router.refresh(), 300);
      } else {
        setMessage({ type: 'error', text: result.error ?? 'เกิดข้อผิดพลาด' });
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-bold text-9e-navy">
            ชื่อคอร์ส <span className="text-red-500">*</span>
          </label>
          <input
            name="course_name"
            type="text"
            required
            placeholder="เช่น TNHS Data Science Bootcamp"
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-bold text-9e-navy">
            Cover URL (Cloudinary)
          </label>
          <input
            name="cover_url"
            type="url"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            placeholder="https://res.cloudinary.com/..."
            className={inputClass}
          />
          {cover ? (
            <div className="relative mt-2 h-20 w-32 overflow-hidden rounded-9e-sm bg-9e-ice">
              <Image
                src={cover}
                alt="ตัวอย่างปก"
                fill
                className="object-cover"
                sizes="128px"
                unoptimized
              />
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-bold text-9e-navy">
            External URL (TNHS website)
          </label>
          <input
            name="external_url"
            type="url"
            placeholder="https://www.tnhs..."
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-9e-navy">
            ลำดับ (sort order)
          </label>
          <input
            name="sort_order"
            type="number"
            defaultValue={0}
            className={inputClass}
          />
        </div>

        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-9e-navy">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-gray-300 text-9e-action focus:ring-9e-action"
            />
            แสดงในเมนู (active)
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม Course'}
        </button>

        {message && (
          <p
            className={`text-xs font-medium ${
              message.type === 'ok' ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
