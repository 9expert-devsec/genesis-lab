import Link from 'next/link';
import { AlertTriangle, Search } from 'lucide-react';
import { CourseCard } from '@/components/course/CourseCard';
import { listPublicCourses } from '@/lib/api/public-courses';
import { skills } from '@/config/site';
import { cn } from '@/lib/utils';

export const metadata = { title: 'หลักสูตรทั้งหมด' };

export default async function Page({ searchParams }) {
  const resolvedParams = (await searchParams) ?? {};
  const skillSlug = typeof resolvedParams.skill === 'string' ? resolvedParams.skill : null;

  let items = [];
  let fetchError = null;

  try {
    const result = await listPublicCourses();
    items = result.items;
  } catch (err) {
    console.error('[training-course]', err);
    fetchError = err.message;
  }

  // Client-side skill filter (temporary — replace with upstream filter
  // once /api/ai/skills is curl-verified in Phase 2.2)
  if (skillSlug && items.length) {
    // TODO(phase-2.2): replace with upstream skill-ID filter
    // For now we don't filter, because upstream skill IDs don't match
    // our UI slugs. Showing all courses until the mapping is resolved.
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 lg:px-6 lg:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
          หลักสูตรทั้งหมด
        </h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--text-secondary)]">
          หลักสูตรอบรม Public Class ทั้งหมดของ 9Expert Training — Power Platform, Data, AI,
          Programming, Business และอื่นๆ
        </p>
      </header>

      <SkillFilter active={skillSlug} />

      {fetchError ? (
        <ErrorState message={fetchError} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <CourseGrid items={items} />
      )}
    </div>
  );
}

function SkillFilter({ active }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2" aria-label="Skill filter">
      <FilterChip href="/training-course" isActive={!active}>
        ทั้งหมด
      </FilterChip>
      {skills.map((s) => (
        <FilterChip
          key={s.slug}
          href={`/training-course?skill=${s.slug}`}
          isActive={active === s.slug}
        >
          {s.label}
        </FilterChip>
      ))}
    </nav>
  );
}

function FilterChip({ href, isActive, children }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold',
        'transition-all duration-9e-micro ease-9e',
        isActive
          ? 'border-9e-brand bg-9e-brand text-9e-ice'
          : 'border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-9e-brand hover:text-9e-brand'
      )}
    >
      {children}
    </Link>
  );
}

function CourseGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <CourseCard key={item._id ?? item.course_id} course={item} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]">
        <Search className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.75} />
      </div>
      <p className="text-base font-semibold text-[var(--text-primary)]">
        ไม่พบหลักสูตรที่ตรงกับเงื่อนไข
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        ลองเลือกหมวดหมู่อื่น หรือกลับไปดูหลักสูตรทั้งหมด
      </p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-9e-accent/10">
        <AlertTriangle className="h-5 w-5 text-9e-accent" strokeWidth={1.75} />
      </div>
      <p className="text-base font-semibold text-[var(--text-primary)]">
        โหลดข้อมูลไม่สำเร็จ
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        กรุณาลองใหม่อีกครั้ง หรือติดต่อเราหากปัญหายังคงอยู่
      </p>
      {process.env.NODE_ENV !== 'production' && message && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded bg-[var(--surface-muted)] p-3 text-left text-xs text-[var(--text-secondary)]">
          {message}
        </pre>
      )}
    </div>
  );
}
