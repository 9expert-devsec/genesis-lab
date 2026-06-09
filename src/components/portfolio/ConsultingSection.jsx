'use client';

import { motion } from 'framer-motion';

const CONSULTING_ITEMS = [
  {
    num: '001',
    year: '2024 – ปัจจุบัน',
    title: 'Airports of Thailand (AOT)',
    description:
      'ออกแบบและพัฒนา Passenger Traffic Dashboard สำหรับ 7 สนามบินทั่วประเทศ พร้อม AI Integration',
    image: '/port/public_0.jpg',
  },
  {
    num: '002',
    year: '2026',
    title: 'MOU 9Expert × สจล. (KMITL)',
    description:
      "ลงนาม MOU ร่วมกับ King Mongkut's Institute of Technology Ladkrabang พัฒนาหลักสูตร AI Assistant และ Digital Skill ให้กับนักศึกษาและอาจารย์",
    image: '/port/inhouse_0.jpg',
  },
  {
    num: '003',
    year: '2026',
    title: 'The Next Humans Skills × Bitkub Academy',
    description:
      'ลงนาม MOU ร่วมกับ Bitkub Academy และ Key Solutions เพื่อพัฒนาทักษะแห่งอนาคตด้าน AI, Data และ Automation',
    image: '/port/online_0.png',
  },
  {
    num: '004',
    year: 'Enterprise',
    title: 'SCB, BTS, Ministry of Justice และอื่น ๆ',
    description:
      'ให้คำปรึกษาและพัฒนาระบบ Dashboard และ Data Analytics สำหรับองค์กรภาครัฐและภาคเอกชนขนาดใหญ่',
    image: '/port/article_0.jpg',
  },
];

function LabelPill({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-9e-brand/25 bg-9e-signature-950 px-3 py-1 font-en text-xs font-semibold uppercase tracking-[1px] text-9e-brand dark:bg-9e-border dark:text-9e-air">
      {children}
    </span>
  );
}

export default function ConsultingSection() {
  return (
    <section className="bg-white py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px] px-4">
        {/* Header */}
        <div className="mb-16">
          
          <h2 className="mt-4 font-heading text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
            ผลงานด้านที่ปรึกษา{' '}
            <span className="bg-9e-gradient-hero bg-clip-text text-transparent">
              และ Consulting
            </span>
          </h2>
        </div>

        {/* Body */}
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:gap-16">
          {/* Left sticky */}
          <div className="lg:sticky lg:top-28">
            <p className="font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
              ประสบการณ์การให้คำปรึกษาด้าน Data Analytics, AI และ Digital
              Transformation ให้กับองค์กรภาครัฐและเอกชนชั้นนำของไทย
            </p>
            <div className="mt-6 rounded-9e-md border border-[var(--surface-border)] bg-[var(--page-bg-muted)] px-4 py-3 dark:bg-9e-card">
              <span className="font-thai text-sm font-semibold text-[var(--text-primary)]">
                4 โครงการสำคัญ
              </span>
            </div>
          </div>

          {/* Right list */}
          <div className="mt-10 lg:mt-0">
            {CONSULTING_ITEMS.map((item, index) => (
              <motion.div
                key={item.num}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: index * 0.09 }}
                className="group relative -mx-4 flex items-start gap-6 rounded-9e-lg border-b border-[var(--surface-border)] px-4 py-7 transition-colors duration-200 last:border-b-0 hover:bg-[var(--page-bg-muted)] dark:hover:bg-9e-card"
              >
                <span className="min-w-[72px] select-none font-en text-[52px] font-bold leading-none text-[var(--surface-border)] transition-colors duration-300 group-hover:text-9e-brand/30 dark:text-9e-border">
                  {item.num}
                </span>

                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded-full bg-9e-signature-950 px-3 py-0.5 font-en text-xs font-semibold text-9e-brand dark:bg-9e-border dark:text-9e-air">
                    {item.year}
                  </span>
                  <h3 className="mt-2 font-heading text-lg font-bold text-[var(--text-primary)] transition-colors duration-200 group-hover:text-9e-brand">
                    {item.title}
                  </h3>
                  <p className="mt-1 font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                </div>

                <div className="absolute right-0 top-1/2 hidden h-20 w-28 -translate-y-1/2 translate-x-6 overflow-hidden rounded-9e-md opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 lg:block">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
