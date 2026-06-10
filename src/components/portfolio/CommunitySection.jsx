'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const FEATURED = [
  {
    name: 'Excel Community Thailand',
    iconUrl:
      'https://res.cloudinary.com/ddva7xvdt/image/upload/v1768899073/programs/icons/zghtwgptohmxlpwah0fv.png',
    description:
      'ชุมชนหลักสำหรับคนทำงานที่ต้องการต่อยอดทักษะ Excel ตั้งแต่สูตรพื้นฐาน เทคนิคการทำงาน ไปจนถึง Data Analysis และ Automation',
    tags: ['Excel Tips', 'Formula', 'Data Analysis', 'Automation'],
    memberDisplay: '77,840',
    url: 'https://www.facebook.com/groups/excelthailand',
    background:
      'radial-gradient(circle at 76% 18%, rgba(72,176,255,0.56), transparent 32%), radial-gradient(circle at 18% 84%, rgba(216,255,47,0.16), transparent 32%), linear-gradient(135deg, #005cff 0%, #082b5f 54%, #06172f 100%)',
  },
  {
    name: 'AI / Copilot Community',
    iconUrl:
      'https://res.cloudinary.com/ddva7xvdt/image/upload/v1781066417/AI_lkvzpl.png',
    description:
      'AI Assistant, Microsoft Copilot และการประยุกต์ใช้ AI ในงานจริง เรียนรู้ไปด้วยกันในยุค AI',
    tags: ['AI Assistant', 'Microsoft Copilot', 'Automation'],
    memberDisplay: '49,000+',
    url: 'https://www.facebook.com/groups/717525487760777',
    background:
      'radial-gradient(circle at 80% 12%, rgba(255,208,80,0.30), transparent 34%), radial-gradient(circle at 12% 80%, rgba(72,176,255,0.26), transparent 34%), linear-gradient(135deg, #071b33 0%, #0b3a78 54%, #005cff 125%)',
  },
];

