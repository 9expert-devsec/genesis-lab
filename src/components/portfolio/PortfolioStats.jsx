'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { GraduationCap, Users, Building2, BookOpen } from 'lucide-react';

const STATS = [
  { target: 20,    suffix: '+', label: 'ปีประสบการณ์สอน',    sub: 'ตั้งแต่ปี 1999',              Icon: GraduationCap, accent: 'border-9e-brand' },
  { target: 90000, suffix: '+', label: 'ผู้เรียนทั่วประเทศ', sub: 'องค์กรชั้นนำและภาครัฐ',        Icon: Users,         accent: 'border-9e-air'   },
  { target: 5000,  suffix: '+', label: 'องค์กรที่ไว้วางใจ',  sub: 'ครอบคลุมทุกอุตสาหกรรม',       Icon: Building2,     accent: 'border-9e-lime'  },
  { target: 68,    suffix: '+', label: 'หลักสูตรที่เปิดสอน', sub: 'Public & Corporate Training', Icon: BookOpen,      accent: 'border-9e-brand' },
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

function fmt(n) {
  if (n >= 1000) return n.toLocaleString('en-US');
  return String(n);
}

function StatCard({ target, suffix, label, sub, Icon, accent, active }) {
  const count = useCountUp(target, 1600, active);
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
      }}
      className={`rounded-9e-lg border border-t-2 border-[var(--surface-border)] ${accent} bg-white p-6 text-center shadow-9e-sm dark:bg-9e-card`}
    >
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-9e-md bg-9e-signature-950 dark:bg-9e-border">
        <Icon className="h-5 w-5 text-9e-brand" strokeWidth={1.5} />
      </div>
      <p className="bg-9e-gradient-hero bg-clip-text font-en text-4xl font-bold text-transparent">
        {fmt(count)}
        {suffix}
      </p>
      <p className="mt-1 font-thai text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </p>
      <p className="mt-1 font-en text-xs text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
        {sub}
      </p>
    </motion.div>
  );
}

export default function PortfolioStats() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="bg-white py-16 dark:bg-[var(--page-bg)]">
      <motion.div
        ref={ref}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
        className="mx-auto grid max-w-[1200px] grid-cols-2 gap-4 px-4 md:grid-cols-4 md:gap-6"
      >
        {STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} active={inView} />
        ))}
      </motion.div>
    </section>
  );
}
