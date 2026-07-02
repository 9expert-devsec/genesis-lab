'use client';

/**
 * MasterclassFaqClient — page-level wrapper around CourseFaqManager for a single
 * masterclass course. Adds the back-link + header, then delegates all CRUD to
 * the shared manager with course_type 'masterclass'.
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CourseFaqManager } from '@/app/admin/_components/CourseFaqManager';

export function MasterclassFaqClient({ course, initialFaqs = [] }) {
  const refId = String(course?._id ?? '');

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/masterclass"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
        >
          <ChevronLeft className="h-4 w-4" />
          กลับไปยังรายการ Masterclass
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
        จัดการ FAQ — {course?.title_th || '(ไม่มีชื่อ)'}
      </h1>
      <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        Masterclass · {course?.slug}
      </p>

      <div className="mt-6">
        <CourseFaqManager
          courseType="masterclass"
          refId={refId}
          initialFaqs={initialFaqs}
        />
      </div>
    </div>
  );
}
