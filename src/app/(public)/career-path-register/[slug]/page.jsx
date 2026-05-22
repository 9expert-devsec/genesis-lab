import {
  getCareerPathForRegistration,
  getCareerPathWithSchedules,
} from '@/lib/actions/career-paths';
import { CareerPathRegisterClient } from './_components/CareerPathRegisterClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  // Metadata only needs the title — skip the schedule fan-out here.
  const cp = await getCareerPathForRegistration(slug);
  return {
    title: cp?.title
      ? `สมัคร Career Path: ${cp.title}`
      : 'สมัคร Career Path',
  };
}

export default async function CareerPathRegisterPage({ params }) {
  const { slug } = await params;
  const cp = await getCareerPathWithSchedules(slug);

  // Two failure modes — both render here:
  //   - path doesn't exist / inactive    → "ยังไม่เปิดรับสมัคร"
  //   - path exists but registrationOpen is false → same message
  // We don't 404 the closed case so deep links still land on a useful
  // page that explains the state.
  if (!cp || !cp.registrationOpen) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          ยังไม่เปิดรับสมัคร
        </h1>
        <p className="mt-3 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          Career Path นี้ยังไม่เปิดรับสมัครในขณะนี้
        </p>
      </div>
    );
  }

  return <CareerPathRegisterClient careerPath={cp} />;
}
