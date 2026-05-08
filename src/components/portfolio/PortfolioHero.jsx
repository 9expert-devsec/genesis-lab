'use client';

import { motion } from 'framer-motion';
import FloatingDots from '@/components/about/FloatingDots';

export default function PortfolioHero() {
  return (
    <section className="relative overflow-hidden bg-9e-navy text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-9e-gradient-signature opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[30%] top-[60%] h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-9e-action/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(rgba(72,176,255,0.12) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <FloatingDots />

      <div className="relative mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center gap-8 px-4 py-24 text-center lg:px-6 lg:py-28">
        {/* <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-9e-lime/30 bg-9e-lime/20 px-4 py-1.5 backdrop-blur-sm"
        >
          <span className="text-xs font-medium uppercase tracking-[1.2px] text-9e-lime">
            ผลงานและประสบการณ์
          </span>
        </motion.div> */}

        <h1 className="font-heading text-4xl font-bold leading-normal text-white md:text-5xl lg:text-4xl">
          <motion.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="block"
          >
            ผลงานด้านการฝึกอบรม
          </motion.span>
          {/* <motion.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="block bg-9e-gradient-hero bg-clip-text text-transparent"
          >
            9Expert Training
          </motion.span> */}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-2xl text-base leading-relaxed text-9e-slate-dp-600 md:text-base"
        >
          สถาบันฝึกอบรมเทคโนโลยีชั้นนำ ที่ให้บริการองค์กรชั้นนำทั่วประเทศไทย
        </motion.p>

        <motion.div
          aria-hidden
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="h-1 w-full max-w-md bg-gradient-to-r from-transparent via-9e-action to-transparent"
        />
      </div>

      {/* <svg
        aria-hidden
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-[80px] w-full md:h-[120px]"
      >
        <path
          d="M0,64 C240,112 480,16 720,48 C960,80 1200,32 1440,72 L1440,120 L0,120 Z"
          className="fill-white dark:fill-[#060e1a]"
        />
      </svg> */}
    </section>
  );
}
