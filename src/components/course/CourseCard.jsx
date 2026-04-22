import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, courseHref, formatDuration, formatPrice } from '@/lib/utils';

/**
 * CourseCard — summary tile for a public course.
 *
 * Consumes the verified upstream shape from /public-course (see
 * docs/api-domains.md). Field names are snake_case; prices may be
 * numbers or numeric strings (formatPrice coerces either).
 *
 * Server Component — no interactivity beyond the link/button, so we
 * keep this render path off the client bundle.
 */
export function CourseCard({ course, className }) {
  if (!course) return null;

  const {
    course_id:           id,
    course_name:         name,
    course_trainingdays: days,
    course_price:        price,
    program,
  } = course;

  const duration = formatDuration(days);
  const href = courseHref(id ? String(id).toLowerCase() : '');
  const icon = program?.programiconurl;
  const programLabel = program?.program_name;

  return (
    <Card
      className={cn(
        'group flex flex-col overflow-hidden p-0',
        'hover:-translate-y-[2px] hover:shadow-9e-md',
        className
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        {(icon || programLabel) && (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {icon && (
              <Image
                src={icon}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded object-contain"
                unoptimized
              />
            )}
            {programLabel && <span>{programLabel}</span>}
          </div>
        )}

        <h3 className="line-clamp-2 min-h-[3rem] text-base font-bold leading-tight text-[var(--text-primary)]">
          {name}
        </h3>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {duration && (
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <Clock className="h-4 w-4" strokeWidth={1.75} />
              {duration}
            </span>
          )}
          <span className="text-right text-base font-bold text-[var(--text-primary)]">
            {formatPrice(price)}
          </span>
        </div>
      </div>

      <div className="border-t border-[var(--surface-border)] p-3">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={href}>ดูรายละเอียด</Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Skeleton state — shape-agnostic; reused for both Phase 2.1 and future
 * real-time filter updates.
 */
export function CourseCardSkeleton({ className }) {
  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden p-0 animate-pulse',
        className
      )}
      aria-hidden
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="h-4 w-24 rounded bg-[var(--surface-muted)]" />
        <div className="h-5 w-full rounded bg-[var(--surface-muted)]" />
        <div className="h-5 w-3/4 rounded bg-[var(--surface-muted)]" />
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="h-4 w-20 rounded bg-[var(--surface-muted)]" />
          <div className="h-4 w-16 rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
      <div className="border-t border-[var(--surface-border)] p-3">
        <div className="h-8 w-full rounded bg-[var(--surface-muted)]" />
      </div>
    </Card>
  );
}
