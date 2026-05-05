import ContactHero from '@/components/contact/ContactHero';
import ContactCardsSection from '@/components/contact/ContactCardsSection';
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
      <ContactCardsSection />
      <div
        aria-hidden
        className="h-16 bg-gradient-to-b from-[#060e1a] to-[#F8FAFD] dark:to-[#0D1B2A]"
      />
      <BusinessInfoSection />
      <div
        aria-hidden
        className="h-16 bg-gradient-to-b from-[#F8FAFD] to-[#060e1a] dark:from-[#0D1B2A]"
      />
      <MapSection />
      <ContactCTA />
    </main>
  );
}
