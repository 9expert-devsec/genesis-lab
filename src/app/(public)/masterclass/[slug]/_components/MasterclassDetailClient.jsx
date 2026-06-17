'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  BarChart2,
  Briefcase,
  Building2,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FlaskConical,
  Plus,
  TrendingUp,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { CountdownTimer } from '../../_components/CountdownTimer';

const LEVEL_MAP = { beginner: 'เริ่มต้น', intermediate: 'กลาง', advanced: 'สูง' };
const SUITABLE_ICONS = [BarChart2, Briefcase, Database, Building2, UserCheck, TrendingUp];

// ── Shared FAQ accordion (same as listing page) ───────────────────────────────
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
        <Plus size={16} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96' : 'max-h-0'}`}>
        <div
          className="prose prose-sm dark:prose-invert pb-4 text-gray-600 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: faq.answer_html }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MasterclassDetailClient({ course, faqs = [] }) {
  // [K] Instructors fetch
  const [instructors, setInstructors] = useState([]);
  useEffect(() => {
    if (!course.instructor_ids?.length) return;
    fetch(`/api/admin/instructors?ids=${course.instructor_ids.join(',')}`)
      .then((r) => r.json())
      .then((data) => setInstructors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [course.instructor_ids]);

  // [J] Curriculum open/close state
  const buildDefaultOpen = () => {
    const map = {};
    course.curriculum?.forEach((session, si) => {
      session.modules?.forEach((_, mi) => {
        map[`${si}-${mi}`] = true;
      });
    });
    return map;
  };
  const [openModules, setOpenModules] = useState({});
  useEffect(() => { setOpenModules(buildDefaultOpen()); }, []);

  const allOpen = Object.values(openModules).every(Boolean) && Object.keys(openModules).length > 0;
  const toggleAll = () => {
    const next = {};
    Object.keys(openModules).forEach((k) => { next[k] = !allOpen; });
    setOpenModules(next);
  };
  const toggleModule = (key) =>
    setOpenModules((prev) => ({ ...prev, [key]: !prev[key] }));

  const visibleBatches = course.batches?.filter((b) => b.status !== 'cancelled') ?? [];

  return (
    <main>
      {/* [A] Hero */}
      <section className="bg-9e-navy px-4 py-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-9e-lime">
              Masterclass
            </span>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white lg:text-4xl">
              {course.title_th}
            </h1>
            {course.subtitle_th && (
              <p className="mt-3 text-base text-9e-air">{course.subtitle_th}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: <Wrench size={12} />, label: 'Workshop' },
                { icon: <Award size={12} />, label: 'e-Certificate' },
                { icon: null, label: LEVEL_MAP[course.level] ?? course.level },
              ].filter((t) => t.label).map(({ icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80"
                >
                  {icon}
                  {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('batch-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-8 rounded-full bg-9e-action px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
            >
              ลงทะเบียน
            </button>
          </div>
          <div>
            {course.cover_image_url ? (
              <div className="relative aspect-video overflow-hidden rounded-2xl shadow-9e-xl">
                <Image
                  src={course.cover_image_url}
                  alt={course.title_th}
                  fill
                  className="object-cover"
                  sizes="(max-width:1024px) 100vw, 50vw"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-9e-brand to-9e-action shadow-9e-xl" />
            )}
          </div>
        </div>
      </section>

      {/* [B] Stats bar */}
      <section className="border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-9e-card">
        <div className="max-w-6xl mx-auto flex divide-x divide-gray-200 dark:divide-gray-700">
          {[
            {
              main: `${course.duration_days} Day${course.duration_days > 1 ? 's' : ''}`,
              sub: 'INTENSIVE',
              action: null,
            },
            {
              main: `${visibleBatches[0]?.capacity ?? 50} Participants`,
              sub: 'MAX CAPACITY',
              action: null,
            },
            {
              main: null,
              sub: 'COURSE OUTLINE',
              action: (
                <a
                  href="#"
                  className="flex items-center gap-2 rounded-full bg-9e-action px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
                >
                  <Download size={15} /> Download
                </a>
              ),
            },
          ].map(({ main, sub, action }, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1 py-6">
              {action ?? (
                <span className="text-2xl font-bold text-9e-navy dark:text-white">{main}</span>
              )}
              <span className="text-[10px] uppercase tracking-wider text-gray-400">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* [C] Description */}
      {course.description_html && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <div
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: course.description_html }}
          />
        </section>
      )}

      {/* [D] Batch section */}
      {visibleBatches.length > 0 && (
        <section id="batch-section" className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="mb-6 text-xl font-bold text-9e-navy dark:text-white">
            รุ่นที่เปิดรับสมัครและราคา
          </h2>
          {visibleBatches.map((batch) => (
            <div
              key={batch._id}
              className={`relative mb-4 rounded-2xl border-2 border-gray-200 p-6 dark:border-gray-700 ${batch.is_early_bird ? 'pt-10' : ''}`}
            >
              {batch.is_early_bird && (
                <span className="absolute left-4 top-4 rounded-full bg-9e-lime px-3 py-1 text-xs font-bold text-9e-navy">
                  Early Bird
                </span>
              )}
              <p className="text-lg font-bold text-9e-navy dark:text-white">
                {batch.batch_label || `รุ่นที่ ${batch.batch_no}`}
              </p>
              {batch.dates?.[0]?.day_label && (
                <p className="text-2xl font-bold text-9e-navy dark:text-white">
                  {batch.dates[0].day_label}
                </p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {course.time_start} – {course.time_end} น.{batch.venue_name ? ` · ${batch.venue_name}` : ''}
              </p>
              {batch.is_early_bird && batch.early_bird_deadline && (
                <CountdownTimer deadline={batch.early_bird_deadline} className="mt-4" />
              )}
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <span className="text-3xl font-bold text-9e-action">
                    {batch.effective_price?.toLocaleString('th-TH')} บาท
                  </span>
                  {batch.is_early_bird && (
                    <p className="text-sm text-gray-400 line-through">
                      {batch.original_price?.toLocaleString('th-TH')} บาท
                    </p>
                  )}
                </div>
                {batch.status === 'open' ? (
                  <Link
                    href={`/masterclass/${course.slug}/register?batch=${batch._id}`}
                    className="rounded-full bg-9e-action px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
                  >
                    ลงทะเบียน
                  </Link>
                ) : (
                  <button
                    disabled
                    className="cursor-not-allowed rounded-full bg-gray-200 px-6 py-3 text-sm font-medium text-gray-400 dark:bg-gray-700"
                  >
                    {batch.status === 'full' ? 'เต็มแล้ว' : 'ปิดรับสมัครแล้ว'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* [E] Objectives */}
      {course.objectives?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="text-xl font-bold text-9e-navy dark:text-white">วัตถุประสงค์</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {course.objectives.map((obj, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-700"
              >
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-9e-brand" />
                <p className="text-sm text-gray-700 dark:text-gray-200">{obj}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* [F] Suitable for */}
      {course.suitable_for?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="text-xl font-bold text-9e-navy dark:text-white">หลักสูตรนี้เหมาะสำหรับ</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {course.suitable_for.map((label, i) => {
              const Icon = SUITABLE_ICONS[i % SUITABLE_ICONS.length];
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 rounded-xl bg-[#0f2a3f] p-5 text-center dark:bg-[#0a1e2e]"
                >
                  <Icon size={28} className="text-9e-brand" />
                  <span className="text-sm font-medium text-white">{label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* [G] Prerequisites */}
      {course.prerequisites?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="border-l-4 border-9e-lime pl-4 text-xl font-bold text-9e-navy dark:text-white">
            พื้นฐานของผู้เข้าอบรม
          </h2>
          <ol className="mt-4 list-inside list-decimal space-y-3">
            {course.prerequisites.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                {item}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* [H] System Requirements */}
      {course.system_requirements && (
        (() => {
          const sr = course.system_requirements;
          const sections = [
            { label: 'ระบบปฏิบัติการ', items: sr.os },
            { label: 'Web Browser', items: sr.browsers },
            { label: 'บัญชีที่ต้องใช้', items: sr.accounts },
            { label: 'โปรแกรมที่ต้องติดตั้ง', items: sr.software },
          ].filter((s) => s.items?.length > 0);
          if (!sections.length) return null;
          return (
            <section className="max-w-4xl mx-auto px-4 py-10">
              <h2 className="text-xl font-bold text-9e-navy dark:text-white">ความต้องการของระบบ</h2>
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {sections.map(({ label, items }) => (
                  <div key={label}>
                    <p className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">{label}</p>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                          <CheckCircle size={14} className="mt-0.5 shrink-0 text-9e-brand" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })()
      )}

      {/* [I] Benefits */}
      {course.benefits?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="border-l-4 border-9e-lime pl-4 text-xl font-bold text-9e-navy dark:text-white">
            ประโยชน์ที่จะได้รับ
          </h2>
          <ol className="mt-4 list-inside list-decimal space-y-3">
            {course.benefits.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                {item}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* [J] Curriculum */}
      {course.curriculum?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">หัวข้อการฝึกอบรม</h2>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm text-9e-action hover:underline"
            >
              {allOpen ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
            </button>
          </div>
          {course.curriculum.map((session, si) => (
            <div key={si}>
              <p className="mb-3 mt-8 text-xs font-semibold uppercase tracking-widest text-9e-action">
                {session.session_label}
              </p>
              {session.modules?.map((mod, mi) => {
                const key = `${si}-${mi}`;
                const isOpen = openModules[key] ?? true;
                return (
                  <div
                    key={mi}
                    className="mb-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <button
                      type="button"
                      onClick={() => toggleModule(key)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <span className="font-semibold text-9e-navy dark:text-white">
                        {mod.module_no}. {mod.title}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[800px]' : 'max-h-0'}`}
                    >
                      <div className="px-5 pb-5">
                        {mod.topics?.length > 0 && (
                          <ul className="mt-1 space-y-1.5">
                            {mod.topics.map((topic, ti) => (
                              <li key={ti} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-9e-brand" />
                                {topic}
                              </li>
                            ))}
                          </ul>
                        )}
                        {mod.workshop && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-9e-lime/30 bg-9e-lime/10 p-3">
                            <FlaskConical size={14} className="mt-0.5 shrink-0 text-9e-lime" />
                            <p className="text-sm text-gray-700 dark:text-gray-200">
                              <strong>Workshop: </strong>{mod.workshop}
                            </p>
                          </div>
                        )}
                        {mod.output && (
                          <p className="mt-2 text-xs text-gray-400">
                            <strong>ผลลัพธ์: </strong>{mod.output}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}

      {/* [K] Instructor */}
      {instructors.length > 0 && (
        <section className="bg-9e-navy px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-9e-lime">
              INSTRUCTOR
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white">วิทยากรผู้สอน</h2>
            <p className="mt-2 text-sm text-9e-air">
              ผู้เชี่ยวชาญประสบการณ์สอนมากกว่า 20 ปี ทั้งภาครัฐและภาคเอกชน
            </p>
            <div
              className={`mt-10 grid gap-6 ${
                instructors.length === 1
                  ? 'mx-auto max-w-xs'
                  : 'mx-auto max-w-2xl grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {instructors.map((inst) => (
                <div key={inst._id} className="overflow-hidden rounded-2xl bg-[#0f2a3f]">
                  {inst.image_url && (
                    <div className="relative aspect-square">
                      <Image
                        src={inst.image_url}
                        alt={inst.name}
                        fill
                        className="object-cover"
                        sizes="300px"
                      />
                    </div>
                  )}
                  <div className="p-5 text-left">
                    <p className="font-bold text-white">{inst.name}</p>
                    <p className="mt-0.5 text-sm text-9e-action">{inst.title}</p>
                    {inst.specialties?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {inst.specialties.map((s) => (
                          <li key={s} className="flex items-start gap-2 text-xs text-9e-air">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-9e-lime" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* [L] FAQ */}
      {faqs.length > 0 && (
        <section className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-bold text-9e-navy dark:text-white">
            คำถามที่พบบ่อย
          </h2>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {faqs.map((f) => (
              <FaqAccordionItem key={f._id} faq={f} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
