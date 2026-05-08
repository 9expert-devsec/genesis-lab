import {
  getActiveClientLogos,
  getActiveAtmospherePhotos,
} from '@/lib/actions/portfolio';
import PortfolioHero from '@/components/portfolio/PortfolioHero';
import StatsSection from '@/components/portfolio/StatsSection';
import InhouseSection from '@/components/portfolio/InhouseSection';
import ClientLogosSection from '@/components/portfolio/ClientLogosSection';
import AtmosphereSection from '@/components/portfolio/AtmosphereSection';
import PortfolioCTA from '@/components/portfolio/PortfolioCTA';

export const metadata = {
  title: 'ผลงานของเรา | 9Expert Training',
  description:
    'ผลงานของ 9Expert Training ให้บริการอบรมองค์กรชั้นนำกว่า 5,000 แห่ง ผู้เรียนกว่า 90,000 คน',
};

export default async function PortfolioPage() {
  const [logos, photos] = await Promise.all([
    getActiveClientLogos(),
    getActiveAtmospherePhotos(),
  ]);

  return (
    <main>
      <PortfolioHero />
      {/* <StatsSection /> */}
      <InhouseSection />
      <ClientLogosSection logos={logos} />
      <AtmosphereSection photos={photos} />
      <PortfolioCTA />
    </main>
  );
}
