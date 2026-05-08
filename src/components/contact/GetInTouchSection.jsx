"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Clock,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { FaLine } from "react-icons/fa";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
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

function InfoRow({ label, value, href }) {
  const valueClasses =
    "block text-sm font-medium text-[#0D1B2A] transition-colors hover:text-[#005CFF] dark:text-white dark:hover:text-[#48B0FF]";
  return (
    <li className="border-r border-[#E2E8F0] px-4 first:pl-0 last:border-r-0  dark:border-[#1e2939]">
      <div className="mb-1 text-base font-medium text-[#465469] dark:text-[#94a3b8]">
        {label}
      </div>
      {href ? (
        <a href={href} className={`${valueClasses} break-all`}>
          {value}
        </a>
      ) : (
        <span className={`${valueClasses} cursor-default break-words`}>
          {value}
        </span>
      )}
    </li>
  );
}

function CardShell({
  icon: Icon,
  gradient,
  subtitle,
  title,
  children,
  onMouseEnter,
  onMouseLeave,
  isHovered,
}) {
  return (
    <motion.div
      variants={item}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
      className="group relative h-full overflow-hidden rounded-3xl border-2 border-9e-air bg-white p-6 shadow-sm dark:border-[#1e2939] dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)] sm:p-7"
    >
      {/* Effect 1: Animated gradient border */}
      <div
        className="absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500 bg-gradient-to-br p-[1px] group-hover:opacity-100"
        style={{ backgroundImage: gradient }}
      >
        <div className="h-full w-full rounded-3xl bg-white dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)]" />
      </div>

      {/* Effect 2: Glow */}
      <motion.div
        className="absolute -inset-1 rounded-3xl blur-2xl transition-opacity duration-500"
        style={{ backgroundImage: gradient }}
        animate={{ opacity: isHovered ? 0.3 : 0 }}
      />

      {/* Content wrapper (relative, sits on top of effects) */}
      <div className="relative">
        <div className="mb-5 flex items-center gap-5">
          {/* Effect 3: Icon scale/rotate on hover */}
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,92,255,0.45)]"
            style={{ backgroundImage: gradient }}
          >
            <Icon className="h-7 w-7" strokeWidth={2} />
          </motion.div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.2px] text-[#005CFF] dark:text-[#48B0FF]">
              {subtitle}
            </p>
            <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-white">
              {title}
            </h3>
          </div>
        </div>

        {children}
      </div>
    </motion.div>
  );
}

function CardShell2({
  icon: Icon,
  gradient,
  subtitle,
  title,
  children,
  onMouseEnter,
  onMouseLeave,
  isHovered,
}) {
  return (
    <motion.div
      variants={item}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      transition={{ duration: 0.3 }}
      className="group relative h-full overflow-hidden rounded-3xl border-2 border-9e-air bg-white p-4 shadow-sm dark:border-[#1e2939] dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)]"
    >
      {/* Effect 1: Animated gradient border */}
      {/* <div
        className="absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500 bg-gradient-to-br p-[1px] group-hover:opacity-100"
        style={{ backgroundImage: gradient }}
      >
        <div className="h-full w-full rounded-3xl bg-white dark:bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)]" />
      </div> */}

      {/* Effect 2: Glow */}
      <motion.div
        className="absolute -inset-1 rounded-3xl blur-2xl transition-opacity duration-500"
        style={{ backgroundImage: gradient }}
        animate={{ opacity: isHovered ? 0.3 : 0 }}
      />

      {/* Content wrapper (relative, sits on top of effects) */}
      <div className="relative">
        <div className="mb-3 flex items-center flex-row gap-3">
          {/* Effect 3: Icon scale/rotate on hover */}
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,92,255,0.45)]"
            style={{ backgroundImage: gradient }}
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </motion.div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.2px] text-[#005CFF] dark:text-[#48B0FF]">
              {subtitle}
            </p>
            <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-white">
              {title}
            </h3>
          </div>
        </div>

        {children}
      </div>
    </motion.div>
  );
}

