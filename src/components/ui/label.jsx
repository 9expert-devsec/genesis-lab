import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Label = forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium text-[var(--text-primary)]',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
});
