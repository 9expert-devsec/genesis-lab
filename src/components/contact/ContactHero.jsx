'use client';

import { motion } from 'framer-motion';
import { Phone } from 'lucide-react';
import FloatingDots from '@/components/about/FloatingDots';

export default function ContactHero() {
  return (
    <section className="relative overflow-hidden bg-[#060e1a] text-white">
      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[30%] top-[60%] h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(0,92,255,0.2)] blur-[120px]"
      />

      {/* Dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(rgba(72,176,255,0.12) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Corner brackets */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-6 top-24 h-32 w-32 border-l-2 border-t-2 border-[rgba(0,92,255,0.3)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-6 h-32 w-32 border-b-2 border-r-2 border-[rgba(0,92,255,0.3)]"
      />

      <FloatingDots />

      <div className="relative mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-8 px-4 py-24 text-center lg:px-6 lg:py-28">
        {/* Eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,92,255,0.4)] bg-[rgba(0,92,255,0.1)] px-4 py-2 shadow-[0_10px_15px_rgba(0,92,255,0.2)] backdrop-blur-sm"
        >
          <Phone className="h-4 w-4 text-[#48B0FF]" />
          <span className="text-sm font-medium uppercase tracking-[0.7px] text-[#48B0FF]">
            ติดต่อเรา
          </span>
        </motion.div>

        {/* H1 — two lines */}
        <h1 className="text-4xl font-bold leading-normal md:text-5xl lg:text-6xl">
          <motion.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="block text-white"
          >
            พร้อมช่วยเหลือคุณ
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="block bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent"
          >
            ทุกวันทำการ
          </motion.span>
        </h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-2xl text-base leading-relaxed text-[#99a1af] md:text-lg"
        >
          ทีมงาน 9Expert Training พร้อมตอบทุกคำถาม จันทร์–ศุกร์ 08:00–17:00 น.
        </motion.p>

        {/* Gradient underline */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="h-1 w-full max-w-md bg-gradient-to-r from-transparent via-[#005CFF] to-transparent"
        />

      </div>

      {/* Wave divider — bridges dark hero into the white body section.
          Stretches edge-to-edge via preserveAspectRatio="none". On dark
          mode the fill matches the body bg, making the wave invisible
          (intentional — no dark/dark seam). */}
      <svg
        aria-hidden
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-[80px] w-full md:h-[120px]"
      >
        <path
          d="M0,64 C240,112 480,16 720,48 C960,80 1200,32 1440,72 L1440,120 L0,120 Z"
          className="fill-white dark:fill-[#060e1a]"
        />
      </svg>
    </section>
  );
}
