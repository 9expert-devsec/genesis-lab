"use client";

import React, { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { GraduationCap, Building2, BookOpen, Users } from "lucide-react";

/**
 * STATS feed the three secondary bento cards.
 * The featured card (90,000+ ผู้เรียน) is rendered separately by FeaturedCard.
 */
const STATS = [
  {
    target: 20,
    suffix: "+",
    label: "ปีประสบการณ์",
    sub: "ตั้งแต่ปี 2005",
    Icon: GraduationCap,
  },
  {
    target: 5000,
    suffix: "+",
    label: "องค์กรที่ไว้วางใจ",
    sub: "ครอบคลุมทุกอุตสาหกรรม",
    Icon: Building2,
  },
  {
    target: 75,
    suffix: "+",
    label: "หลักสูตรที่เปิดสอน",
    sub: "Public & Corporate Training",
    Icon: BookOpen,
  },
  {
    target: 201.9,
    suffix: "K+",
    label: "สมาชิกในชุมชน",
    sub: "ด้าน Data, AI และ MS Technology",
    Icon: Users,
  },
];

function useCountUp(target, duration = 1800, active = false, reduced = false) {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    if (!active) return undefined;
    if (reduced) {
      setCount(target);
      return undefined;
    }
    let start = null;
    let raf = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
      else setCount(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration, reduced]);
  return count;
}

function fmt(n) {
  return n >= 1000 ? n.toLocaleString("en-US") : String(n);
}

function FeaturedCard({ active, reduced }) {
  const count = useCountUp(90000, 2000, active, reduced);
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={active ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: reduced ? 0 : 0.6, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[28px]
                 border border-9e-brand/15 bg-gradient-to-br from-[#e8f1ff] via-[#f0f6ff] to-[#e0eeff]
                 p-8 shadow-[0_8px_40px_rgba(36,134,255,0.12)]
                 dark:from-9e-card dark:via-9e-card dark:to-9e-border md:h-full"
    >
      {/* Decorative chart bars */}
      <div
        aria-hidden
        className="absolute bottom-0 right-0 flex items-end gap-1 px-4 pb-4 opacity-20"
      >
        {[30, 48, 36, 58, 42, 70, 54, 82, 64, 90].map((h, i) => (
          <div
            key={i}
            className="w-[10px] rounded-t-sm bg-9e-brand"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      {/* Trend line overlay */}
      <svg
        aria-hidden
        viewBox="0 0 180 60"
        fill="none"
        className="absolute bottom-8 right-4 h-[60px] w-[180px] opacity-30"
      >
        <polyline
          points="0,55 20,48 45,42 70,32 95,25 120,16 150,8 180,2"
          stroke="#2486FF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="180" cy="2" r="4" fill="#D4F73F" />
      </svg>

      {/* Decorative blur circle */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full bg-9e-brand/8 blur-2xl"
      />

      {/* Icon */}
      <div className="relative z-10">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-white shadow-sm dark:bg-9e-border">
          <Users className="h-7 w-7 text-9e-brand" strokeWidth={1.5} />
        </div>
      </div>

      {/* Number block */}
      <div className="relative z-10 mt-auto">
        <p className="font-en text-[64px] font-black leading-none tracking-[-0.05em] text-9e-brand">
          {fmt(count)}+
        </p>
        <p className="mt-2 font-heading text-xl font-bold text-[var(--text-primary)]">
          ผู้เรียนทั่วประเทศ
        </p>
        <p className="mt-1 font-thai text-sm text-[var(--text-secondary)]">
          จากองค์กรชั้นนำและภาครัฐ
        </p>
      </div>
    </motion.div>
  );
}

function SecondaryCard({ stat, active, reduced, delay = 0, wide = false }) {
  const count = useCountUp(stat.target, 1600, active, reduced);
  const Icon = stat.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={active ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: reduced ? 0 : 0.5,
        delay: reduced ? 0 : delay,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={`relative flex overflow-hidden rounded-[22px] border border-[var(--surface-border)]
                  bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]
                  dark:bg-9e-card dark:shadow-none
                  ${wide ? "flex-row items-center" : "flex-row items-center justify-between"}`}
    >
      {/* Decorative dot-grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#2486FF 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      {/* Icon */}
      <div
        className={`relative z-10 inline-flex flex-shrink-0 items-center justify-center rounded-[14px]
                    bg-[#eaf4ff] dark:bg-9e-border
                    ${wide ? "h-[52px] w-[52px]" : "mb-4 h-[48px] w-[48px]"}`}
      >
        <Icon className="h-6 w-6 text-9e-brand" strokeWidth={1.5} />
      </div>

      {/* Content */}
      <div
        className={`relative z-10  ${wide ? "text-center mx-auto" : "text-end"}`}
      >
        <p className="font-en text-[40px] font-black leading-none tracking-[-0.04em] text-9e-brand">
          {fmt(count)}
          {stat.suffix}
        </p>
        <p className="mt-1 font-heading text-base font-bold text-[var(--text-primary)]">
          {stat.label}
        </p>
        <p className="mt-0.5 font-en text-xs text-[var(--text-secondary)]">
          {stat.sub}
        </p>
        {/* <div className="mt-4 h-px w-10 bg-9e-brand/35" /> */}
      </div>
    </motion.div>
  );
}

export default function PortfolioStats() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="bg-white py-16 dark:bg-[var(--page-bg)]">
      {/* Section header */}
      <div className="mx-auto mb-10 max-w-[1200px] px-4 text-center">
        <p className="font-en text-xs font-black uppercase tracking-[2px] text-9e-action my-4">
          IMPACT METRICS
        </p>
        {/* <div className="mx-auto my-2 h-px w-10 bg-9e-brand/40" /> */}
        <h2 className="font-heading text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
          ตัวเลขความสำเร็จที่สะท้อนความไว้วางใจ
        </h2>
        <p className="mx-auto mt-3 max-w-2xl font-thai text-sm text-[var(--text-secondary)]">
          กว่า 20 ปีแห่งการพัฒนาองค์ความรู้และศักยภาพบุคลากร
          เพื่อขับเคลื่อนองค์กรไทยสู่ความสำเร็จ
        </p>
      </div>

      {/* Bento grid */}
      <div
        ref={ref}
        className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-4 md:grid-cols-2 md:h-[360px]"
      >
        {/* Featured — left column, full height */}
        <FeaturedCard active={inView} reduced={reduced} />

        {/* Right column — 3 secondary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2  md:grid-rows-2 md:h-full">
          {/* Top: two cards side by side */}
         
            <SecondaryCard
              stat={STATS[0]}
              active={inView}
              reduced={reduced}
              delay={0.1}
            />
            <SecondaryCard
              stat={STATS[1]}
              active={inView}
              reduced={reduced}
              delay={0.2}
            />
            {/* Bottom: wide card */}
          <SecondaryCard
            stat={STATS[2]}
            active={inView}
            reduced={reduced}
            delay={0.3}
          />
          <SecondaryCard
            stat={STATS[3]}
            active={inView}
            reduced={reduced}
            delay={0.4}
          />
          </div>
          
        
      </div>
    </section>
  );
}
