'use client';

import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ViewToggle({ view, onChange }) {
  return (
    <div className="inline-flex items-center gap-2" role="tablist" aria-label="มุมมอง">
      <ToggleButton
        active={view === 'card'}
        onClick={() => onChange('card')}
        label="มุมมองการ์ด"
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
      </ToggleButton>
      <ToggleButton
        active={view === 'table'}
        onClick={() => onChange('table')}
        label="มุมมองตาราง"
      >
        <Rows3 className="h-4 w-4" strokeWidth={1.75} />
      </ToggleButton>
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
          ? 'bg-9e-primary text-white shadow-9e-sm'
          : 'border border-gray-200 bg-white text-9e-slate hover:border-9e-brand hover:text-9e-brand'
      )}
    >
      {children}
    </button>
  );
}
