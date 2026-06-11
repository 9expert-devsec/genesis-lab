import PortfolioHero from '@/components/portfolio/PortfolioHero';
import PortfolioStats from '@/components/portfolio/PortfolioStats';
import TrainingSection from '@/components/portfolio/TrainingSection';
import ConsultingSection from '@/components/portfolio/ConsultingSection';
import AwardsSection from '@/components/portfolio/AwardsSection';
import CommunitySection from '@/components/portfolio/CommunitySection';
import PortfolioCTA from '@/components/portfolio/PortfolioCTA';
import PortfolioSectionNav from '@/components/portfolio/PortfolioSectionNav';

export const metadata = {
  title: 'ผลงานของเรา | 9Expert Training',
  description:
    'ผลงานด้านการฝึกอบรม ที่ปรึกษา รางวัล และ Community ของ 9Expert Training ' +
    'สถาบันฝึกอบรมเทคโนโลยีชั้นนำที่ให้บริการองค์กรกว่า 5,000 แห่งทั่วประเทศ',
};

export default function PortfolioPage() {
  return (
    <main>
      <PortfolioHero />
      <PortfolioSectionNav />
      <section id="impact"><PortfolioStats /></section>
      <section id="learning"><TrainingSection /></section>
      <section id="consulting"><ConsultingSection /></section>
      <section id="awards"><AwardsSection /></section>
      <section id="community"><CommunitySection /></section>
      <PortfolioCTA />
    </main>
  );
}
