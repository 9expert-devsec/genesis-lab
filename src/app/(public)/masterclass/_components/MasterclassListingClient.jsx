'use client';

import Image from 'next/image';
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
} from 'lucide-react';
import { MasterclassCard } from './MasterclassCard';

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
        <div className="flex w-full max-w-[640px] flex-col items-start gap-6">
          <span className="inline-flex items-start rounded-full border border-[#1d64f2] bg-[rgba(29,100,242,0.13)] px-3 py-1.5">
            <span className="text-[13px] font-bold uppercase text-[#1d64f2]">MASTERCLASS</span>
          </span>
          <div className="flex w-full flex-col gap-3">
            <h1 className="text-4xl font-extrabold leading-[1.2] text-white lg:text-5xl">
              <span className="block">ยกระดับทักษะ</span>
              <span className="block">
                สู่การใช้งาน<span className="text-[#10b981]">จริง</span>
              </span>
            </h1>
            <p className="text-xl font-semibold text-[#1d64f2]">Workshop เข้มข้น เฉพาะเสาร์-อาทิตย์</p>
            <p className="text-base text-white/80">กลุ่มเล็ก ลงมือปฏิบัติจริง กับผู้เชี่ยวชาญตัวจริง</p>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            {[
              { icon: Calendar, lines: ['Classes only on', 'Saturdays and Sundays'] },
              { icon: Users, lines: ['Limited seats', 'per session'] },
              { icon: Laptop, lines: ['Hands-on', 'workshop 70%'] },
            ].map(({ icon: Icon, lines }) => (
              <span
                key={lines[0]}
                className="flex w-[180px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5"
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
        <div className="flex h-[360px] w-full max-w-[480px] shrink-0 items-center justify-center overflow-hidden max-lg:hidden">
          <Image
            src="/masterclass-element/01_hero_learning_illustration.png"
            alt=""
            width={480}
            height={360}
            className="h-[360px] w-[480px] rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Intro ─────────────────────────────────────────────────────────────────
const INTRO_PARAGRAPHS = [
  'Masterclass คือ หลักสูตรระดับพรีเมียมที่ออกแบบมาสำหรับผู้ที่ต้องการเรียนรู้เทคโนโลยีใหม่และทักษะเฉพาะทางอย่างเข้มข้น ผ่านกระบวนการเรียนรู้แบบ Workshop เน้นการลงมือปฏิบัติจริง พร้อมถ่ายทอดประสบการณ์จากผู้เชี่ยวชาญที่มีประสบการณ์ตรงในสาขาอาชีพ เพื่อให้สามารถนำความรู้ไปประยุกต์ใช้ในการทำงานได้ทันที',
  'แตกต่างจาก Public Training ทั่วไป ซึ่งโปรแกรม Masterclass จะคัดเลือกหัวข้อที่เป็นเทคโนโลยีใหม่ และเป็นที่ต้องการของอุตสาหกรรม และเครื่องมือที่องค์กรชั้นนำนำไปใช้งานจริง พร้อมกรณีศึกษา (Case Study) และ Workshop ที่ออกแบบมาให้ผู้เข้าอบรมได้สร้างผลงานจริงภายในวันอบรม',
  'โปรแกรม Masterclass เปิดอบรมเฉพาะ วันเสาร์ เพื่ออำนวยความสะดวกแก่ผู้บริหาร บุคลากร และผู้ที่ต้องการพัฒนาทักษะเพิ่มเติม โดยทุกหลักสูตรได้รับการออกแบบมาให้ อบรมจบภายใน 1 วัน เพื่อให้สามารถนำความรู้ไปต่อยอดและใช้งานได้อย่างรวดเร็ว โดยไม่กระทบต่อเวลาการทำงานในวันธรรมดา',
];

function IntroSection() {
  return (
    <section className="bg-white px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10 lg:flex-row">
        <div className="flex flex-1 flex-col items-start gap-6">
          <h2 className="text-3xl font-bold text-[#0f172a]">หลักสูตร Masterclass</h2>
          {INTRO_PARAGRAPHS.map((p) => (
            <p key={p.slice(0, 20)} className="text-base leading-[1.6] text-[#475569]">
              {p}
            </p>
          ))}
        </div>
        <div className="h-[340px] w-full max-w-[540px] shrink-0 overflow-hidden rounded-2xl">
          <Image
            src="/masterclass-element/02_classroom_photo.png"
            alt=""
            width={540}
            height={340}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Why study ───────────────────────────────────────────────────────────────
const WHY_STUDY = [
  { Icon: BookOpen, title: 'หลักสูตรเข้มข้น', desc: 'เน้นเทคโนโลยีใหม่และการประยุกต์ใช้จริง' },
  { Icon: Code, title: 'Workshop ตลอดหลักสูตร', desc: 'พร้อมกรณีศึกษาที่ทันสมัยจากโลกธุรกิจ' },
  { Icon: Award, title: 'วิทยากรผู้เชี่ยวชาญ', desc: 'ถ่ายทอดตรงจากประสบการณ์การทำงาน' },
  { Icon: Clock, title: 'อบรมจบใน 1 วัน', desc: 'พร้อมนำไปใช้งานจริงได้ทันที' },
  { Icon: Calendar, title: 'เรียนเฉพาะวันเสาร์', desc: 'เหมาะสำหรับผู้ไม่สะดวกเรียนในวันทำงาน' },
  { Icon: Users, title: 'จำกัดจำนวนผู้เรียน', desc: 'ดูแลและให้คำปรึกษาได้อย่างทั่วถึง' },
  { Icon: FileText, title: 'ได้รับ e-Certificate', desc: 'พร้อม Workshop Files ประกอบการเรียน' },
];

function WhyStudySection() {
  return (
    <section className="bg-[#f8fafc] px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-12">
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">ทำไมต้องเรียน Masterclass</h2>
        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_STUDY.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="flex flex-col items-start gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-6"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-[rgba(29,100,242,0.07)]">
                <Icon size={20} className="text-[#1d64f2]" />
              </span>
              <div className="flex flex-col gap-2">
                <p className="text-base font-bold text-[#0f172a]">{title}</p>
                <p className="text-sm leading-[1.4] text-[#475569]">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Comparison table ────────────────────────────────────────────────────────
const COMPARISON_ROWS = [
  {
    label: 'รูปแบบหลักสูตร',
    masterclass: 'อบรมเชิงลึกเน้นเทคโนโลยีใหม่',
    public: 'หลักสูตรมาตรฐานตามตารางอบรม',
    inhouse: 'หลักสูตรที่ออกแบบเฉพาะองค์กร',
  },
  {
    label: 'เน้นการเรียนรู้',
    masterclass: 'เน้น Workshop และการลงมือปฏิบัติจริง',
    public: 'เน้นการเรียนรู้ตามหลักสูตรมาตรฐาน',
    inhouse: 'ปรับเนื้อหาและ Workshop ให้ตรงกับองค์กร',
  },
  {
    label: 'กำหนดการอบรม',
    masterclass: 'อบรมเฉพาะวันเสาร์',
    public: 'เปิดตามตารางอบรมของสถาบัน',
    inhouse: 'กำหนดวันอบรมร่วมกับองค์กร',
  },
  {
    label: 'ระยะเวลาการอบรม',
    masterclass: 'อบรมจบภายใน 1 วัน',
    public: 'ระยะเวลาตามหลักสูตร',
    inhouse: 'ปรับระยะเวลาให้เหมาะสมกับองค์กร',
  },
  {
    label: 'จำนวนผู้เข้าอบรม',
    masterclass: 'จำกัดจำนวนผู้เรียนจำกัด',
    public: 'จำนวนผู้เข้าอบรมตามรอบอบรม',
    inhouse: 'จำนวนผู้เข้าอบรมตามความต้องการขององค์กร',
  },
];

function ComparisonSection() {
  return (
    <section className="bg-white px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10">
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">
          Masterclass แตกต่างจากรูปแบบการอบรมอื่นอย่างไร
        </h2>
        <div className="w-full overflow-x-auto rounded-2xl border border-[#e2e8f0]">
          <div className="min-w-[720px]">
            <div className="flex items-center gap-4 bg-[#f1f5f9] p-5">
              <p className="w-[280px] shrink-0 text-base font-bold text-[#0f172a]">หัวข้อเปรียบเทียบ</p>
              <span className="flex flex-1 items-start justify-center rounded-lg bg-[#1d64f2] px-4 py-2">
                <span className="text-base font-bold text-white">Masterclass</span>
              </span>
              <p className="flex-1 text-center text-base font-semibold text-[#475569]">Public Training</p>
              <p className="flex-1 text-center text-base font-semibold text-[#475569]">In-House Training</p>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center gap-4 border-b border-[#e2e8f0] p-5 ${
                  i % 2 === 1 ? 'bg-[#fafafa]' : 'bg-white'
                }`}
              >
                <p className="w-[280px] shrink-0 text-[15px] font-semibold text-[#0f172a]">{row.label}</p>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0 text-[#1d64f2]" />
                  <span className="text-[15px] font-semibold text-[#1d64f2]">{row.masterclass}</span>
                </span>
                <p className="flex-1 text-center text-sm text-[#475569]">{row.public}</p>
                <p className="flex-1 text-center text-sm text-[#475569]">{row.inhouse}</p>
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
  'ผู้ที่ต้องการใช้เวลาวันเสาร์ เพื่อพัฒนาความรู้และทักษะใหม่',
  'ผู้ที่ต้องการเรียนรู้เทคโนโลยี และเครื่องมือที่กำลังเป็นแนวโน้มของโลกธุรกิจ',
  'ผู้ที่ต้องการ Workshop เชิงปฏิบัติจริง พร้อมนำความรู้ไปใช้จริง',
  'ผู้ที่ต้องการอัปเดตความรู้จากผู้เชี่ยวชาญเฉพาะด้าน',
  'ผู้ที่ต้องการเรียนรู้รูปแบบเข้มข้นในระยะเวลาสั้น โดยไม่กระทบต่อการทำงานประจำ',
];

function SuitableForSection() {
  return (
    <section className="bg-[#f8fafc] px-4 py-16 lg:px-20">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10">
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">หลักสูตรนี้เหมาะสำหรับใคร</h2>
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
            <p className="text-base font-semibold text-[#0f172a]">พัฒนาความรู้แบบก้าวกระโดด</p>
            <p className="text-sm leading-[1.5] text-[#475569]">
              ออกแบบมาเป็นพิเศษเพื่อให้สามารถนำกลับไปใช้งานได้จริงทันทีที่เรียนจบหลักสูตร 1 วัน
            </p>
          </div>

          <div className="flex flex-1 flex-col items-start gap-5">
            {SUITABLE_CHECKLIST.map((item) => (
              <div key={item.slice(0, 20)} className="flex w-full items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-xl bg-[rgba(29,100,242,0.08)]">
                  <Check size={14} className="text-[#1d64f2]" />
                </span>
                <p className="flex-1 text-[15px] font-medium text-[#0f172a]">{item}</p>
              </div>
            ))}
          </div>

          <div className="flex w-full max-w-[400px] flex-col items-center justify-center gap-5 self-stretch rounded-2xl border border-[rgba(234,179,8,0.25)] bg-white p-8">
            <span className="flex size-16 items-center justify-center rounded-full bg-[rgba(234,179,8,0.1)]">
              <Award size={27} className="text-[#eab308]" />
            </span>
            <p className="text-center text-xl font-bold text-[#0f172a]">Premium Learning Experience</p>
            <p className="text-center text-sm leading-[1.6] text-[#475569]">
              Masterclass ไม่ได้เป็นเพียงหลักสูตรอบรม แต่เป็นระบบนิเวศแห่งความรู้ที่รวมตั้งแต่ทฤษฎี
              เคล็ดลับการลงมือทำ เพื่อสร้างความได้เปรียบในการทำงานในยุค AI และ Digital Transformation
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
        <h2 className="text-center text-3xl font-bold text-[#0f172a]">หลักสูตร Masterclass แนะนำ</h2>
        {courses.length === 0 ? (
          <p className="text-center text-sm text-gray-400">ยังไม่มีหลักสูตรที่เปิด</p>
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
