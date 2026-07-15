'use client';

/**
 * SkillFaqClient — page-level wrapper around CourseFaqManager for a single
 * skill. Adds the back-link + header, then delegates all CRUD to the shared
 * manager with course_type 'skill'.
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CourseFaqManager } from '@/app/admin/_components/CourseFaqManager';

/** Stable FAQ ref — prefer the upstream code (`skill_id`), fall back to `_id`. */
function skillRefId(skill) {
  return String(skill?.skill_id ?? skill?._id ?? '');
}

export function SkillFaqClient({ skill, initialFaqs = [] }) {
  const refId = skillRefId(skill);

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
        จัดการ FAQ — {skill?.skill_name || '(ไม่มีชื่อ)'}
      </h1>
      <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        Skill · {refId}
      </p>

      <div className="mt-6">
        <CourseFaqManager
          courseType="skill"
          refId={refId}
          initialFaqs={initialFaqs}
        />
      </div>
    </div>
  );
}
