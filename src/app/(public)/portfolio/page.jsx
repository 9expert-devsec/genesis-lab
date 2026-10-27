import PortfolioHero from '@/components/portfolio/PortfolioHero';
import PortfolioStats from '@/components/portfolio/PortfolioStats';
import TrainingSection from '@/components/portfolio/TrainingSection';
import ConsultingSection from '@/components/portfolio/ConsultingSection';
import AwardsSection from '@/components/portfolio/AwardsSection';
import CommunitySection from '@/components/portfolio/CommunitySection';
import PortfolioCTA from '@/components/portfolio/PortfolioCTA';
import PortfolioSectionNav from '@/components/portfolio/PortfolioSectionNav';
import { getSiteStats } from '@/lib/stats/getSiteStats';

export const metadata = {
  title: 'ผลงานของเรา',
  description:
    'ผลงานด้านการฝึกอบรม ที่ปรึกษา รางวัล และ Community ของ 9Expert Training ' +
    'สถาบันฝึกอบรมเทคโนโลยีชั้นนำที่ให้บริการองค์กรกว่า 5,000 แห่งทั่วประเทศ',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/portfolio` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/portfolio` },
};

// Same hourly window as / and /about-us, which read the same getSiteStats();
// an admin save at /admin/about revalidates all three immediately.
export const revalidate = 3600;

export default async function PortfolioPage() {
  const { organizations, learners, courses } = await getSiteStats();
  return (
    <main>
      <PortfolioHero />
      <PortfolioSectionNav />
      <section id="impact">
        <PortfolioStats organizations={organizations} learners={learners} courses={courses} />
      </section>
      <section id="learning"><TrainingSection /></section>
      <section id="consulting"><ConsultingSection /></section>
      <section id="awards"><AwardsSection /></section>
      <section id="community"><CommunitySection /></section>
      <PortfolioCTA />
    </main>
  );
}
