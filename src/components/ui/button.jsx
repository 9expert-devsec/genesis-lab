'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button — the primary interactive element.
 *
 * Variants map to the CI guide:
 *   - `cta`       Lime on Navy — the signature 9Expert button (default)
 *   - `primary`   Brand blue fill — for less critical primary actions
 *   - `outline`   Bordered, transparent fill — secondary
 *   - `ghost`     No border/fill, hover subtle — tertiary
 *   - `link`      Inline text link, brand blue
 *
 * Sizes: sm (compact), md (default), lg (hero).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-en font-semibold ' +
    'rounded-9e-xl transition-all duration-9e-micro ease-9e ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-brand ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-9e-navy ' +
    'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap',
  {
    variants: {
      variant: {
        cta:
          'bg-9e-lime text-9e-navy ' +
          'hover:bg-9e-lime-lt hover:-translate-y-[2px] hover:shadow-9e-md ' +
          'active:bg-9e-lime-dk active:translate-y-0',
        primary:
          'bg-9e-brand text-9e-ice ' +
          'hover:bg-9e-action hover:-translate-y-[2px] hover:shadow-9e-md',
        outline:
          'border border-9e-brand text-9e-brand bg-transparent ' +
          'hover:bg-9e-brand hover:text-9e-ice hover:-translate-y-[2px]',
        ghost:
          'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
        link:
          'text-9e-brand underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-9  px-4 text-sm',
        md: 'h-11 px-6 text-base',
        lg: 'h-14 px-8 text-lg',
      },
    },
    defaultVariants: {
      variant: 'cta',
      size:    'md',
    },
  }
);

export const Button = forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