export default function GetInTouchSection() {
  const [hoveredCard, setHoveredCard] = useState(null);

  return (
    <section className="relative bg-white py-20 dark:bg-[#060e1a] md:py-12">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="flex flex-row">
          {/* LEFT — narrative + CTAs */}
          <div className="lg:w-2/5">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="flex flex-col justify-between h-full p-8 bg-gradient-to-br from-9e-air to-9e-action rounded-3xl dark:from-[#0f172a] dark:to-[#1e2939]"
            >
              {/* <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#005CFF]/30 bg-[#005CFF]/5 px-4 py-1.5 dark:border-[rgba(0,92,255,0.3)] dark:bg-[rgba(0,92,255,0.05)]">
                <MessageCircle className="h-4 w-4 text-[#005CFF] dark:text-[#48B0FF]" />
                <span className="text-sm uppercase tracking-[0.7px] text-[#005CFF] dark:text-[#48B0FF]">
                  Get in touch
                </span>
              </div> */}

              <div>
                <h2 className="text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-[32px]">
                  <span className="block">ติดต่อเราได้</span>
                  <span className="block text-9e-lime">
                    หลายช่องทาง
                  </span>
                </h2>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-white dark:text-[#94a3b8]">
                  ทีมงาน 9Expert Training พร้อมตอบทุกคำถามของคุณ
                  ไม่ว่าจะเป็นเรื่องหลักสูตร ตารางอบรม โปรโมชัน
                  หรือการอบรมภายในองค์กร ติดต่อเราได้ทุกวันทำการ <br />
                  ตั้งแต่จันทร์ถึงศุกร์ เวลา 08:00–17:00 น.
                </p>
              </div>

              <div>
                {/* LINE */}
                <a
                  href="https://line.me/R/ti/p/@9expert"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    "hover:bg-[#03a903] inline-flex flex-row items-center gap-2 rounded-full border border-transparent bg-[#00B900] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,92,255,0.6)] transition-all"
                  }
                >
                  <FaLine className="h-10 w-10" />

                  <div className="flex flex-row">
                    <div>ติดต่อ LINE OA</div>
                  </div>
                
                </a>
                {/* <CardShell
                  icon={FaLine}
                  gradient="linear-gradient(135deg,#00B900 0%,#00D400 100%)"
                  subtitle="แชทสะดวก รวดเร็ว"
                  title="LINE Official"
                  onMouseEnter={() => setHoveredCard("line")}
                  onMouseLeave={() => setHoveredCard(null)}
                  isHovered={hoveredCard === "line"}
                >
                  <p className="text-base font-medium text-[#0D1B2A] dark:text-white">
                    @9expert
                  </p>
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
                </CardShell> */}
              </div>

              {/* <div className="mt-8 flex flex-col gap-4 sm:flex-row">
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
              </div> */}
            </motion.div>
          </div>

          {/* RIGHT — stacked contact cards */}
          <div className="lg:w-3/5 pl-3">
            <motion.div
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.15 }}
              className="grid grid-rows-1 gap-5 sm:grid-rows-2"
            >
              {/* Phone */}
              <CardShell2
                icon={Phone}
                gradient="linear-gradient(135deg,#005CFF 0%,#2486FF 100%)"
                subtitle="ติดต่อด่วน"
                title="โทรศัพท์"
                onMouseEnter={() => setHoveredCard("phone")}
                onMouseLeave={() => setHoveredCard(null)}
                isHovered={hoveredCard === "phone"}
              >
                <ul className="flex flex-row">
                  <InfoRow
                    label="ฝ่ายแนะนำหลักสูตร"
                    value="02-219-4304"
                    href="tel:022194304"
                  />
                  <InfoRow
                    label="เบอร์มือถือ"
                    value="086-322-2423"
                    href="tel:0863222423"
                  />
                </ul>
                {/* <Chip icon={Clock} text="จ–ศ 08:00–17:00" /> */}
              </CardShell2>

              {/* Email */}
              <CardShell2
                icon={Mail}
                gradient="linear-gradient(135deg,#2486FF 0%,#48B0FF 100%)"
                subtitle="ส่งข้อความ"
                title="อีเมล"
                onMouseEnter={() => setHoveredCard("email")}
                onMouseLeave={() => setHoveredCard(null)}
                isHovered={hoveredCard === "email"}
              >
                <ul className="flex flex-row">
                  <InfoRow
                    label="ติดต่อหลักสูตร"
                    value="training@9expert.co.th"
                    href="mailto:training@9expert.co.th"
                  />
                  <InfoRow
                    label="สอบถามเนื้อหาหลังเรียน"
                    value="instructor@9expert.co.th"
                    href="mailto:instructor@9expert.co.th"
                  />
                  <InfoRow
                    label="ติดต่อโฆษณา"
                    value="sponsor@9expert.co.th"
                    href="mailto:sponsor@9expert.co.th"
                  />
                </ul>
                {/* <Chip text="ตอบกลับภายใน 24 ชม." /> */}
              </CardShell2>
              {/* Address */}
              <CardShell2
                icon={MapPin}
                gradient="linear-gradient(135deg,#005CFF 0%,#48B0FF 100%)"
                subtitle="เขตราชเทวี กรุงเทพฯ"
                title="สถานที่อบรม"
                onMouseEnter={() => setHoveredCard("address")}
                onMouseLeave={() => setHoveredCard(null)}
                isHovered={hoveredCard === "address"}
              >
                <ul>
                  <InfoRow
                    // label="สถานที่อบรม"
                    value="ห้องอบรม Public Training ที่อาคารเอเวอร์กรีน เพลส สยาม ชั้น 2"
                  />
                </ul>
                {/* <Chip text="BTS ราชเทวี ทางออก 1" /> */}
              </CardShell2>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
