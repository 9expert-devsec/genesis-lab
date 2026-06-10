'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const CONSULTING_ITEMS = [
  {
    num: '001',
    title: 'Airport of Thailand (AOT)',
    meta: '2024 • Dashboard & Data Analytics',
    description:
      'พัฒนาระบบ Passenger Traffic Dashboard สำหรับผู้บริหาร เพื่อวิเคราะห์และติดตามปริมาณผู้โดยสารแบบเรียลไทม์ พร้อมเชื่อมต่อข้อมูลหลายแหล่ง',
    tags: ['Dashboard', 'Data Analytics', 'AI Integration'],
  },
  {
    num: '002',
    title: 'MOU 9Expert x สจล. (KMITL)',
    meta: '2024 • MOU & Knowledge Platform',
    description:
      'ร่วมพัฒนาองค์ความรู้ด้าน AI Assistant และ Digital Skill เพื่อสนับสนุนการเรียนรู้และการทำงานยุคใหม่',
    tags: ['AI Skill', 'Knowledge Platform'],
  },
  {
    num: '003',
    title: 'The Next Human Skills x Bitkub Academy',
    meta: '2024 • Data Use & Automation',
    description:
      'พัฒนาหลักสูตรทักษะอนาคตด้าน Data, AI และ Automation สำหรับบุคลากรที่ต้องการต่อยอดสู่การทำงานจริง',
    tags: ['Future Skills', 'Automation'],
  },
  {
    num: '004',
    title: 'SCB, BTS, Ministry of Justice และอื่น ๆ',
    meta: 'Enterprise • Dashboard & Data Analytics',
    description:
      'ให้คำปรึกษาและพัฒนา Dashboard / Data Analytics สำหรับองค์กรขนาดใหญ่ เพื่อช่วยตัดสินใจด้วยข้อมูล',
    tags: ['Enterprise', 'Power BI', 'Consulting'],
  },
];

export default function ConsultingSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const prefersReduced = useReducedMotion();

  return (
    <section className="bg-white py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-12">
          {/* Left — sticky aside (static, no dynamic description / hint box) */}
          <aside className="flex-shrink-0 lg:sticky lg:top-28 lg:w-[300px]">
            <p className="font-en text-xs font-black uppercase tracking-[2px] text-9e-brand">
              CONSULTING PROJECTS
            </p>
            <h2 className="mt-3 font-heading text-4xl font-black leading-tight text-[var(--text-primary)]">
              ผลงานด้านที่ปรึกษา
              <br />
              <span className="text-9e-brand">และ</span>
              <br />
              <span className="bg-9e-gradient-hero bg-clip-text text-transparent">
                Consulting
              </span>
            </h2>
            <p className="mt-4 font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
              ประสบการณ์การให้คำปรึกษาด้าน Data Analytics, AI และ Digital
              Transformation ให้กับองค์กรภาครัฐและเอกชนชั้นนำของไทย
            </p>
          </aside>

          {/* Right — accordion list */}
          <div className="mt-10 flex flex-1 flex-col gap-0 lg:mt-0">
            {CONSULTING_ITEMS.map((item, i) => {
              const isActive = i === activeIdx;
              return (
                <motion.article
                  key={item.num}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{
                    duration: prefersReduced ? 0 : 0.5,
                    delay: prefersReduced ? 0 : i * 0.09,
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`mb-2 overflow-hidden rounded-9e-lg border transition-all duration-300 ${
                    isActive
                      ? 'border-9e-brand/30 bg-white shadow-9e-lg dark:bg-9e-card'
                      : 'border-[var(--surface-border)] bg-transparent hover:bg-[var(--page-bg-muted)] dark:hover:bg-9e-card/50'
                  }`}
                >
                  {/* Trigger row (no +/- button) */}
                  <div
                    className="flex cursor-pointer items-center gap-4 p-5"
                    onClick={() => setActiveIdx(i)}
                  >
                    <span
                      className={`min-w-[64px] font-en text-3xl font-black leading-none transition-colors duration-300 ${
                        isActive
                          ? 'text-9e-brand'
                          : 'text-[var(--surface-border)] dark:text-9e-border'
                      }`}
                    >
                      {item.num}
                    </span>
                    <div className="flex-1">
                      <span
                        className={`font-heading text-base font-bold transition-colors duration-200 ${
                          isActive ? 'text-9e-brand' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="ml-2 font-en text-xs text-[var(--text-secondary)]">
                        {item.meta}
                      </span>
                    </div>
                  </div>

                  {/* Expanded body */}
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: prefersReduced ? 0 : 0.35,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-6 px-5 pb-5">
                          <div className="flex-1">
                            <p className="font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
                              {item.description}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-9e-brand/25 bg-9e-signature-950 px-3 py-1 font-en text-xs font-semibold text-9e-brand dark:bg-9e-border dark:text-9e-air"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* Image placeholder — path to be added in future */}
                          <div className="hidden w-[220px] flex-shrink-0 md:block">
                            <div className="h-[120px] w-full rounded-9e-md bg-[var(--page-bg-muted)] dark:bg-9e-border" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
