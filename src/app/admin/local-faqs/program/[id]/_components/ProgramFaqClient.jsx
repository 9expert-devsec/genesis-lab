'use client';

/**
 * ProgramFaqClient — page-level wrapper around CourseFaqManager for a single
 * program. Adds the back-link + header, then delegates all CRUD to the shared
 * manager with course_type 'program'.
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CourseFaqManager } from '@/app/admin/_components/CourseFaqManager';

/** Stable FAQ ref — prefer the upstream code (`program_id`), fall back to `_id`. */
function programRefId(program) {
  return String(program?.program_id ?? program?._id ?? '');
}

export function ProgramFaqClient({ program, initialFaqs = [] }) {
  const refId = programRefId(program);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/local-faqs"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
        >
          <ChevronLeft className="h-4 w-4" />
          กลับไปยัง FAQ (Local)
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
        จัดการ FAQ — {program?.program_name || '(ไม่มีชื่อ)'}
      </h1>
      <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        Program · {refId}
      </p>

      <div className="mt-6">
        <CourseFaqManager
          courseType="program"
          refId={refId}
          initialFaqs={initialFaqs}
        />
      </div>
    </div>
  );
}
