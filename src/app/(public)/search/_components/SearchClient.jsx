'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Sparkles,
  Map,
  Tag,
} from 'lucide-react';
import { courseHref, careerPathHref } from '@/lib/utils';

// ── Local re-implementations from ScheduleClient (not exported) ────
const MONTH_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const STATUS_STYLE = {
  open:        { dot: 'bg-[#39b980]', text: 'text-[#39b980]', label: 'รับสมัคร' },
  nearly_full: { dot: 'bg-[#ffc94a]', text: 'text-[#d4a017]', label: 'ใกล้เต็ม' },
  full:        { dot: 'bg-[#ff4b55]', text: 'text-[#ff4b55]', label: 'เต็ม' },
};

const TYPE_COLOR = {
  classroom: '#00CCFF',
  hybrid:    '#8B5CF6',
  online:    '#22C55E',
};

const TYPE_LABEL = {
  classroom: 'Classroom',
  hybrid:    'Hybrid',
  online:    'Online',
};

function formatDateLabel(scheduleItem) {
  const dates = (scheduleItem?.dates ?? [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (dates.length === 0) return '-';
  const first = dates[0];
  const last  = dates[dates.length - 1];
  const firstM = MONTH_TH[first.getMonth()];
  if (dates.length === 1) {
    return `${first.getDate()} ${firstM} ${first.getFullYear() + 543}`;
  }
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}-${last.getDate()} ${firstM} ${first.getFullYear() + 543}`;
  }
  const lastM = MONTH_TH[last.getMonth()];
  return `${first.getDate()} ${firstM} - ${last.getDate()} ${lastM} ${last.getFullYear() + 543}`;
}

function formatArticleDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Compact Thai-locale date for promo range labels — 2-digit BE year.
function formatPromoDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}

const SUGGESTIONS = ['Excel', 'Python', 'Power BI', 'AI', 'Power Automate', 'SQL'];
const TABS = [
  { key: 'all',           label: 'ทั้งหมด' },
  { key: 'courses',       label: 'หลักสูตร' },
  { key: 'career-paths',  label: 'Career Path' },
  { key: 'schedules',     label: 'ตารางอบรม' },
  { key: 'promotions',    label: 'โปรโมชัน' },
  { key: 'articles',      label: 'บทความ' },
];

// ── Highlight matched substring with brand lime ───────────────────
function highlightText(text, term) {
  if (!term || !text) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark
        key={i}
        className="rounded px-0.5 bg-[#D4F73F] not-italic text-[#0D1B2A]"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// ── Card components ────────────────────────────────────────────────

function CourseResultCard({ course, term }) {
  const id = course.course_id ?? '';
  const href = courseHref(id ? String(id).toLowerCase() : '');
  const programIcon = course.program?.programiconurl;
  const programLabel = course.program?.program_name;
  const price = course.course_price;
  const days  = course.course_trainingdays;

  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8FAFD]">
        {programIcon ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={programIcon}
            alt={programLabel ?? ''}
            className="h-8 w-8 object-contain"
            loading="lazy"
          />
        ) : (
          <GraduationCap className="h-5 w-5 text-[#005CFF]/60" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-sm font-semibold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {highlightText(course.course_name, term)}
        </h3>
        <p className="mt-0.5 font-mono text-xs text-gray-400">
          {highlightText(id, term)}
        </p>
        {programLabel && (
          <p className="text-xs text-gray-500">{programLabel}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            {!price || Number(price) === 0
              ? 'Call .-'
              : `${Number(price).toLocaleString('th-TH')} .-`}
          </span>
          {days ? <span>{days} วัน</span> : null}
        </div>
      </div>

      <span className="hidden shrink-0 self-center text-xs font-semibold text-[#2486FF] sm:inline">
        ดูหลักสูตร →
      </span>
    </Link>
  );
}

function ScheduleResultRow({ schedule, course, term }) {
  const courseName = course?.course_name ?? schedule.course_name ?? '(ไม่ทราบชื่อหลักสูตร)';
  const type = schedule.type ?? 'classroom';
  const status = STATUS_STYLE[schedule.status] ?? STATUS_STYLE.open;
  const typeColor = TYPE_COLOR[type] ?? TYPE_COLOR.classroom;
  const typeLabel = TYPE_LABEL[type] ?? type;
  const price = course?.course_price;

  // Prefer internal registration page when we can (mirrors ScheduleCell logic).
  const courseId = course?.course_id;
  const internalHref =
    schedule._id && courseId
      ? `/registration/public?course=${String(courseId).toLowerCase()}&class=${schedule._id}`
      : null;
  const href = internalHref ?? schedule.signup_url ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:shadow-md md:flex-row md:items-center md:gap-4">
      <span
        className="inline-flex h-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{ backgroundColor: `${typeColor}1A`, color: typeColor }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: typeColor }} />
          {typeLabel}
      </span>

      <div className="min-w-0 flex-1">
        {courseId ? (
          <Link
            href={courseHref(String(courseId).toLowerCase())}
            className="line-clamp-1 text-sm font-semibold text-[#0D1B2A] hover:text-[#005CFF]"
          >
            {highlightText(courseName, term)}
          </Link>
        ) : (
          <span className="line-clamp-1 text-sm font-semibold text-[#0D1B2A]">
            {highlightText(courseName, term)}
          </span>
        )}
        <p className="mt-0.5 text-xs text-gray-500">{formatDateLabel(schedule)}</p>
      </div>

      <span
        className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${status.text}`}
      >
        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
        {status.label}
      </span>

      <span className="shrink-0 text-sm font-bold text-[#0D1B2A]">
        {!price || Number(price) === 0
          ? 'Call .-'
          : `${Number(price).toLocaleString('th-TH')} .-`}
      </span>

      {href ? (
        href.startsWith('/') ? (
          <Link
            href={href}
            className="shrink-0 rounded-9e-md bg-[#005CFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0046cc]"
          >
            สมัครเรียน →
          </Link>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-9e-md bg-[#005CFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0046cc]"
          >
            สมัครเรียน →
          </a>
        )
      ) : null}
    </div>
  );
}

