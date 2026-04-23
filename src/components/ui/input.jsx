import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef(function Input(
  { className, type = 'text', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-11 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
        'border-[var(--surface-border)] placeholder:text-[var(--text-muted)]',
        'transition-colors duration-9e-micro ease-9e',
        'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-9e-accent aria-[invalid=true]:focus-visible:ring-9e-accent',
        className
      )}
      {...props}
    />
  );
});
