import { getActiveRecruits } from '@/lib/actions/recruits';
import JoinUsHero from '@/components/join-us/JoinUsHero';
import WhyJoinSection from '@/components/join-us/WhyJoinSection';
import OpenPositionsSection from '@/components/join-us/OpenPositionsSection';
import InstructorCTA from '@/components/join-us/InstructorCTA';

export const metadata = {
  title: 'ร่วมงานกับเรา',
  description:
    'ร่วมงานกับ 9Expert Training สถาบันฝึกอบรมเทคโนโลยีชั้นนำ เปิดรับสมัครวิทยากรและทีมงานที่รักเทคโนโลยี',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/join-us` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/join-us` },
};

export default async function JoinUsPage() {
  const recruits = await getActiveRecruits();
  return (
    <main>
      <JoinUsHero />
      <WhyJoinSection />
      <OpenPositionsSection recruits={recruits} />
      <InstructorCTA />
    </main>
  );
}