function CareerPathResultCard({ careerPath, term }) {
  const slug = careerPath.api_slug ?? careerPath.slug ?? '';
  const href = careerPathHref(slug);
  // Cache stores the upstream `coverImage.url` as `hero_image_url`; fall
  // back to `icon_url` so this card also works against the raw API shape.
  const icon = careerPath.icon_url || careerPath.hero_image_url;

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#E8F0FE]">
        {icon ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={icon}
            alt={careerPath.title ?? ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Map className="h-5 w-5 text-[#2486FF]" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-sm font-semibold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {highlightText(careerPath.title, term)}
        </h3>
        {careerPath.short_description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
            {careerPath.short_description}
          </p>
        )}
      </div>

      <span className="hidden shrink-0 self-center text-xs font-semibold text-[#2486FF] sm:inline">
        ดูเส้นทาง →
      </span>
    </Link>
  );
}

function PromotionResultCard({ promotion, term }) {
  const href = promotion.api_slug
    ? `/promotions/${promotion.api_slug}`
    : `/promotions/${promotion.promotion_id}`;
  const startLabel = formatPromoDate(promotion.start_date);
  const endLabel   = formatPromoDate(promotion.end_date);
  const dateLabel =
    startLabel && endLabel ? `${startLabel} – ${endLabel}` : (startLabel || endLabel || null);
  const tags = Array.isArray(promotion.tags) ? promotion.tags : [];

  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-50">
        {promotion.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={promotion.thumbnail_url}
            alt={promotion.image_alt || promotion.title || ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Tag className="h-7 w-7 text-amber-400" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-sm font-semibold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {highlightText(promotion.title, term)}
        </h3>
        {dateLabel && (
          <p className="mt-0.5 text-xs text-gray-500">{dateLabel}</p>
        )}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag, i) => {
              const hasColor = Boolean(tag?.color);
              return (
                <span
                  key={i}
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                    (hasColor ? 'text-white' : 'bg-gray-100 text-gray-600')
                  }
                  style={hasColor ? { backgroundColor: tag.color } : undefined}
                >
                  {tag?.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <span className="hidden shrink-0 self-center text-xs font-semibold text-[#2486FF] sm:inline">
        ดูโปรโมชัน →
      </span>
    </Link>
  );
}

function ArticleResultCard({ article, term }) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {article.coverUrl ? (
          <Image
            src={article.coverUrl}
            alt={article.title ?? ''}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-gray-300">
            <BookOpen className="h-7 w-7" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {highlightText(article.title, term)}
        </h3>
        {article.excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">
            {article.excerpt}
          </p>
        )}
        {article.publishedAt && (
          <p className="mt-2 text-xs text-gray-400">
            {formatArticleDate(article.publishedAt)}
          </p>
        )}
      </div>
    </Link>
  );
}

// ── Section helpers ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-5 w-5 text-[#005CFF]" aria-hidden="true" />
      <h2 className="text-lg font-bold text-[#0D1B2A]">{title}</h2>
      <span className="inline-flex items-center justify-center rounded-full bg-[#005CFF]/10 px-2 py-0.5 text-xs font-bold text-[#005CFF]">
        {count}
      </span>
    </div>
  );
}

