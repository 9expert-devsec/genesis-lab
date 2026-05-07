'use client';

import { motion } from 'framer-motion';
import {
  Building2,
  FileText,
  Globe,
  Clock,
  Facebook,
  Youtube,
  Instagram,
  Linkedin,
  MessageCircle,
  Music2,
} from 'lucide-react';
import OpenNowBadge from './OpenNowBadge';

const SOCIALS = [
  { label: 'Facebook',  href: 'https://facebook.com/9ExpertTraining',   icon: Facebook },
  { label: 'YouTube',   href: 'https://youtube.com/9expert',            icon: Youtube },
  { label: 'LINE',      href: 'https://line.me/R/ti/p/@9expert',        icon: MessageCircle },
  { label: 'TikTok',    href: 'https://tiktok.com/@9expert',            icon: Music2 },
  { label: 'Instagram', href: 'https://instagram.com/9experttraining',  icon: Instagram },
  { label: 'LinkedIn',  href: 'https://linkedin.com/company/9expert',   icon: Linkedin },
];

const COMPANY_LINES = [
  {
    icon: FileText,
    text: 'เลขประจำตัวผู้เสียภาษี: 0105548019065',
  },
  {
    icon: Building2,
    text: 'บริษัท นายน์เอ็กซ์เพิร์ท จำกัด (สำนักงานใหญ่)',
  },
  {
    icon: Globe,
    text: '9 EXPERT COMPANY LIMITED (Head Office)',
  },
];

const HOURS = [
  { day: 'จันทร์ – ศุกร์', time: '08:00 – 17:00 น.', open: true },
  { day: 'เสาร์ – อาทิตย์', time: 'ปิดทำการ', open: false },
];

export default function BusinessInfoSection() {
  return (
    <section className="relative bg-white py-20 dark:bg-[#060e1a]">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* LEFT: Company info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#005CFF]/30 bg-[#005CFF]/5 px-4 py-1.5 dark:border-[rgba(0,92,255,0.3)] dark:bg-[rgba(0,92,255,0.05)]">
              <Building2 className="h-4 w-4 text-[#005CFF] dark:text-[#48B0FF]" />
              <span className="text-sm uppercase tracking-[0.7px] text-[#005CFF] dark:text-[#48B0FF]">
                ข้อมูลบริษัท
              </span>
            </div>
            <h2 className="mb-6 text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-4xl">
              9Expert Company Limited
            </h2>

            <ul className="space-y-4">
              {COMPANY_LINES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#005CFF]/10 text-[#005CFF] dark:bg-[rgba(0,92,255,0.15)] dark:text-[#48B0FF]">
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
                    {text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="my-7 h-px w-full bg-gradient-to-r from-transparent via-[#005CFF]/30 to-transparent" />

            <p className="mb-4 text-sm font-medium text-[#465469] dark:text-[#94a3b8]">
              ติดตามเราได้ที่
            </p>
            <div className="flex flex-wrap gap-2">
              {SOCIALS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] text-[#5E6A7E] transition-all duration-200 hover:border-[#005CFF] hover:bg-[#005CFF] hover:text-white hover:shadow-[0_0_16px_rgba(0,92,255,0.35)] dark:border-[#1e3a5f] dark:text-[#94a3b8]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </motion.div>

          {/* RIGHT: Hours card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-sm dark:border-[#1e2939] dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)]"
          >
            <div className="mb-6 flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg,#005CFF 0%,#2486FF 100%)',
                }}
              >
                <Clock className="h-7 w-7" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[1.2px] text-[#005CFF] dark:text-[#48B0FF]">
                  Office Hours
                </p>
                <h3 className="text-2xl font-bold text-[#0D1B2A] dark:text-white">
                  เวลาทำการ
                </h3>
              </div>
            </div>

            <div className="mb-6">
              <OpenNowBadge />
            </div>

            <ul className="divide-y divide-[#E2E8F0] dark:divide-[#1e2939]">
              {HOURS.map(({ day, time, open }) => (
                <li
                  key={day}
                  className="flex items-center justify-between py-3"
                >
                  <span className="text-base font-medium text-[#0D1B2A] dark:text-white">
                    {day}
                  </span>
                  <span
                    className={
                      open
                        ? 'text-base font-semibold text-[#005CFF] dark:text-[#48B0FF]'
                        : 'text-base text-[#5E6A7E] dark:text-[#6a7282]'
                    }
                  >
                    {time}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFD] p-4 dark:border-[#1e2939] dark:bg-white/5">
              <p className="text-sm leading-relaxed text-[#465469] dark:text-[#94a3b8]">
                สามารถส่งข้อความผ่าน LINE Official หรืออีเมลได้นอกเวลาทำการ
                ทีมงานจะตอบกลับในวันทำการถัดไป
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
