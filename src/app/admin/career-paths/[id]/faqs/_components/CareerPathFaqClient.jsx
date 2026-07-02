'use client';

/**
 * CareerPathFaqClient — page-level wrapper around CourseFaqManager for a single
 * career path. Adds the back-link + header, then delegates all CRUD to the
 * shared manager with course_type 'career_path'.
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CourseFaqManager } from '@/app/admin/_components/CourseFaqManager';

export function CareerPathFaqClient({ careerPath, initialFaqs = [] }) {
  const refId = careerPath?.career_path_id;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/career-paths"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
        >
          <ChevronLeft className="h-4 w-4" />
          กลับไปยังรายการ Career Path
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
        จัดการ FAQ — {careerPath?.title || '(ไม่มีชื่อ)'}
      </h1>
      <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        Career Path · {refId}
      </p>

      <div className="mt-6">
        <CourseFaqManager
          courseType="career_path"
          refId={refId}
          initialFaqs={initialFaqs}
        />
      </div>
    </div>
  );
}
