import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Checkbox — native input styled to match the CI. We intentionally
 * avoid @radix-ui/react-checkbox to keep deps minimal; the form layer
 * (react-hook-form) works fine with plain <input type="checkbox">.
 */
export const Checkbox = forwardRef(function Checkbox(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border border-[var(--surface-border)] bg-[var(--surface)]',
        'accent-9e-brand text-9e-brand',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-brand focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
