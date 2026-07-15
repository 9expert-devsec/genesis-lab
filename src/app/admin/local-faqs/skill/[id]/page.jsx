import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { listSkills } from '@/lib/api/skills';
import { getAllLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { SkillFaqClient } from './_components/SkillFaqClient';

export const metadata = { title: 'จัดการ FAQ — Skill' };
export const dynamic = 'force-dynamic';

/** Stable FAQ ref — prefer the upstream code (`skill_id`), fall back to `_id`. */
function skillRefId(skill) {
  return String(skill?.skill_id ?? skill?._id ?? '');
}

export default async function SkillFaqsPage({ params }) {
  await requirePage('local_faqs');

  const { id } = await params;
  const res = await listSkills().catch(() => ({ items: [] }));
  // Tolerant match: resolve by the stable code OR the raw _id (both
  // case-insensitive) so old _id-based links keep working.
  const lower = id.toLowerCase();
  const skill = (res.items ?? []).find(
    (s) =>
      skillRefId(s).toLowerCase() === lower ||
      String(s._id).toLowerCase() === lower
  );
  if (!skill) notFound();

  const faqs = await getAllLocalFaqsForCourse('skill', skillRefId(skill));
  return <SkillFaqClient skill={skill} initialFaqs={faqs} />;
}
