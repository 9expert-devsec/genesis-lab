import Image from 'next/image';
import { StatsStrip } from '@/components/stats/StatsStrip';
import ClientLogoWall from '@/components/about/ClientLogoWall';
import { Reveal } from '@/components/motion/Reveal';
import { trustedOrganizationsHeading } from '@/lib/about/aboutProof';

/**
 * /about-us Proof — the stats card, the static client-logo wall and the STEMPLUS
 * accreditation, on the mist background the hero's fog fades into.
 *
 * Everything is server data passed down: `items` from
 * buildStatItems(getSiteStats(), ABOUT_STAT_KEYS), `organizations` from the
 * same getSiteStats() call, `logos` from getActiveClientLogos().
 */
export default function ProofSection({ items = [], organizations, logos = [] }) {
  // บริษัทจดทะเบียน is the one number in brand blue.
  const panelItems = items.map((item) =>
    item.key === 'setListed' ? { ...item, accent: true } : item
  );

  return (
    <section className="bg-[var(--page-bg-muted)] px-4 pb-20 pt-6 lg:px-6 lg:pb-24 lg:pt-8">
      <div className="mx-auto max-w-[1200px]">
        {/* Visible in the server HTML; slides up once on first view, client
            only, skipped under reduced motion (see Reveal). */}
        <Reveal y={16}>
          <StatsStrip items={panelItems} variant="panel" />
        </Reveal>
      </div>

      <div className="mx-auto mt-16 max-w-[1200px] lg:mt-20">
        <ClientLogoWall logos={logos} heading={trustedOrganizationsHeading(organizations)} />
      </div>

      <div className="mx-auto mt-16 max-w-[1200px] lg:mt-20">
        <div className="about-stemplus flex flex-col gap-6 rounded-[20px] bg-9e-signature-900 p-6 dark:bg-[var(--surface-raised)] md:flex-row md:items-center md:gap-10 md:p-10">
          <div className="flex shrink-0 items-center gap-4">
            <Image
              className="about-stemplus-logo h-16 w-16 rounded-full md:h-[88px] md:w-[88px]"
              src="/about-img/accreditation/mhesi-seal.webp"
              alt="ตราสัญลักษณ์กระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม (อว.)"
              width={88}
              height={88}
              sizes="(min-width: 768px) 88px, 64px"
            />
            <div className="about-stemplus-logo flex h-16 w-[124px] items-center justify-center rounded-2xl bg-white px-3 md:h-[88px] md:w-[170px] md:px-4">
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
            <h3 className="font-heading text-lg font-bold text-[var(--text-primary)] md:text-xl">
              หลักสูตรได้รับการรับรองจากโครงการ STEMPLUS
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
              โครงการพัฒนาบุคลากรด้านวิทยาศาสตร์ เทคโนโลยี วิศวกรรมศาสตร์ และคณิตศาสตร์
              โดยกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม (อว.) —
              ยืนยันว่าหลักสูตรสอดคล้องกับทักษะที่ตลาดแรงงานต้องการ
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
