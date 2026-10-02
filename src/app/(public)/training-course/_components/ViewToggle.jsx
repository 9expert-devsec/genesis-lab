'use client';

import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * /training-course's pair, and the default — so that page's markup is exactly
 * what it was before `options` existed. /schedule passes its own pair
 * (table / list); see ScheduleClient.
 */
const CARD_TABLE = [
  { value: 'card', label: 'มุมมองการ์ด', Icon: LayoutGrid },
  { value: 'table', label: 'มุมมองตาราง', Icon: Rows3 },
];

export function ViewToggle({ view, onChange, options = CARD_TABLE }) {
  return (
    <div className="inline-flex items-center gap-2" role="tablist" aria-label="มุมมอง">
      {options.map(({ value, label, Icon }) => (
        <ToggleButton
          key={value}
          active={view === value}
          onClick={() => onChange(value)}
          label={label}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </ToggleButton>
      ))}
    </div>
  );
}

function ToggleButton({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'rounded-lg p-2 transition-all duration-9e-micro ease-9e',
        active
          ? 'bg-9e-action text-white shadow-9e-sm'
          : 'border border-gray-200 bg-white text-9e-slate-dp-50 hover:border-9e-brand hover:text-9e-action dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-[#94a3b8] dark:hover:border-9e-air dark:hover:text-9e-air'
      )}
    >
      {children}
    </button>
  );
}
