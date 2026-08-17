"use client";

import { cn } from "@/lib/utils";

/**
 * Small presentational atoms shared by the masterclass register client and
 * the public registration wizard. Both files carried byte-identical private
 * copies; these are those copies, unchanged.
 */

export function SummaryLine({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

export function MethodRadio({ selected, disabled, onClick, title, subtitle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-9e-lg border p-3 text-left transition-all",
        disabled
          ? "cursor-not-allowed border-[var(--surface-border)] opacity-50"
          : selected
            ? "border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15"
            : "border-[var(--surface-border)] hover:border-9e-brand/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-9e-brand" : "border-[var(--surface-border)]",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-9e-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

export function ChannelCard({ selected, onClick, Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-9e-lg border p-3 text-center transition-all",
        selected
          ? "border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15"
          : "border-[var(--surface-border)] hover:border-9e-brand/40",
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6",
          selected ? "text-9e-brand" : "text-[var(--text-secondary)]",
        )}
      />
      <span className="text-xs font-semibold text-[var(--text-primary)]">
        {label}
      </span>
    </button>
  );
}