const SECONDARY = [
  { name: 'Turn Data into Insight with Power BI', description: 'ชุมชน Power BI ที่ใหญ่ที่สุดในประเทศไทย — Dashboard & Data Storytelling', members: '21,414', url: 'https://www.facebook.com/groups/powerbithailand', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1781064418/programs/icons/oxcnmhaxmc6vmc282t9e.png' },
  { name: 'SQL Server Community Thailand', description: 'Database, Query, BI และ Data Platform สำหรับคนทำงานข้อมูล', members: '15,642', url: 'https://www.facebook.com/groups/sqlserverthailand', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1768899401/programs/icons/yevrhherdlwixlotszk0.png' },
  { name: 'Dynamics 365 & Power Platform', description: 'Low-Code, Power Apps, Automate และ Dynamics 365', members: '13,349', url: 'https://www.facebook.com/groups/D365PowerPlatCommunityTH', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1781066417/course-icon-powerplatform-course_1_qgmz7e.png' },
  { name: 'Microsoft Teams Community', description: 'Collaboration, Meeting และ Productivity สำหรับองค์กร', members: '9,614', url: 'https://www.facebook.com/groups/msteamsth', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1781065508/ms_team_zxdssf.png' },
  { name: 'PowerPoint Community Thailand', description: 'Presentation Design และการสื่อสารด้วยสไลด์', members: '8,528', url: 'https://www.facebook.com/groups/powerpointthailand', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1768899087/programs/icons/ukyqi0s2mk6ac6cowkuu.png' },
  { name: 'RPA Thailand', description: 'Automation เพื่อเพิ่มประสิทธิภาพการทำงาน', members: '6,516', url: 'https://www.facebook.com/groups/rpathailand/', iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1781066418/rpa_ncmlj5.png' },
];

const GRID_OVERLAY = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
  backgroundSize: '34px 34px',
  maskImage: 'linear-gradient(to bottom, black, transparent 92%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 92%)',
};

export default function CommunitySection() {
  const prefersReduced = useReducedMotion();
  const dur = (s) => (prefersReduced ? 0 : s);

  return (
    <section className="bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]">
      {/* Header */}
      <div className="mx-auto mb-10 max-w-[1080px] px-4 text-center">
        <p className="font-en text-xs font-black uppercase tracking-[2px] text-9e-brand">
          TECHNOLOGY COMMUNITY
        </p>
        <h2 className="mt-3 font-heading text-4xl font-bold text-[var(--text-primary)]">
          ชุมชนเทคโนโลยีที่เราก่อตั้ง
        </h2>
        <p className="mt-3 font-thai text-sm text-[var(--text-secondary)]">
          เชื่อมต่อ แลกเปลี่ยน เรียนรู้ไปด้วยกัน ผ่านชุมชนด้าน Data, AI และ Microsoft Technology
        </p>
        <p className="mt-4 font-thai text-sm font-semibold text-[var(--text-secondary)]">
          รวมสมาชิกทั้งหมด{' '}
          <span className="font-en font-black text-9e-brand">201.9K+ Members</span>
        </p>
      </div>

      {/* Featured communities */}
      <div className="mx-auto mb-[18px] grid max-w-[1080px] grid-cols-1 gap-[18px] px-4 md:grid-cols-2">
        {FEATURED.map((card, i) => (
          <motion.a
            key={card.name}
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: dur(0.5), delay: dur(i * 0.12) }}
            className="group relative isolate flex min-h-[360px] flex-col overflow-hidden rounded-[34px] p-[30px] text-white transition-all duration-[340ms] hover:-translate-y-2.5 hover:shadow-[0_0_60px_rgba(0,92,255,0.34)]"
            style={{ background: card.background }}
          >
            {/* Grid overlay */}
            <div
              aria-hidden
              className="absolute inset-0 -z-[1] opacity-[0.62]"
              style={GRID_OVERLAY}
            />
            {/* Decorative circle */}
            {/* <div
              aria-hidden
              className="absolute -bottom-[110px] -right-[90px] -z-[1] h-[300px] w-[300px] rounded-full border border-white/18 shadow-[inset_0_0_70px_rgba(72,176,255,0.20)] transition-transform duration-[340ms] group-hover:scale-110"
            /> */}

            {/* Top: icon only — no badge label */}
            <div className="mb-[15px] flex justify-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.iconUrl}
                alt={card.name}
                className="h-[60px] w-[60px] flex-shrink-0 rounded-[15px] object-cover"
              />
            </div>

            {/* Title */}
            <h3 className="m-0 max-w-[430px] font-heading text-[clamp(30px,3.3vw,46px)] font-bold leading-[0.98] tracking-[-0.07em] text-white">
              {card.name}
            </h3>
            <p className="mt-4 max-w-[470px] font-thai text-sm leading-[1.75] text-[#d8eaff]">
              {card.description}
            </p>

            {/* Tags */}
            <div className="mt-[22px] flex flex-wrap gap-2">
              {card.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/14 bg-white/11 px-2.5 py-1.5 font-en text-[11px] font-semibold text-[#eaf4ff]"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* Footer — static flow, pushed to bottom with mt-auto */}
            <div className="mt-auto flex items-end justify-between gap-4 pt-6">
              <div>
                <strong className="block font-en text-[30px] font-bold leading-none tracking-[-0.05em] text-9e-lime">
                  {card.memberDisplay}
                </strong>
                <span className="mt-1 block font-en text-xs font-semibold text-[#d8eaff]/60">
                  Members
                </span>
              </div>
              <span
                aria-label={`เข้าร่วม ${card.name}`}
                className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full bg-9e-lime text-lg font-bold text-9e-navy opacity-0 transition-all duration-[240ms] group-hover:translate-x-0 group-hover:opacity-100"
              >
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </motion.a>
        ))}
      </div>

      {/* Secondary communities */}
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-[14px] px-4 sm:grid-cols-2 md:grid-cols-3">
        {SECONDARY.map((item, i) => (
          <motion.a
            key={item.name}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: dur(0.45), delay: dur(i * 0.07) }}
            className="group relative block min-h-[174px] overflow-hidden rounded-[24px] border border-[var(--surface-border)] bg-white p-5 shadow-9e-sm transition-all duration-[340ms] hover:-translate-y-2.5 hover:border-9e-brand/35 hover:shadow-9e-lg dark:bg-9e-card"
          >
            <span
              aria-hidden
              className="absolute -bottom-[54px] -right-[34px] h-[120px] w-[120px] rounded-full bg-9e-brand/8 transition-transform duration-[340ms] group-hover:scale-[1.4]"
            />
            <div className="mb-[14px] h-[42px] w-[42px] overflow-hidden ">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.iconUrl}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            </div>
            <h3 className="m-0 font-heading text-base font-bold leading-[1.25] tracking-[-0.035em] text-[var(--text-primary)]">
              {item.name}
            </h3>
            <p className="mt-2 font-thai text-xs leading-[1.55] text-[var(--text-secondary)]">
              {item.description}
            </p>
            <p className="mt-3 font-en text-xs font-black text-9e-brand">
              {item.members} Members
            </p>
            <span
              aria-hidden
              className="absolute bottom-[18px] right-[18px] grid h-8 w-8 translate-x-2 place-items-center rounded-full bg-[#eaf4ff] text-sm text-9e-brand opacity-0 transition-all duration-[240ms] group-hover:translate-x-0 group-hover:opacity-100 dark:bg-9e-border"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
