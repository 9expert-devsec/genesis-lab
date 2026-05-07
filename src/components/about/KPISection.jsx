"use client";

import CountUp from "react-countup";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  Building2,
  Star,
  GraduationCap,
} from "lucide-react";

const ICONS = [Users, Building2, Star, GraduationCap];

const DESCRIPTIONS = [
  "ผู้เรียนทั้งหมดที่ผ่านหลักสูตรของเรา",
  "องค์กรที่ไว้วางใจให้เราจัดอบรม",
  "คะแนนเฉลี่ยจากผู้เรียนจริง",
  "หลักสูตรครอบคลุมทุกสายงาน",
];

const TRUST_ITEMS = [
  "หลักสูตรได้มาตรฐาน",
  "วิทยากรมืออาชีพ",
  "ทีม Support พร้อม",
];

export default function KPISection({ stats = [] }) {
  return (
    <section className="relative overflow-hidden py-24 bg-[linear-gradient(180deg,#f8fafd_0%,#e9f3ff_50%,#f8fafd_100%)] dark:bg-[linear-gradient(180deg,#060e1a_0%,#030712_50%,#060e1a_100%)]">
      {/* radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,92,255,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-4 lg:px-6">
        {/* Heading block */}
        {/* <div className="mx-auto mb-14 max-w-2xl text-center">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: 'rgba(0,92,255,0.3)',
              background: 'rgba(0,92,255,0.05)',
            }}
          >
            <TrendingUp className="h-4 w-4 text-[#48B0FF]" />
            <span
              className="text-sm uppercase text-[#48B0FF]"
              style={{ letterSpacing: '0.7px' }}
            >
              ตัวเลขพิสูจน์ความเชื่อมั่น
            </span>
          </div>
          <h2 className="text-3xl font-extrabold leading-tight text-white md:text-5xl">
            <span className="block">ผลกระทบของเรา</span>
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)',
              }}
            >
              ในตัวเลข
            </span>
          </h2>
        </div> */}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, delay: i * 0.08 }}
                className="group relative overflow-hidden rounded-3xl border p-8 text-center transition-all duration-300 bg-white/20 backdrop-blur-xl border-white/30 shadow-lg dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md "
              >
                {/* Icon square */}
                {/* <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg transition-all duration-300 group-hover:shadow-[0_0_28px_rgba(0,92,255,0.5)]"
                  style={{
                    backgroundImage:
                      'linear-gradient(135deg,#005CFF 0%,#2486FF 100%)',
                  }}
                >
                  <Icon className="h-8 w-8 text-white" strokeWidth={2} />
                </div> */}

                {/* Big gradient number */}
                <div
                  className="mb-4 text-5xl font-normal leading-none md:text-4xl"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg,#48B0FF 0%,#005CFF 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  <CountUp
                    end={s.value}
                    suffix={s.suffix || ""}
                    decimals={s.decimals || 0}
                    duration={2}
                    enableScrollSpy
                    scrollSpyOnce
                  />
                </div>

                <h3 className="mb-2 text-xl font-medium text-9e-navy dark:text-white">
                  {s.label}
                </h3>
                {/* <p className="text-sm leading-relaxed text-[#6a7282]">
                  {DESCRIPTIONS[i] || ''}
                </p> */}
              </motion.div>
            );
          })}
        </div>

        {/* Trusted-by banner */}
        {/* <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mt-12 rounded-3xl border p-8 text-center"
          style={{
            borderColor: 'rgba(0,92,255,0.2)',
            backgroundImage:
              'linear-gradient(171deg,rgba(16,24,40,0.6) 0%,rgba(0,0,0,0.6) 100%)',
          }}
        >
          <p className="text-2xl text-white md:text-3xl">
            เชื่อใจโดย{' '}
            <span
              className="font-semibold"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#48B0FF,#005CFF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              5,000+ องค์กร
            </span>{' '}
            ทั่วประเทศไทย
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#005CFF] shadow-[0_0_8px_rgba(0,92,255,0.7)]" />
                <span className="text-sm text-[#99a1af]">{item}</span>
              </div>
            ))}
          </div>
        </motion.div> */}
      </div>
    </section>
  );
}
