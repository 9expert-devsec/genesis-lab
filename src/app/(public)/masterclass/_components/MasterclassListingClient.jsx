'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  BarChart2,
  BookOpenCheck,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FlaskConical,
  GraduationCap,
  Plus,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';

// ─── FAQ Accordion ──────────────────────────────────────────────────────────
function FaqAccordionItem({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-9e-navy dark:text-white"
      >
        <span>{faq.question_th}</span>
        <Plus
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96' : 'max-h-0'}`}
      >
        <div
          className="prose prose-sm dark:prose-invert pb-4 text-gray-600 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: faq.answer_html }}
        />
      </div>
    </div>
  );
}

// ─── Course Card ─────────────────────────────────────────────────────────────
const LEVEL_MAP = { beginner: 'เริ่มต้น', intermediate: 'กลาง', advanced: 'สูง' };

function MasterclassCard({ course }) {
  const firstBatch = course.batches?.[0];

  return (
    <Link
      href={`/masterclass/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-9e-md dark:bg-9e-card transition-shadow hover:shadow-lg"
    >
      {/* Cover */}
      <div className="relative aspect-video">
        {course.cover_image_url ? (
          <Image
            src={course.cover_image_url}
            alt={course.title_th}
            fill
            className="object-cover"
            sizes="(max-width:768px) 100vw, 50vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-9e-brand to-9e-action" />
        )}
        {/* Badges over image */}
        <div className="absolute bottom-3 left-3 flex gap-2">
          {course.level && (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
              {LEVEL_MAP[course.level] ?? course.level}
            </span>
          )}
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            {course.duration_days} วัน · {course.duration_hours} ชม.
          </span>
          {course.schedule_days?.[0] && (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
              {course.schedule_days[0]}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="line-clamp-2 text-xl font-bold text-9e-navy dark:text-white">
          {course.title_th}
        </h3>
        {course.subtitle_th && (
          <p className="line-clamp-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {course.subtitle_th}
          </p>
        )}

        {firstBatch ? (
          <>
            {/* Early Bird badge */}
            {firstBatch.is_early_bird && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-9e-lime px-3 py-0.5 text-xs font-semibold text-9e-navy">
                <Tag size={11} /> Early Bird
              </span>
            )}

            {/* Batch label + date */}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {firstBatch.batch_label || `รุ่นที่ ${firstBatch.batch_no}`}
              {firstBatch.dates?.[0]?.day_label && ` · ${firstBatch.dates[0].day_label}`}
            </p>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-9e-action">
                {firstBatch.effective_price?.toLocaleString('th-TH')} บาท
              </span>
              {firstBatch.is_early_bird && (
                <span className="text-sm text-gray-400 line-through">
                  {firstBatch.original_price?.toLocaleString('th-TH')} บาท
                </span>
              )}
            </div>

            {/* Countdown */}
            {firstBatch.is_early_bird && firstBatch.early_bird_deadline && (
              <CountdownTimer deadline={firstBatch.early_bird_deadline} className="mt-1" />
            )}

            {/* Capacity bar */}
            <div className="mt-1">
              <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span>
                  ที่นั่ง {firstBatch.registered_count}/{firstBatch.capacity}
                </span>
                <span
                  className={
                    firstBatch.status === 'full'
                      ? 'font-medium text-red-500'
                      : 'font-medium text-green-600'
                  }
                >
                  {firstBatch.status === 'full' ? 'เต็มแล้ว' : 'เปิดรับสมัคร'}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-1.5 rounded-full bg-9e-brand transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (firstBatch.registered_count / firstBatch.capacity) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* CTA */}
            {firstBatch.status === 'full' && (
              <div className="mt-auto flex items-center gap-3 pt-4">
                <button
                  disabled
                  className="flex-1 cursor-not-allowed rounded-full bg-gray-200 py-2.5 text-sm font-medium text-gray-400 dark:bg-gray-700"
                >
                  เต็มแล้ว
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-auto pt-4 text-sm text-gray-400">ยังไม่เปิดรับสมัคร</p>
        )}
      </div>
    </Link>
  );
}

// ─── Main listing component ──────────────────────────────────────────────────
export function MasterclassListingClient({ courses = [], faqs = [] }) {
  return (
    <main>
      {/* [A] Hero */}
      <section className="bg-9e-navy px-4 py-20 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-9e-lime">
          MASTERCLASS
        </span>
        <h1 className="mt-3 text-4xl font-bold text-white lg:text-5xl">
          เรียนเข้มข้น สไตล์มืออาชีพ
        </h1>
        <p className="mt-4 text-lg text-9e-air">
          Workshop เต็มวัน เฉพาะเสาร์-อาทิตย์ กลุ่มเล็ก ลงมือปฏิบัติจริง
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {[
            { icon: <Calendar size={15} />, label: 'เรียนเฉพาะเสาร์-อาทิตย์' },
            { icon: <Users size={15} />, label: 'จำกัดที่นั่งแต่ละรุ่น' },
            { icon: <Zap size={15} />, label: 'Workshop เน้นปฏิบัติ 70%' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm"
            >
              {icon}
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* [B] Course Grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="mb-8 text-2xl font-bold text-9e-navy dark:text-white">
          หลักสูตร Masterclass
        </h2>
        {courses.length === 0 ? (
          <p className="text-center text-sm text-gray-400">ยังไม่มีหลักสูตรที่เปิด</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {courses.map((c) => (
              <MasterclassCard key={c._id} course={c} />
            ))}
          </div>
        )}
      </section>

      {/* [C] FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold text-9e-navy dark:text-white">
          คำถามที่พบบ่อย
        </h2>
        {faqs.length === 0 ? (
          <p className="text-center text-sm text-gray-400">ยังไม่มีคำถามที่พบบ่อย</p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {faqs.map((f) => (
              <FaqAccordionItem key={f._id} faq={f} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
