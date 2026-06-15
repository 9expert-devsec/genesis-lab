'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { MonitorPlay, Video, Building2, BookOpen, ArrowRight } from 'lucide-react';

const TRAINING_ITEMS = [
  {
    num: '01',
    Icon: MonitorPlay,
    title: 'Classroom Training',
    description:
      'เรียนสดกับวิทยากรผู้เชี่ยวชาญ ณ 9Expert Training พร้อม Workshop และ Case Study ที่นำไปใช้ได้จริง',
    tag: 'Public Training',
    tagBg: 'bg-9e-brand text-white',
    accentHex: '#2486FF',
    image:
      'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778228610/9exp-genesis/atmosphere-photos/e4bvkvg6jxgvv33rxb6z.jpg',
    href: '/training-course',
  },
  {
    num: '02',
    Icon: Video,
    title: 'Live Online Training',
    description:
      'เรียนสดผ่าน Microsoft Teams ตามรอบอบรมของ Classroom Training พร้อมวิทยากรและตัวอย่างการใช้งานจริง',
    tag: 'Online',
    tagBg: 'bg-9e-air text-9e-navy',
    accentHex: '#48B0FF',
    image: '/port/online_3.png',
    href: '/training-course',
  },
  {
    num: '03',
    Icon: Building2,
    title: 'In-house Training',
    description:
      'จัดอบรมเฉพาะองค์กร ณ สถานที่ของท่าน หรือในรูปแบบที่เหมาะกับเป้าหมายการพัฒนาบุคลากร',
    tag: 'Corporate',
    tagBg: 'bg-9e-lime text-9e-navy',
    accentHex: '#D4F73F',
    image: '/port/inhouse_2.jpg',
    href: '/registration/in-house',
  },
  {
    num: '04',
    Icon: BookOpen,
    title: 'บทความและคลังความรู้',
    description:
      'อัปเดตความรู้ด้าน AI, Data, Automation และ Digital Transformation จากผู้เชี่ยวชาญ 9Expert Training',
    tag: 'Knowledge',
    tagBg: 'bg-9e-lime text-9e-navy',
    accentHex: '#D4F73F',
    image: '/port/article_1.png',
    href: '/articles',
  },
];

function LabelPill({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-9e-brand/25 bg-9e-signature-950 px-3 py-1 font-en text-xs font-semibold uppercase tracking-[1px] text-9e-action dark:bg-9e-border dark:text-9e-air">
      {children}
    </span>
  );
}

function ActiveContent({ item }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 p-6">
      <item.Icon className="mb-3 h-9 w-9 text-white" strokeWidth={1.5} />
      <span
        className={`mb-2 inline-block rounded-full px-3 py-1 font-en text-xs font-bold ${item.tagBg}`}
      >
        {item.tag}
      </span>
      <h3 className="font-heading text-3xl font-bold leading-tight text-white">
        {item.title}
      </h3>
      <p className="mt-2 line-clamp-3 font-thai text-sm leading-relaxed text-white/70">
        {item.description}
      </p>
      <a
        href={item.href}
        className="mt-3 inline-flex items-center gap-1 font-en text-xs font-medium text-9e-lime transition-all hover:gap-2"
      >
        เรียนรู้เพิ่มเติม <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export default function TrainingSection() {
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="overflow-hidden bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]">
      {/* Header */}
      <div className="mx-auto mb-10 max-w-[1200px] px-4 text-center">
        
        <h2 className="mt-4 font-heading text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
          รูปแบบการเรียนรู้จาก 9Expert
        </h2>
        <p className="mt-3 font-thai text-sm text-[var(--text-secondary)]">
          เลือกรูปแบบการเรียนที่เหมาะกับคุณและองค์กร
        </p>
      </div>

      {/* Desktop accordion */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 32 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="mx-auto hidden h-[480px] max-w-[1200px] px-4 md:flex"
      >
        {TRAINING_ITEMS.map((item, i) => {
          const isActive = i === active;
          return (
            <div
              key={item.title}
              onClick={() => setActive(i)}
              style={{ borderTopColor: item.accentHex }}
              className={`group relative cursor-pointer overflow-hidden border-t-2 bg-9e-navy hover:bg-9e-action transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                isActive ? 'flex-[5]' : 'flex-1'
              }`}
            >
              <img
                src={item.image}
                alt={item.title}
                className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                  isActive ? 'opacity-100' : 'opacity-25'
                }`}
              />

              {isActive ? (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-9e-action via-9e-navy/20 to-transparent" />
                  <ActiveContent item={item} />
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-9e-navy/95 to-9e-navy/50" />
                  <span className="absolute left-4 top-4 font-en text-sm text-white/80">
                    {item.num}
                  </span>
                  <div className="absolute bottom-6 left-6 right-0 flex">
                    <span
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      className="font-heading text-2xl font-semibold tracking-wide text-white/70"
                    >
                      {item.title}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Mobile stack */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 md:hidden">
        {TRAINING_ITEMS.map((item) => (
          <div
            key={item.title}
            style={{ borderTopColor: item.accentHex }}
            className="relative h-72 overflow-hidden rounded-9e-lg border-t-2 bg-9e-navy"
          >
            <img
              src={item.image}
              alt={item.title}
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-9e-navy via-9e-navy/80 to-transparent" />
            <ActiveContent item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
