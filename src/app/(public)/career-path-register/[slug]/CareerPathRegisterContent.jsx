import {
  getCareerPathForRegistration,
  getCareerPathPastSchedules,
  getCareerPathWithSchedules,
} from '@/lib/actions/career-paths';
import { siteTodayKey } from '@/lib/articlePublishTime';
import { CareerPathRegisterClient } from './_components/CareerPathRegisterClient';

/** Shared metadata for the step routes — same title on every step, per-step canonical. */
export async function careerPathRegisterMetadata(params, step) {
  const { slug } = await params;
  // Metadata only needs the title — skip the schedule fan-out here.
  const cp = await getCareerPathForRegistration(slug);
  return {
    title: cp?.title
      ? `สมัคร Career Path: ${cp.title}`
      : 'สมัคร Career Path',
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/career-path-register/${slug}/step-${step}`,
    },
  };
}

/**
 * Shared body of `/career-path-register/[slug]/step-1|2|3|4`.
 *
 * Two failure modes — both render here:
 *   - path doesn't exist / inactive    → "ยังไม่เปิดรับสมัคร"
 *   - path exists but registrationOpen is false → same message
 * We don't 404 the closed case so deep links still land on a useful
 * page that explains the state.
 *
 * Step 4 skips the `registrationOpen` check: it is the receipt for a
 * registration that already happened, and closing registration afterwards
 * must not turn that receipt into "ยังไม่เปิดรับสมัคร".
 */
export async function CareerPathRegisterContent({ params, step }) {
  const { slug } = await params;
  const cp = await getCareerPathWithSchedules(slug);

  if (!cp || (step !== 4 && !cp.registrationOpen)) {
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

  // The Transfer Module's past rounds. Not needed on the receipt step, which
  // restores everything it shows from storage. `todayKey` is passed down so the
  // client judges the transfer window against the same Bangkok day the loader
  // flagged `transferable` with, not the visitor's clock.
  const pastSchedulesByCourse = step === 4 ? {} : await getCareerPathPastSchedules(cp);

  return (
    <CareerPathRegisterClient
      careerPath={cp}
      pastSchedulesByCourse={pastSchedulesByCourse}
      todayKey={siteTodayKey()}
      slug={slug}
      step={step}
    />
  );
}
