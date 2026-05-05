'use client';

import { motion } from 'framer-motion';
import {
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Clock,
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
    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,92,255,0.2)] bg-[rgba(0,92,255,0.1)] px-3 py-1.5">
      {Icon ? (
        <Icon className="h-3 w-3 text-[#48B0FF]" />
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-[#005CFF]" />
      )}
      <span className="text-xs text-[#48B0FF]">{text}</span>
    </div>
  );
}

function CardShell({ icon: Icon, gradient, subtitle, title, children }) {
  return (
    <motion.div
      variants={item}
      className="group relative overflow-hidden rounded-3xl border border-[#1e2939] bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)] p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-12px_rgba(0,92,255,0.45)]"
    >
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,92,255,0.45)]"
        style={{ backgroundImage: gradient }}
      >
        <Icon className="h-7 w-7" strokeWidth={2} />
      </div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#48B0FF]">
        {subtitle}
      </p>
      <h3 className="mb-3 text-xl font-bold text-white">{title}</h3>
      {children}
    </motion.div>
  );
}

export default function ContactCardsSection() {
  return (
    <section className="relative overflow-hidden bg-[#060e1a] py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(0,92,255,0.10) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgba(0,92,255,0.3)] bg-[rgba(0,92,255,0.05)] px-4 py-1.5">
            <MessageCircle className="h-4 w-4 text-[#48B0FF]" />
            <span className="text-sm uppercase tracking-[0.7px] text-[#48B0FF]">
              ช่องทางติดต่อ
            </span>
          </div>
          <h2 className="text-3xl font-extrabold leading-normal text-white md:text-5xl">
            <span className="block">ติดต่อเราได้</span>
            <span className="block bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent">
              หลายช่องทาง
            </span>
          </h2>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
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
                className="block text-base font-medium text-white transition-colors hover:text-[#48B0FF]"
              >
                02-219-4304
              </a>
              <a
                href="tel:0863222423"
                className="block text-sm text-[#99a1af] transition-colors hover:text-white"
              >
                086-322-2423
              </a>
              <a
                href="tel:0840105208"
                className="block text-sm text-[#99a1af] transition-colors hover:text-white"
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
              className="block break-all text-base font-medium text-white transition-colors hover:text-[#48B0FF]"
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
            <p className="text-base font-medium text-white">@9expert</p>
            <a
              href="https://line.me/R/ti/p/@9expert"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#D4F73F] transition-all hover:underline"
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
            <p className="text-sm leading-relaxed text-[#99a1af]">
              318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B ซอยวรฤทธิ์
              ถนนพญาไท แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400
            </p>
            <Chip text="BTS ราชเทวี ทางออก 1" />
          </CardShell>
        </motion.div>
      </div>
    </section>
  );
}
