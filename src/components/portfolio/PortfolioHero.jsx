'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Building2, Users, BookOpen } from 'lucide-react';

const FLOATING_STATS = [
  { number: '5,000+', label: 'องค์กรที่ไว้วางใจ', Icon: Building2 },
  { number: '90,000+', label: 'ผู้เรียนทั่วประเทศ', Icon: Users },
  { number: '68+', label: 'หลักสูตร', Icon: BookOpen },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function PortfolioHero() {
  const prefersReduced = useReducedMotion();
  const dur = (s) => (prefersReduced ? 0 : s);
  const delay = (s) => (prefersReduced ? 0 : s);

  return (
    <section className="relative overflow-hidden bg-9e-navy text-white">
      {/* Background layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-9e-gradient-signature opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[15%] top-[40%] h-[480px] w-[480px] rounded-full bg-9e-action/20 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[10%] right-[10%] h-[280px] w-[280px] rounded-full bg-9e-lime/10 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(72,176,255,0.10) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[460px] max-w-4xl flex-col items-center gap-7 px-4 py-24 text-center">
        {/* A. Label badge */}
        {/* <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur(0.45) }}
          className="inline-flex items-center gap-2 rounded-full border border-9e-lime/30 bg-9e-lime/10 px-4 py-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-9e-lime" />
          <span className="font-en text-xs font-medium uppercase tracking-[1.2px] text-9e-lime">
            9Expert Training · Portfolio
          </span>
        </motion.div> */}

        {/* B. Headline */}
        <h1 className="font-heading text-5xl font-bold">
          <motion.span
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur(0.55), delay: delay(0.1) }}
            className="block text-white pb-5"
          >
            ผลงานและความสำเร็จ
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur(0.55), delay: delay(0.22) }}
            className="block bg-9e-gradient-hero bg-clip-text text-transparent"
          >
            9Expert Training
          </motion.span>
        </h1>

        {/* C. Subtext */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur(0.6), delay: delay(0.4) }}
          className="max-w-xl font-thai text-base leading-relaxed text-9e-slate-dp-600"
        >
          สถาบันฝึกอบรมเทคโนโลยีชั้นนำ ให้บริการองค์กรและบุคคลทั่วประเทศไทยมากกว่า 20 ปี
        </motion.p>

        {/* D. Divider */}
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: dur(0.7), delay: delay(0.5), ease: [0.4, 0, 0.2, 1] }}
          className="h-px w-56 bg-gradient-to-r from-transparent via-9e-action to-transparent"
        />

        {/* E. Floating stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur(0.6), delay: delay(0.65) }}
          className="mt-2"
        >
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-wrap justify-center gap-3"
          >
            {FLOATING_STATS.map((stat) => (
              <motion.div
                key={stat.label}
                variants={itemVariants}
                className="rounded-9e-lg border border-9e-border bg-9e-card px-5 py-3 text-center"
              >
                <stat.Icon
                  className="mx-auto mb-1.5 h-4 w-4 text-9e-air"
                  strokeWidth={1.5}
                />
                <div className="font-en text-2xl font-bold text-9e-lime">
                  {stat.number}
                </div>
                <div className="mt-0.5 font-thai text-xs text-white/55">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
