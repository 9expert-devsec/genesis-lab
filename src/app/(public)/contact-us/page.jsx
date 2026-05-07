import ContactHero from '@/components/contact/ContactHero';
import GetInTouchSection from '@/components/contact/GetInTouchSection';
import VideoSection from '@/components/contact/VideoSection';
import TransportMapSection from '@/components/contact/TransportMapSection';
import BusinessInfoSection from '@/components/contact/BusinessInfoSection';
import MapSection from '@/components/contact/MapSection';
import ContactCTA from '@/components/contact/ContactCTA';

export const revalidate = 86400;

export function generateMetadata() {
  return {
    title: 'ติดต่อเรา | 9Expert Training',
    description:
      'ติดต่อ 9Expert Training โทร 02-219-4304 อาคารเอเวอร์กรีน เพลส ซอยวรฤทธิ์ ถนนพญาไท เขตราชเทวี กรุงเทพฯ',
  };
}

export default function ContactPage() {
  return (
    <main>
      <ContactHero />
      <GetInTouchSection />
      <BusinessInfoSection />
      <div
        aria-hidden
        className="h-16 bg-gradient-to-b from-white to-[#060e1a] dark:from-[#060e1a]"
      />
      <VideoSection />
      <TransportMapSection />
      <MapSection />
      <ContactCTA />
    </main>
  );
}
