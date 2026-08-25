"use client";

import Image from "next/image";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Check,
  Clock,
  Code,
  FileText,
  Laptop,
  Users,
} from "lucide-react";
import { MasterclassCard } from "./MasterclassCard";

/**
 * ROUND M-B — redesigned to match Figma node 27:5
 * (expert-masterclass-landing, file lWoAUx7CkpGmY79jAKAtWe).
 *
 * The Figma frame's own navbar and footer are placeholder chrome from the
 * design file (an "Expert" logo, generic nav links) — not ported. The real
 * header/footer come from src/app/(public)/layout.jsx, which every route in
 * this group already inherits; nothing here renders site chrome.
 *
 * Container is max-w-[1200px] — the site-wide convention (all four policy
 * pages, every home-page marketing section), not the Figma's 1440 frame and
 * not the max-w-6xl (1152px) this page used before this round.
 *
 * Every section below except the course cards is static marketing copy,
 * ported verbatim from the Figma design-context response fetched this
 * session — not paraphrased. The course cards (MasterclassCard) are the one
 * part that stays wired to live data; see that file's header.
 */

// ─── Hero ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="flex min-h-[420px] items-center justify-between overflow-hidden bg-9e-navy px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-10 lg:flex-row">
        <div className="flex w-full max-w-[640px] flex-col items-start gap-4">
          {/* ROUND M-C: border/bg stay blue — they echo the rest of the
              page's blue chip system (comparison-table header pill,
              feature-pill borders). Only the text moves to 9e-lime, which
              reads clearly against the translucent blue-on-navy fill and
              matches how "จริง" below also carries the accent color. */}
          {/* <span className="inline-flex items-start rounded-full border border-[#1d64f2] bg-[rgba(29,100,242,0.13)] px-3 py-1.5"> */}
          {/* <span className="text-[18px] font-bold uppercase text-9e-lime">
            MASTERCLASS
          </span> */}
          {/* </span> */}
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-row gap-4">
              <div className="w-[159px] flex items-center">
                <img
                  src="/masterclass-element/masterclass-symbol.png"
                  alt="Masterclass Logo"
                  className="w-full h-auto object-contain"
                />
              </div>

              <h1 className="text-4xl font-bold text-white lg:text-5xl flex flex-col gap-2">
                <span className="block">ยกระดับทักษะ</span>
                <span className="block">
                  สู่การใช้งาน<span className="text-9e-lime">จริง</span>
                </span>
              </h1>
            </div>

            <p className="text-xl font-semibold text-9e-air">
              Workshop เข้มข้น เฉพาะวันเสาร์
            </p>
            <p className="text-base text-white/80">
              กลุ่มเล็ก ลงมือปฏิบัติจริง กับผู้เชี่ยวชาญตัวจริง
            </p>
          </div>
          {/* ROUND M-C: fixed w-[180px] AND h-14 on every pill, regardless of
              how its own text wraps — before this, "Saturdays and Sundays"
              could wrap to a 3rd line while the other two stayed at 2, so
              the pills came out visibly different heights. The fixed height
              plus items-center keeps icon+text vertically centered the same
              way in all three, independent of line count. */}
          <div className="flex flex-wrap items-start gap-4">
            {[
              {
                icon: Calendar,
                lines: ["Classes only on", "Saturdays"],
              },
              { icon: Users, lines: ["Limited seats", "per session"] },
              { icon: Laptop, lines: ["Hands-on", "workshop 70%"] },
            ].map(({ icon: Icon, lines }) => (
              <span
                key={lines[0]}
                className="flex h-14 w-[180px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5"
              >
                <Icon size={17} className="shrink-0 text-white" />
                <span className="flex-1 text-xs font-medium leading-[1.3] text-white">
                  <span className="block">{lines[0]}</span>
                  <span className="block">{lines[1]}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
        {/* ROUND M-C: the asset's natural size is 630×420 (3:2). The old
            480×360 (4:3) box forced object-cover to crop ~30px off each
            side to fill the taller-relative-to-width box. 480×320 matches
            the asset's own aspect ratio exactly (480 × 420/630 = 320), so
            object-cover now scales without cropping anything out. */}
        <div className="flex h-[320px] w-full max-w-[480px] shrink-0 items-center justify-center overflow-hidden max-lg:hidden">
          <Image
            src="/masterclass-element/01_hero_learning_illustration.png"
            alt=""
            width={480}
            height={320}
            className="h-[320px] w-[480px] rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Intro ─────────────────────────────────────────────────────────────────
const INTRO_PARAGRAPHS = [
  "Masterclass คือ หลักสูตรระดับพรีเมียมที่ออกแบบมาสำหรับผู้ที่ต้องการเรียนรู้เทคโนโลยีใหม่และทักษะเฉพาะทางอย่างเข้มข้น ผ่านกระบวนการเรียนรู้แบบ Workshop เน้นการลงมือปฏิบัติจริง พร้อมถ่ายทอดประสบการณ์จากผู้เชี่ยวชาญที่มีประสบการณ์ตรงในสาขาอาชีพ เพื่อให้สามารถนำความรู้ไปประยุกต์ใช้ในการทำงานได้ทันที",
  "แตกต่างจาก Public Training ทั่วไป ซึ่งโปรแกรม Masterclass จะคัดเลือกหัวข้อที่เป็นเทคโนโลยีใหม่ และเป็นที่ต้องการของอุตสาหกรรม และเครื่องมือที่องค์กรชั้นนำนำไปใช้งานจริง พร้อมกรณีศึกษา (Case Study) และ Workshop ที่ออกแบบมาให้ผู้เข้าอบรมได้สร้างผลงานจริงภายในวันอบรม",
  "โปรแกรม Masterclass เปิดอบรมเฉพาะ วันเสาร์ เพื่ออำนวยความสะดวกแก่ผู้บริหาร บุคลากร และผู้ที่ต้องการพัฒนาทักษะเพิ่มเติม โดยทุกหลักสูตรได้รับการออกแบบมาให้ อบรมจบภายใน 1 วัน เพื่อให้สามารถนำความรู้ไปต่อยอดและใช้งานได้อย่างรวดเร็ว โดยไม่กระทบต่อเวลาการทำงานในวันธรรมดา",
];

function IntroSection() {
  return (
    <section className="bg-white px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10 lg:flex-row">
        <div className="flex flex-1 flex-col items-start gap-6">
          <h2 className="text-3xl font-bold text-[#0f172a]">
            หลักสูตร Masterclass
          </h2>
          {INTRO_PARAGRAPHS.map((p) => (
            <p
              key={p.slice(0, 20)}
              className="text-base leading-[1.6] text-[#475569]"
            >
              {p}
            </p>
          ))}
        </div>
        {/* ROUND M-C: rounded-2xl now also lives on the <Image> itself, not
            just the wrapper. overflow-hidden + rounded-2xl on the wrapper
            alone should clip the img to that radius, but it wasn't catching
            evenly on all four corners — matching the radius on the inner
            element directly is the defensive fix. */}
        <div className="h-[340px] w-full max-w-[540px] shrink-0 overflow-hidden rounded-2xl">
          <Image
            src="/masterclass-element/Masterclass_Logo_black.png"
            alt=""
            width={540}
            height={340}
            className="h-full w-full rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Why study ───────────────────────────────────────────────────────────────
const WHY_STUDY = [
  {
    Icon: BookOpen,
    title: "หลักสูตรเข้มข้น",
    desc: "เน้นเทคโนโลยีใหม่และการประยุกต์ใช้จริง",
  },
  {
    Icon: Code,
    title: "Workshop ตลอดหลักสูตร",
    desc: "พร้อมกรณีศึกษาที่ทันสมัยจากโลกธุรกิจ",
  },
  {
    Icon: Award,
    title: "วิทยากรผู้เชี่ยวชาญ",
    desc: "ถ่ายทอดตรงจากประสบการณ์การทำงาน",
  },
  { Icon: Clock, title: "อบรมจบใน 1 วัน", desc: "พร้อมนำไปใช้งานจริงได้ทันที" },
  {
    Icon: Calendar,
    title: "เรียนเฉพาะวันเสาร์",
    desc: "เหมาะสำหรับผู้ไม่สะดวกเรียนในวันทำงาน",
  },
  {
    Icon: Users,
    title: "จำกัดจำนวนผู้เรียน",
    desc: "ดูแลและให้คำปรึกษาได้อย่างทั่วถึง",
  },
  {
    Icon: FileText,
    title: "ได้รับ e-Certificate",
    desc: "พร้อม Workshop Files ประกอบการเรียน",
  },
];

/**
 * ROUND M-C addendum: card is w-[282px] instead of a flexible grid cell, so
 * both rows share one width. At the 1200px container: row 1 is 4 × 282px +
 * 3 × 24px gap = 1128 + 72 = 1200px exactly, no cramming. Row 2 is 3 × 282px
 * + 2 × 24px gap = 894px, centered in the 1200px row rather than stretched
 * or left-aligned.
 */
function WhyStudyCard({ Icon, title, desc, index }) {
  return (
    <div
      className="
        group relative flex w-[282px] shrink-0 flex-col items-center
        gap-4 overflow-hidden rounded-2xl border border-[#e2e8f0]
        bg-white p-6
        transition-all duration-300 ease-out
        hover:-translate-y-1
        hover:border-[#b7f529]
        hover:shadow-[0_16px_40px_rgba(15,23,42,0.10)]
      "
    >
      {/* Lime Glow */}
      <div
        className="
          pointer-events-none absolute -right-16 -top-16
          size-40 rounded-full bg-[#b7f529]/20 blur-3xl
          opacity-0 transition-opacity duration-300
          group-hover:opacity-100
        "
      />

      {/* Number 01–07 */}
      {/* <span
        className="
          pointer-events-none absolute right-4 top-2
          text-6xl font-bold text-[#0f172a]/[0.035]
          transition-all duration-300
          group-hover:text-[#b7f529]/10
        "
      >
        {String(index + 1).padStart(2, "0")}
      </span> */}

      {/* Icon */}
      <span
        className="
          relative z-10 flex size-12 items-center justify-center
          rounded-full bg-9e-border
          transition-all duration-300
          group-hover:scale-110
          group-hover:bg-[#b7f529]
          group-hover:shadow-[0_6px_20px_rgba(183,245,41,0.30)]
        "
      >
        <Icon
          size={20}
          className="
            text-9e-lime transition-colors duration-300
            group-hover:text-[#0f172a]
          "
        />
      </span>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
        <p className="text-base font-bold text-[#0f172a]">
          {title}
        </p>

        <p className="text-sm leading-[1.4] text-[#475569]">
          {desc}
        </p>
      </div>
    </div>
  );
}

function WhyStudySection() {
  const row1 = WHY_STUDY.slice(0, 4);
  const row2 = WHY_STUDY.slice(4);

  return (
    <section className="bg-[#f8fafc] px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-12">

        <h2 className="text-center text-3xl font-bold text-[#0f172a]">
          ทำไมต้องเรียน Masterclass
        </h2>

        <div className="flex w-full flex-col items-center gap-6">

          {/* Row 1: 01–04 */}
          <div className="flex w-full flex-wrap justify-center gap-6">
            {row1.map((item, index) => (
              <WhyStudyCard
                key={item.title}
                {...item}
                index={index}
              />
            ))}
          </div>

          {/* Row 2: 05–07 */}
          <div className="flex w-full flex-wrap justify-center gap-6">
            {row2.map((item, index) => (
              <WhyStudyCard
                key={item.title}
                {...item}
                index={index + row1.length}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Comparison table ────────────────────────────────────────────────────────
const COMPARISON_ROWS = [
  {
    label: "รูปแบบหลักสูตร",
    masterclass: "อบรมเชิงลึกเน้นเทคโนโลยีใหม่",
    public: "หลักสูตรมาตรฐานตามตารางอบรม",
    inhouse: "หลักสูตรที่ออกแบบเฉพาะองค์กร",
  },
  {
    label: "เน้นการเรียนรู้",
    masterclass: "เน้น Workshop และการลงมือปฏิบัติจริง",
    public: "เน้นการเรียนรู้ตามหลักสูตรมาตรฐาน",
    inhouse: "ปรับเนื้อหาและ Workshop ให้ตรงกับองค์กร",
  },
  {
    label: "กำหนดการอบรม",
    masterclass: "อบรมเฉพาะวันเสาร์",
    public: "เปิดตามตารางอบรมของสถาบัน",
    inhouse: "กำหนดวันอบรมร่วมกับองค์กร",
  },
  {
    label: "ระยะเวลาการอบรม",
    masterclass: "อบรมจบภายใน 1 วัน",
    public: "ระยะเวลาตามหลักสูตร",
    inhouse: "ปรับระยะเวลาให้เหมาะสมกับองค์กร",
  },
  {
    label: "จำนวนผู้เข้าอบรม",
    masterclass: "จำกัดจำนวนผู้เรียนจำกัด",
    public: "จำนวนผู้เข้าอบรมตามรอบอบรม",
    inhouse: "จำนวนผู้เข้าอบรมตามความต้องการขององค์กร",
  },
];

function ComparisonSection() {
  return (
    <section className="bg-white px-4 py-16 lg:px-20">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 className="mb-8 text-center text-3xl font-bold text-[#0f172a]">
          Masterclass แตกต่างจากรูปแบบการอบรมอื่นอย่างไร
        </h2>

        <div className="overflow-x-auto">
          <div className="min-w-[900px] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-[240px_repeat(3,minmax(0,1fr))] bg-[#f1f5f9]">
              <div className="flex items-center px-6 py-4">
                <span className="text-[15px] font-bold text-[#0f172a]">
                  หัวข้อเปรียบเทียบ
                </span>
              </div>

              <div
                className="    flex items-center justify-center
    bg-9e-border px-6 py-4
    border-x-2 border-t-2 border-9e-border
    rounded-t-xl"
              >
                <span className="text-base font-bold text-9e-lime">
                  Masterclass
                </span>
              </div>

              <div className="flex items-center justify-center border-l border-[#e2e8f0] px-6 py-4">
                <span className="text-base font-semibold text-[#334155]">
                  Public Training
                </span>
              </div>

              <div className="flex items-center justify-center border-l border-[#e2e8f0] px-6 py-4">
                <span className="text-base font-semibold text-[#334155]">
                  In-House Training
                </span>
              </div>
            </div>

            {/* Rows */}
            {COMPARISON_ROWS.map((row, index) => (
              <div
                key={row.label}
                className={`
                  grid grid-cols-[240px_repeat(3,minmax(0,1fr))]
                  border-t border-[#e2e8f0]
                  ${index % 2 === 1 ? "bg-[#fcfcfd]" : "bg-white"}
                `}
              >
                {/* Label */}
                <div className="flex min-h-[88px] items-center gap-3 px-6 py-4">
                  {row.icon && (
                    <row.icon
                      size={20}
                      strokeWidth={1.8}
                      className="shrink-0 text-[#64748b]"
                    />
                  )}

                  <span className="text-[15px] font-semibold text-[#0f172a]">
                    {row.label}
                  </span>
                </div>

                {/* Masterclass */}
                <div
                  className={`
    flex min-h-[88px] items-center justify-center
    border-x-2 border-9e-border
    px-6 py-4
    ${index === COMPARISON_ROWS.length - 1 ? "border-b-2 rounded-b-xl" : ""}
  `}
                >
                  <div className="flex items-center justify-center gap-3 text-center">
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-[#22c55e]"
                      fill="#fff"
                      strokeWidth={2}
                    />

                    <span className="text-[15px] font-medium leading-relaxed text-[#334155]">
                      {row.masterclass}
                    </span>
                  </div>
                </div>

                {/* Public */}
                <div className="flex min-h-[88px] items-center justify-center border-l border-[#e2e8f0] px-6 py-4">
                  <p className="text-center text-[15px] leading-relaxed text-[#475569]">
                    {row.public}
                  </p>
                </div>

                {/* In-House */}
                <div className="flex min-h-[88px] items-center justify-center border-l border-[#e2e8f0] px-6 py-4">
                  <p className="text-center text-[15px] leading-relaxed text-[#475569]">
                    {row.inhouse}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Who it's for ─────────────────────────────────────────────────────────
const SUITABLE_CHECKLIST = [
  "ผู้ที่ต้องการใช้เวลาวันเสาร์ เพื่อพัฒนาความรู้และทักษะใหม่",
  "ผู้ที่ต้องการเรียนรู้เทคโนโลยี และเครื่องมือที่กำลังเป็นแนวโน้มของโลกธุรกิจ",
  "ผู้ที่ต้องการ Workshop เชิงปฏิบัติจริง พร้อมนำความรู้ไปใช้จริง",
  "ผู้ที่ต้องการอัปเดตความรู้จากผู้เชี่ยวชาญเฉพาะด้าน",
  "ผู้ที่ต้องการเรียนรู้รูปแบบเข้มข้นในระยะเวลาสั้น โดยไม่กระทบต่อการทำงานประจำ",
];

function SuitableForSection() {
  return (
    <section className="bg-[#f8fafc] px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10">
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">
          หลักสูตรนี้เหมาะสำหรับใคร
        </h2>
        <div className="flex w-full flex-col items-start gap-8 lg:flex-row">
          <div className="flex w-full max-w-[360px] flex-col items-start gap-5 rounded-2xl border border-[#e2e8f0] bg-white p-6">
            <div className="h-[200px] w-full overflow-hidden rounded-xl">
              <Image
                src="/masterclass-element/04_learner_illustration.png"
                alt=""
                width={360}
                height={200}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-base font-semibold text-[#0f172a]">
              พัฒนาความรู้แบบก้าวกระโดด
            </p>
            <p className="text-sm leading-[1.5] text-[#475569]">
              ออกแบบมาเป็นพิเศษเพื่อให้สามารถนำกลับไปใช้งานได้จริงทันทีที่เรียนจบหลักสูตร
              1 วัน
            </p>
          </div>

          <div className="flex flex-1 flex-col items-start gap-5">
            {SUITABLE_CHECKLIST.map((item) => (
              <div
                key={item.slice(0, 20)}
                className="flex w-full items-center gap-3"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-xl bg-[rgba(29,100,242,0.08)]">
                  <Check size={14} className="text-[#1d64f2]" />
                </span>
                <p className="flex-1 text-[15px] font-medium text-[#0f172a]">
                  {item}
                </p>
              </div>
            ))}
          </div>

          <div className="flex w-full max-w-[400px] flex-col items-center justify-center gap-5 self-stretch rounded-2xl border border-[rgba(234,179,8,0.25)] bg-white p-8">
            <span className="flex size-16 items-center justify-center rounded-full bg-[rgba(234,179,8,0.1)]">
              <Award size={27} className="text-[#eab308]" />
            </span>
            <p className="text-center text-xl font-bold text-[#0f172a]">
              Premium Learning Experience
            </p>
            <p className="text-center text-sm leading-[1.6] text-[#475569]">
              Masterclass ไม่ได้เป็นเพียงหลักสูตรอบรม
              แต่เป็นระบบนิเวศแห่งความรู้ที่รวมตั้งแต่ทฤษฎี เคล็ดลับการลงมือทำ
              เพื่อสร้างความได้เปรียบในการทำงานในยุค AI และ Digital
              Transformation
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Courses (live data) ─────────────────────────────────────────────────────
function CoursesSection({ courses }) {
  return (
    <section className="bg-white px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-12">
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">
          หลักสูตร Masterclass แนะนำ
        </h2>
        {courses.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            ยังไม่มีหลักสูตรที่เปิด
          </p>
        ) : (
          <div className="flex w-full flex-col items-stretch gap-8 lg:flex-row">
            {courses.map((c) => (
              <MasterclassCard key={c._id} course={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export function MasterclassListingClient({ courses = [] }) {
  return (
    <main>
      <Hero />
      <IntroSection />
      <WhyStudySection />
      <ComparisonSection />
      <SuitableForSection />
      <CoursesSection courses={courses} />
    </main>
  );
}
