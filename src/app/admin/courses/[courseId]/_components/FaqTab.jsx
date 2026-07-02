'use client';

/**
 * FaqTab — per-course FAQ editor embedded in the course extension editor.
 * `courseId` is the upstream course code, which is the `ref_id` for
 * course_type 'public'. All CRUD lives in the shared CourseFaqManager.
 */

import { CourseFaqManager } from '@/app/admin/_components/CourseFaqManager';

export function FaqTab({ courseId, initialFaqs = [] }) {
  return (
    <CourseFaqManager
      courseType="public"
      refId={courseId}
      initialFaqs={initialFaqs}
    />
  );
}
