'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  BarChart2,
  TrendingUp,
  Database,
  Zap,
  MessageSquare,
  Presentation,
  Bot,
  Users,
  Facebook,
  ArrowRight,
} from 'lucide-react';

const COMMUNITIES = [
  { Icon: BarChart2,     name: 'Excel Community Thailand',                           description: 'ชุมชนคนรัก Excel — สูตร เทคนิค และการวิเคราะห์ข้อมูล',         members: 77000, url: 'https://www.facebook.com/groups/excelthailand' },
  { Icon: TrendingUp,    name: 'Turn Data into Insight with Power BI',               description: 'ชุมชน Power BI ที่ใหญ่ที่สุดในประเทศไทย — Data Analytics',     members: 28000, url: 'https://www.facebook.com/groups/powerbithailand' },
  { Icon: Database,      name: 'SQL Server Community Thailand',                      description: 'ชุมชนสำหรับผู้ใช้งานและพัฒนาระบบ SQL Server',                  members: 15000, url: 'https://www.facebook.com/groups/sqlserverthailand' },
  { Icon: Zap,           name: 'Dynamics 365 and Power Platform Community Thailand', description: 'ชุมชน Power Platform และ Dynamics 365 ของประเทศไทย',           members: 13000, url: 'https://www.facebook.com/groups/D365PowerPlatCommunityTH' },
  { Icon: MessageSquare, name: 'Microsoft Teams Community Thailand',                 description: 'ชุมชนผู้ใช้งาน Microsoft Teams ในประเทศไทย',                   members: 8000,  url: 'https://www.facebook.com/groups/msteamsth' },
  { Icon: Presentation,  name: 'PowerPoint Community Thailand',                      description: 'ชุมชนคนรัก PowerPoint — เทคนิคและการนำเสนอ',                   members: 5500,  url: 'https://www.facebook.com/groups/powerpointthailand' },
  { Icon: Bot,           name: 'RPA Thailand',                                       description: 'ชุมชนสำหรับผู้สนใจ Robotic Process Automation',                members: 4500,  url: 'https://www.facebook.com/groups/rpathailand/' },
];

function useCountUp(target, duration = 1600, active = false) {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(eased * target));
      if (p < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return count;
}

function formatMembers(n) {
  if (n >= 10000) {
    const v = n / 10000;
    return `${v % 1 === 0 ? v : v.toFixed(1)} หมื่น`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v % 1 === 0 ? v : v.toFixed(1)} พัน`;
  }
  return n.toLocaleString('th-TH');
}

export default function CommunitySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const total = useCountUp(151000, 1800, inView);

  return (
    <section className="bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]">
      <div ref={ref} className="mx-auto max-w-[1200px] px-4">
        {/* Header */}
        <div className="mb-12 text-center">

          <h2 className="mt-4 font-heading text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
            ชุมชนเทคโนโลยีที่เราก่อตั้ง
          </h2>
          <p className="mt-3 font-thai text-sm text-[var(--text-secondary)]">
            ก่อตั้งและดูแลชุมชน Facebook สำหรับนักเทคโนโลยีไทย
          </p>
          <p className="mt-4 font-thai text-sm text-[var(--text-secondary)]">
            <TrendingUp className="mr-1 inline h-4 w-4 text-9e-brand" strokeWidth={2} />
            รวมสมาชิกทั้งหมด{' '}
            <span className="font-en font-bold text-9e-brand">
              {formatMembers(total)}+ คน
            </span>
          </p>
        </div>

        {/* Grid */}
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {COMMUNITIES.map((item) => (
            <motion.a
              key={item.name}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              variants={{
                hidden: { opacity: 0, scale: 0.96 },
                show: { opacity: 1, scale: 1, transition: { duration: 0.45 } },
              }}
              className="group relative block overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-9e-brand/50 hover:shadow-9e-lg dark:bg-9e-card"
            >
              {/* Animated top accent */}
              <motion.div
                className="absolute left-0 right-0 top-0 h-0.5 origin-left bg-9e-gradient-hero"
                initial={{ scaleX: 0 }}
                whileHover={{ scaleX: 1 }}
                transition={{ duration: 0.3 }}
              />

              <item.Icon className="mb-4 h-8 w-8 text-9e-brand" strokeWidth={1.5} />

              <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-[var(--page-bg-muted)] px-2.5 py-0.5 font-en text-[10px] font-medium text-[var(--text-secondary)] dark:bg-9e-border">
                <Facebook className="h-2.5 w-2.5" /> Facebook Group
              </span>

              <h3 className="font-heading text-base font-bold leading-tight text-[var(--text-primary)]">
                {item.name}
              </h3>
              <p className="mt-2 font-thai text-xs leading-relaxed text-[var(--text-secondary)]">
                {item.description}
              </p>

              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-9e-signature-950 px-3 py-1 dark:bg-9e-border">
                <Users className="h-3 w-3 text-9e-brand" strokeWidth={2} />
                <span className="font-en text-xs font-bold text-9e-brand dark:text-9e-air">
                  {formatMembers(item.members)} คน
                </span>
              </div>

              <p className="mt-3 flex items-center gap-1 font-en text-xs font-medium text-9e-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                เข้าร่วมกลุ่ม <ArrowRight className="h-3 w-3" />
              </p>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
