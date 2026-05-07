'use client';

import { skills } from '@/config/site';

/**
 * Sticky filter row: Skill + Program selects.
 *
 * Level filter is intentionally omitted — `course_levels` lives on the
 * detail endpoint only (see docs/api-domains.md), and we do not fetch
 * detail per card.
 */
export function FilterBar({
  skillSlug,
  onSkillChange,
  programName,
  onProgramChange,
  programOptions,
}) {
  return (
    <div className="sticky top-20 z-20 border-b border-gray-100 bg-white/90 shadow-sm backdrop-blur dark:border-[#1e3a5f] dark:bg-9e-navy/90">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
        <FilterSelect
          label="ทักษะ"
          value={skillSlug}
          onChange={onSkillChange}
          options={[
            { value: '', label: 'ทักษะทั้งหมด' },
            ...skills.map((s) => ({ value: s.slug, label: s.label })),
          ]}
        />
        <FilterSelect
          label="โปรแกรม"
          value={programName}
          onChange={onProgramChange}
          options={[
            { value: '', label: 'โปรแกรมทั้งหมด' },
            ...programOptions.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
        className="min-w-[160px] cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-9e-navy transition-all duration-9e-micro ease-9e hover:border-9e-brand focus:outline-none focus:ring-2 focus:ring-9e-action/20 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white dark:hover:border-9e-air"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
