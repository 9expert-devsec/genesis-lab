'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Clock,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

function Chip({ icon: Icon, text }) {
  return (
    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#005CFF]/20 bg-[#005CFF]/5 px-3 py-1.5 dark:border-[rgba(0,92,255,0.2)] dark:bg-[rgba(0,92,255,0.1)]">
      {Icon ? (
        <Icon className="h-3 w-3 text-[#005CFF] dark:text-[#48B0FF]" />
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-[#005CFF]" />
      )}
      <span className="text-xs text-[#005CFF] dark:text-[#48B0FF]">{text}</span>
    </div>
  );
}

function CardShell({ icon: Icon, gradient, subtitle, title, children }) {
  return (
    <motion.div
      variants={item}
      className="group relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#005CFF]/40 hover:shadow-[0_20px_50px_-12px_rgba(0,92,255,0.25)] dark:border-[#1e2939] dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)] dark:hover:border-[rgba(0,92,255,0.4)] dark:hover:shadow-[0_20px_50px_-12px_rgba(0,92,255,0.45)] sm:p-7"
    >
      <div className="mb-5 flex items-center gap-5">
        <div
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,92,255,0.45)]"
          style={{ backgroundImage: gradient }}
        >
          <Icon className="h-7 w-7" strokeWidth={2} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[1.2px] text-[#005CFF] dark:text-[#48B0FF]">
            {subtitle}
          </p>
          <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-white">{title}</h3>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

export default function GetInTouchSection() {
  return (
    <section className="relative bg-white py-20 dark:bg-[#060e1a] md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-16">
          {/* LEFT — narrative + CTAs */}
          <div className="lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#005CFF]/30 bg-[#005CFF]/5 px-4 py-1.5 dark:border-[rgba(0,92,255,0.3)] dark:bg-[rgba(0,92,255,0.05)]">
                <MessageCircle className="h-4 w-4 text-[#005CFF] dark:text-[#48B0FF]" />
                <span className="text-sm uppercase tracking-[0.7px] text-[#005CFF] dark:text-[#48B0FF]">
                  Get in touch
                </span>
              </div>

              <h2 className="text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-5xl">
                <span className="block">ติดต่อเราได้</span>
                <span className="block bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent">
                  หลายช่องทาง
                </span>
              </h2>

              <p className="mt-5 max-w-md text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
                ทีมงาน 9Expert Training พร้อมตอบทุกคำถามของคุณ ไม่ว่าจะเป็นเรื่องหลักสูตร
                ตารางอบรม โปรโมชัน หรือการอบรมภายในองค์กร
                ติดต่อเราได้ทุกวันทำการ ตั้งแต่จันทร์ถึงศุกร์ เวลา 08:00–17:00 น.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="tel:022194304"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#005CFF] to-[#2486FF] px-8 py-3.5 text-base font-semibold text-white shadow-[0_25px_50px_-12px_rgba(0,92,255,0.5)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgba(0,92,255,0.7)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[rgba(72,176,255,0.3)]"
                  />
                  <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                    <Phone className="h-5 w-5" />
                    โทรหาเรา
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
                <Link
                  href="mailto:training@9expert.co.th"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#005CFF]/40 px-8 py-3.5 text-base font-semibold text-[#005CFF] transition-all duration-300 hover:border-[#005CFF] hover:bg-[#005CFF]/5 dark:border-[rgba(72,176,255,0.4)] dark:text-[#48B0FF] dark:hover:border-[#48B0FF] dark:hover:bg-[rgba(72,176,255,0.08)]"
                >
                  <Mail className="h-5 w-5" />
                  ส่งอีเมล
                </Link>
              </div>
            </motion.div>
          </div>

          {/* RIGHT — stacked contact cards */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="flex flex-col gap-5 lg:col-span-7"
          >
            {/* Phone */}
            <CardShell
              icon={Phone}
              gradient="linear-gradient(135deg,#005CFF 0%,#2486FF 100%)"
              subtitle="ติดต่อด่วน"
              title="โทรศัพท์"
            >
              <div className="space-y-1.5">
                <a
                  href="tel:022194304"
                  className="block text-base font-medium text-[#0D1B2A] transition-colors hover:text-[#005CFF] dark:text-white dark:hover:text-[#48B0FF]"
                >
                  02-219-4304
                </a>
                <a
                  href="tel:0863222423"
                  className="block text-sm text-[#465469] transition-colors hover:text-[#0D1B2A] dark:text-[#99a1af] dark:hover:text-white"
                >
                  086-322-2423
                </a>
                <a
                  href="tel:0840105208"
                  className="block text-sm text-[#465469] transition-colors hover:text-[#0D1B2A] dark:text-[#99a1af] dark:hover:text-white"
                >
                  084-010-5208
                </a>
              </div>
              <Chip icon={Clock} text="จ–ศ 08:00–17:00" />
            </CardShell>

            {/* Email */}
            <CardShell
              icon={Mail}
              gradient="linear-gradient(135deg,#2486FF 0%,#48B0FF 100%)"
              subtitle="ส่งข้อความ"
              title="อีเมล"
            >
              <a
                href="mailto:training@9expert.co.th"
                className="block break-all text-base font-medium text-[#0D1B2A] transition-colors hover:text-[#005CFF] dark:text-white dark:hover:text-[#48B0FF]"
              >
                training@9expert.co.th
              </a>
              <Chip text="ตอบกลับภายใน 24 ชม." />
            </CardShell>

            {/* LINE */}
            <CardShell
              icon={MessageCircle}
              gradient="linear-gradient(135deg,#00B900 0%,#00D400 100%)"
              subtitle="แชทสะดวก รวดเร็ว"
              title="LINE Official"
            >
              <p className="text-base font-medium text-[#0D1B2A] dark:text-white">@9expert</p>
              <a
                href="https://line.me/R/ti/p/@9expert"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#005CFF] transition-all hover:underline dark:text-[#D4F73F]"
              >
                เพิ่มเพื่อน
                <ArrowUpRight className="h-4 w-4" />
              </a>
              <Chip text="ตอบกลับเร็ว" />
            </CardShell>

            {/* Address */}
            <CardShell
              icon={MapPin}
              gradient="linear-gradient(135deg,#005CFF 0%,#48B0FF 100%)"
              subtitle="เขตราชเทวี กรุงเทพฯ"
              title="ที่อยู่สำนักงาน"
            >
              <p className="text-sm leading-relaxed text-[#465469] dark:text-[#99a1af]">
                318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B ซอยวรฤทธิ์
                ถนนพญาไท แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400
              </p>
              <Chip text="BTS ราชเทวี ทางออก 1" />
            </CardShell>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