function SectionEmpty({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white py-10 text-gray-400">
      <Icon className="h-8 w-8 text-gray-300" aria-hidden="true" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-20 rounded-xl bg-gray-100" />
      <div className="h-20 rounded-xl bg-gray-100" />
      <div className="h-20 rounded-xl bg-gray-100" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function SearchClient({
  courses,
  schedules,
  articles,
  courseMap,
  careerPaths = [],
  promotions = [],
  initialQ,
}) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(false);

  // Auto-focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce + URL sync. 200ms ≈ feels instant but cheap to compute.
  useEffect(() => {
    if (q === debouncedQ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setLoading(false);
      const next = q.trim()
        ? `/search?q=${encodeURIComponent(q.trim())}`
        : '/search';
      router.replace(next, { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [q, debouncedQ, router]);

  const term = debouncedQ.toLowerCase().trim();
  const minChars = 2;
  const isSearching = term.length >= minChars;

  const matchedCourses = useMemo(() => {
    if (!isSearching) return [];
    return courses.filter((c) =>
      (c.course_name ?? '').toLowerCase().includes(term) ||
      (c.course_id ?? '').toLowerCase().includes(term) ||
      (c.program?.program_name ?? '').toLowerCase().includes(term)
    );
  }, [isSearching, courses, term]);

  const matchedSchedules = useMemo(() => {
    if (!isSearching) return [];
    return schedules.filter((s) => {
      const c = courseMap[String(s.course?._id ?? s.course ?? '')];
      const name = c?.course_name ?? s.course_name ?? '';
      return name.toLowerCase().includes(term);
    });
  }, [isSearching, schedules, courseMap, term]);

  const matchedArticles = useMemo(() => {
    if (!isSearching) return [];
    return articles.filter((a) => {
      const inTitle   = (a.title ?? '').toLowerCase().includes(term);
      const inExcerpt = (a.excerpt ?? '').toLowerCase().includes(term);
      const inTags    = Array.isArray(a.tags)
        && a.tags.some((t) => (t ?? '').toLowerCase().includes(term));
      return inTitle || inExcerpt || inTags;
    });
  }, [isSearching, articles, term]);

  const matchedCareerPaths = useMemo(() => {
    if (!isSearching) return [];
    return careerPaths.filter((cp) =>
      (cp.title ?? '').toLowerCase().includes(term) ||
      (cp.short_description ?? '').toLowerCase().includes(term)
    );
  }, [isSearching, careerPaths, term]);

  const matchedPromotions = useMemo(() => {
    if (!isSearching) return [];
    return promotions.filter((p) => {
      const inTitle  = (p.title ?? '').toLowerCase().includes(term);
      const inDetail = (p.detail_plain ?? '').toLowerCase().includes(term);
      const inTags   = Array.isArray(p.tags)
        && p.tags.some((t) => (t?.label ?? '').toLowerCase().includes(term));
      return inTitle || inDetail || inTags;
    });
  }, [isSearching, promotions, term]);

  const totalCount =
    matchedCourses.length +
    matchedCareerPaths.length +
    matchedSchedules.length +
    matchedPromotions.length +
    matchedArticles.length;

  function clearQuery() {
    setQ('');
    inputRef.current?.focus();
  }

  function handleSuggestionClick(value) {
    setQ(value);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      // Force the debounce to flush immediately for keyboard users.
      setDebouncedQ(q);
      setLoading(false);
    }
  }

  const showCourses     = activeTab === 'all' || activeTab === 'courses';
  const showCareerPaths = activeTab === 'all' || activeTab === 'career-paths';
  const showSchedules   = activeTab === 'all' || activeTab === 'schedules';
  const showPromotions  = activeTab === 'all' || activeTab === 'promotions';
  const showArticles    = activeTab === 'all' || activeTab === 'articles';
  const isAll           = activeTab === 'all';
  const visibleCourses       = isAll ? matchedCourses.slice(0, 6)      : matchedCourses;
  const visibleCareerPaths   = isAll ? matchedCareerPaths.slice(0, 4)  : matchedCareerPaths;
  const visibleSchedules     = isAll ? matchedSchedules.slice(0, 4)    : matchedSchedules;
  const visiblePromotions    = isAll ? matchedPromotions.slice(0, 3)   : matchedPromotions;
  const visibleArticles      = isAll ? matchedArticles.slice(0, 3)     : matchedArticles;

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      {/* Hero */}
      <section className="bg-[#0D1B2A] py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-3xl font-bold text-white">ค้นหา</h1>
          <p className="mt-1 text-sm text-white/60">
            ค้นหาหลักสูตร บทความ และตารางอบรมที่ 9Expert
          </p>

          <div className="mx-auto mt-8 flex h-14 w-full max-w-2xl items-center gap-3 rounded-2xl bg-white px-5 shadow-lg">
            <Search className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหาหลักสูตร, บทความ, รอบอบรม…"
              aria-label="ค้นหา"
              className="h-full w-full bg-transparent text-lg text-[#0D1B2A] placeholder:text-gray-400 focus:outline-none"
            />
            {q.length > 0 && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="ล้างคำค้นหา"
                className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#0D1B2A]"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <div className="mx-auto max-w-6xl px-4 py-10">
        {!isSearching ? (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-gray-500">ลองค้นหา</p>
            <p className="mt-1 text-sm text-gray-400">
              พิมพ์อย่างน้อย {minChars} ตัวอักษร หรือเลือกจากคำค้นยอดนิยมด้านล่าง
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-[#0D1B2A] transition-colors hover:bg-[#F8FAFD] hover:border-[#005CFF]/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Summary + tabs */}
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-500">
                ผลการค้นหา{' '}
                <span className="font-semibold text-[#0D1B2A]">
                  &ldquo;{debouncedQ}&rdquo;
                </span>{' '}
                — พบ{' '}
                <span className="font-bold text-[#005CFF]">{totalCount}</span>{' '}
                รายการ
              </p>
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => {
                  const count =
                    t.key === 'all'           ? totalCount :
                    t.key === 'courses'       ? matchedCourses.length :
                    t.key === 'career-paths'  ? matchedCareerPaths.length :
                    t.key === 'schedules'     ? matchedSchedules.length :
                    t.key === 'promotions'    ? matchedPromotions.length :
                                                matchedArticles.length;
                  const active = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={
                        'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ' +
                        (active
                          ? 'bg-[#005CFF] text-white shadow-sm'
                          : 'border border-gray-200 bg-white text-[#0D1B2A] hover:border-[#005CFF]/40')
                      }
                    >
                      {t.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <ResultsSkeleton />
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Search className="h-10 w-10 text-gray-300" aria-hidden="true" />
                <p className="text-base font-semibold text-gray-500">
                  ไม่พบผลลัพธ์สำหรับ &ldquo;{debouncedQ}&rdquo;
                </p>
                <p className="text-sm text-gray-400">ลองใช้คำค้นหาอื่น</p>
              </div>
            ) : (
              <div className="space-y-10">
                {showCourses && (
                  <section role="region" aria-label="ผลการค้นหา: หลักสูตร">
                    <SectionHeader
                      icon={GraduationCap}
                      title="หลักสูตร"
                      count={matchedCourses.length}
                    />
                    {matchedCourses.length === 0 ? (
                      <SectionEmpty
                        icon={Search}
                        message={`ไม่พบหลักสูตรที่ตรงกับ "${debouncedQ}"`}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {visibleCourses.map((c) => (
                            <CourseResultCard
                              key={c._id ?? c.course_id}
                              course={c}
                              term={debouncedQ}
                            />
                          ))}
                        </div>
                        {isAll && matchedCourses.length > visibleCourses.length && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('courses')}
                            className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline"
                          >
                            ดูทั้งหมด ({matchedCourses.length}) →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}

                {showCareerPaths && (
                  <section role="region" aria-label="ผลการค้นหา: Career Path">
                    <SectionHeader
                      icon={Map}
                      title="Career Path"
                      count={matchedCareerPaths.length}
                    />
                    {matchedCareerPaths.length === 0 ? (
                      <SectionEmpty
                        icon={Map}
                        message={`ไม่พบ Career Path ที่ตรงกับ "${debouncedQ}"`}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {visibleCareerPaths.map((cp) => (
                            <CareerPathResultCard
                              key={cp.career_path_id ?? cp._id ?? cp.api_slug ?? cp.slug}
                              careerPath={cp}
                              term={debouncedQ}
                            />
                          ))}
                        </div>
                        {isAll && matchedCareerPaths.length > visibleCareerPaths.length && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('career-paths')}
                            className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline"
                          >
                            ดูทั้งหมด ({matchedCareerPaths.length}) →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}

                {showSchedules && (
                  <section role="region" aria-label="ผลการค้นหา: ตารางอบรม">
                    <SectionHeader
                      icon={CalendarDays}
                      title="ตารางอบรมที่กำลังเปิดรับสมัคร"
                      count={matchedSchedules.length}
                    />
                    {matchedSchedules.length === 0 ? (
                      <SectionEmpty
                        icon={Search}
                        message={`ไม่พบรอบอบรมที่ตรงกับ "${debouncedQ}"`}
                      />
                    ) : (
                      <>
                        <div className="space-y-3">
                          {visibleSchedules.map((s, i) => (
                            <ScheduleResultRow
                              key={s._id ?? i}
                              schedule={s}
                              course={courseMap[String(s.course?._id ?? s.course ?? '')]}
                              term={debouncedQ}
                            />
                          ))}
                        </div>
                        {isAll && matchedSchedules.length > visibleSchedules.length && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('schedules')}
                            className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline"
                          >
                            ดูทั้งหมด ({matchedSchedules.length}) →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}

                {showPromotions && (
                  <section role="region" aria-label="ผลการค้นหา: โปรโมชัน">
                    <div className="mb-4 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-amber-500" aria-hidden="true" />
                      <h2 className="text-lg font-bold text-[#0D1B2A]">โปรโมชัน</h2>
                      <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        {matchedPromotions.length}
                      </span>
                    </div>
                    {matchedPromotions.length === 0 ? (
                      <SectionEmpty
                        icon={Tag}
                        message={`ไม่พบโปรโมชันที่ตรงกับ "${debouncedQ}"`}
                      />
                    ) : (
                      <>
                        <div className="space-y-3">
                          {visiblePromotions.map((p) => (
                            <PromotionResultCard
                              key={p.promotion_id ?? p._id ?? p.api_slug}
                              promotion={p}
                              term={debouncedQ}
                            />
                          ))}
                        </div>
                        {isAll && matchedPromotions.length > visiblePromotions.length && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('promotions')}
                            className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline"
                          >
                            ดูทั้งหมด ({matchedPromotions.length}) →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}

                {showArticles && (
                  <section role="region" aria-label="ผลการค้นหา: บทความ">
                    <SectionHeader
                      icon={BookOpen}
                      title="บทความ"
                      count={matchedArticles.length}
                    />
                    {matchedArticles.length === 0 ? (
                      <SectionEmpty
                        icon={Search}
                        message={`ไม่พบบทความที่ตรงกับ "${debouncedQ}"`}
                      />
                    ) : (
                      <>
                        <div className="space-y-3">
                          {visibleArticles.map((a) => (
                            <ArticleResultCard
                              key={a.slug ?? a._id}
                              article={a}
                              term={debouncedQ}
                            />
                          ))}
                        </div>
                        {isAll && matchedArticles.length > visibleArticles.length && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('articles')}
                            className="mt-4 text-sm font-semibold text-[#2486FF] hover:underline"
                          >
                            ดูทั้งหมด ({matchedArticles.length}) →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}