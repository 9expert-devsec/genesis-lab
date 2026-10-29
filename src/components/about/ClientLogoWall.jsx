import { ClientLogoImage } from '@/components/portfolio/ClientLogosSection';
import { AboutSectionHeader } from '@/components/about/AboutSection';

/**
 * /about-us client logos as a STATIC wall — deliberately not Home's marquee.
 *
 * Same data as Home (getActiveClientLogos, admin display order), shown three
 * rows deep: the server sends the first 18 (6 columns × 3) and CSS hides the
 * rest below lg (12 at 4 columns, 9 at 3). Logos render through Home's own
 * ClientLogoImage, so they are in real colour at full opacity in light mode
 * and get the same dark-mode knockout (and keepColorOnDark exception) as the
 * marquee. No hover treatment. Images, not links, as on Home.
 */
const MAX_LOGOS = 18;

export default function ClientLogoWall({ logos = [], heading }) {
  const shown = logos.filter((l) => l?.image_url).slice(0, MAX_LOGOS);
  if (!shown.length) return null;

  return (
    <div>
      <AboutSectionHeader
        title={heading}
        intro="ตั้งแต่สถาบันการเงิน พลังงาน ค้าปลีก ไปจนถึงหน่วยงานภาครัฐ เลือกให้ 9Expert พัฒนาทักษะบุคลากร"
      />
      <ul data-reveal="fade" className="about-logo-wall mt-10 lg:mt-12">
        {shown.map((logo) => (
          <li key={logo._id}>
            <div className="about-logo-cell">
              <ClientLogoImage logo={logo} className="about-logo-img" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
