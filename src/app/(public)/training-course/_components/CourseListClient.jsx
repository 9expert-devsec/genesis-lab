'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { findSkillBySlug } from '@/config/site';
import { HeroSearch } from './HeroSearch';
import { FilterBar } from './FilterBar';
import { ViewToggle } from './ViewToggle';
import { CourseCardGroup } from './CourseCardGroup';
import { CourseTableGroup } from './CourseTableGroup';
import { EmptyState } from './EmptyState';

/**
 * Client-side list view for /training-course.
 *
 * Owns all interactive state:
 *  - search text (local only; search terms are noisy for URL history)
 *  - skill + program filters (synced to URL via router.replace so deep-
 *    linked filters survive a refresh and the back button stays clean)
 *  - view mode card|table (synced to URL)
 *
 * Filtering is client-side over the full items array passed from the
 * server page — the list endpoint returns ~73 courses, well within the
 * size where client-side filter is simpler than refetching.
 */
export function CourseListClient({ items, programOrder = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialSkill = searchParams.get('skill');
  const initialProgram = searchParams.get('program');
  const initialView = searchParams.get('view') === 'table' ? 'table' : 'card';

  const [search, setSearch] = useState('');
  const [skillSlug, setSkillSlug] = useState(initialSkill);
  const [programName, setProgramName] = useState(initialProgram);
  const [view, setView] = useState(initialView);

  // Keep URL in sync whenever a persisted filter changes. Only the three
  // persisted keys are written; anything else on the query string is
  // preserved.
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    setOrDelete(next, 'skill', skillSlug);
    setOrDelete(next, 'program', programName);
    setOrDelete(next, 'view', view === 'table' ? 'table' : null);

    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target !== current) {
      router.replace(target, { scroll: false });
    }
  }, [skillSlug, programName, view, pathname, router, searchParams]);

  // Program → admin-set rank lookup. Programs not in the order map
  // fall to the bottom (sorted alphabetically among themselves).
  const programRank = useMemo(() => {
    const map = new Map();
    programOrder.forEach((name, idx) => map.set(name, idx));
    return map;
  }, [programOrder]);

  // Distinct program list for the select. Sort by admin-set order
  // first; everything outside the order map falls to the bottom and
  // sorts alphabetically among itself.
  const programOptions = useMemo(() => {
    const distinct = Array.from(
      new Set(items.map((c) => c?.program?.program_name).filter(Boolean))
    );
    return distinct.sort((a, b) => {
      const ra = programRank.has(a) ? programRank.get(a) : Infinity;
      const rb = programRank.has(b) ? programRank.get(b) : Infinity;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'th');
    });
  }, [items, programRank]);

  const skillIdForSlug = useMemo(() => {
    const s = skillSlug ? findSkillBySlug(skillSlug) : null;
    return s?.upstreamId ?? null;
  }, [skillSlug]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (q) {
        const name = String(c.course_name ?? '').toLowerCase();
        const code = String(c.course_id ?? '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      if (skillIdForSlug) {
        const ids = Array.isArray(c.skills) ? c.skills : [];
        if (!ids.includes(skillIdForSlug)) return false;
      }
      if (programName) {
        if (c.program?.program_name !== programName) return false;
      }
      return true;
    });
  }, [items, search, skillIdForSlug, programName]);

  // Group by program name, then sort groups by the admin-set order so
  // the page hierarchy mirrors the same sequence as the home page and
  // the filter dropdown.
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = c?.program?.program_name ?? 'อื่นๆ';
      if (!map.has(key)) {
        map.set(key, { program: c.program, courses: [] });
      }
      map.get(key).courses.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      const an = a.program?.program_name ?? 'อื่นๆ';
      const bn = b.program?.program_name ?? 'อื่นๆ';
      const ra = programRank.has(an) ? programRank.get(an) : Infinity;
      const rb = programRank.has(bn) ? programRank.get(bn) : Infinity;
      if (ra !== rb) return ra - rb;
      return an.localeCompare(bn, 'th');
    });
  }, [filtered, programRank]);

  const handleSearch = useCallback((v) => setSearch(v), []);

  return (
    <div className="min-h-screen bg-9e-ice pb-16 dark:bg-9e-border">
      <HeroSearch onDebouncedChange={handleSearch} />

      <FilterBar
        skillSlug={skillSlug}
        onSkillChange={(v) => setSkillSlug(v)}
        programName={programName}
        onProgramChange={(v) => setProgramName(v)}
        programOptions={programOptions}
      />

      <div className="mx-auto max-w-[1200px] px-4 py-8 lg:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-sm text-9e-slate dark:text-[#94a3b8]">
            ผลลัพธ์การค้นหา{' '}
            <span className="font-bold text-9e-primary dark:text-9e-sky">
              {filtered.length}
            </span>{' '}
            หลักสูตร
          </p>
          <ViewToggle view={view} onChange={setView} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : view === 'card' ? (
          groups.map((g) => (
            <CourseCardGroup
              key={g.program?._id ?? g.program?.program_name ?? 'other'}
              program={g.program}
              courses={g.courses}
            />
          ))
        ) : (
          groups.map((g) => (
            <CourseTableGroup
              key={g.program?._id ?? g.program?.program_name ?? 'other'}
              program={g.program}
              courses={g.courses}
            />
          ))
        )}
      </div>
    </div>
  );
}

function setOrDelete(params, key, value) {
  if (value) params.set(key, value);
  else params.delete(key);
}
