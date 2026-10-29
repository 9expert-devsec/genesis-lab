import Image from 'next/image';
import { StatsStrip } from '@/components/stats/StatsStrip';
import ClientLogoWall from '@/components/about/ClientLogoWall';
import { AboutSection } from '@/components/about/AboutSection';
import { trustedOrganizationsHeading } from '@/lib/about/aboutProof';

/**
 * /about-us Proof — the stats as a ruled row of facts, the static client-logo
 * wall and the STEMPLUS accreditation, on the page's one ground.
 *
 * Everything is server data passed down: `items` from
 * buildStatItems(getSiteStats(), ABOUT_STAT_KEYS), `organizations` from the
 * same getSiteStats() call, `logos` from getActiveClientLogos().
 */
export default function ProofSection({ items = [], organizations, logos = [] }) {
  return (
    // No section rule and no top padding: the stats row's own rules anchor
    // the bottom of the hero, directly under it.
    <AboutSection rule={false} innerClassName="pt-0 lg:pt-0">
      <StatsStrip items={items} variant="panel" />

      <div className="mt-16 lg:mt-20">
        <ClientLogoWall logos={logos} heading={trustedOrganizationsHeading(organizations)} />
      </div>

      <div className="mt-16 flex flex-col gap-6 rounded-lg border border-[var(--ab-hairline)] bg-[var(--ab-panel)] p-6 md:flex-row md:items-center md:gap-10 md:p-10 lg:mt-20">
        <div className="flex shrink-0 items-center gap-4">
          <Image
            className="h-16 w-16 rounded-full md:h-[88px] md:w-[88px]"
            src="/about-img/accreditation/mhesi-seal.webp"
            alt="ตราสัญลักษณ์กระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม (อว.)"
            width={88}
            height={88}
            sizes="(min-width: 768px) 88px, 64px"
          />
          <div className="flex h-16 w-[124px] items-center justify-center rounded-md bg-white px-3 md:h-[88px] md:w-[170px] md:px-4">
            <Image
              src="/about-img/accreditation/nxpo-logo.webp"
              alt="โลโก้สำนักงานสภานโยบายการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรมแห่งชาติ (สอวช.)"
              width={138}
              height={51}
              sizes="(min-width: 768px) 138px, 100px"
              className="h-auto w-full"
            />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-bold leading-[1.4] text-[var(--ab-bright)] md:text-xl">
            หลักสูตรได้รับการรับรองจากโครงการ STEMPLUS
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ab-read)] md:text-base">
            โครงการพัฒนาบุคลากรด้านวิทยาศาสตร์ เทคโนโลยี วิศวกรรมศาสตร์ และคณิตศาสตร์
            โดยกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม (อว.) —
            ยืนยันว่าหลักสูตรสอดคล้องกับทักษะที่ตลาดแรงงานต้องการ
          </p>
        </div>
      </div>
    </AboutSection>
  );
}
