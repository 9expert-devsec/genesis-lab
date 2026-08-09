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
 *
 * ── WHY RADIUS IS A VARIANT AND NOT PART OF THE BASE ────────────────────────
 * It used to be `rounded-9e-xl` in the base string, which made it impossible to
 * override through `className`. `cn` is twMerge(clsx(…)), and twMerge only
 * drops a conflicting base class when it RECOGNISES the two as the same group.
 * `9e-xl` and `9e-md` are custom scale keys, not stock Tailwind values, so it
 * does not — measured: cn('rounded-9e-xl', 'rounded-9e-md') returns BOTH,
 * where the stock pair cn('rounded-xl','rounded-md') correctly returns one.
 *
 * With both classes in the markup the winner is whichever Tailwind emits last,
 * and it emits this scale ALPHABETICALLY — lg, md, sm, xl — so `9e-xl` always
 * won and every override was silently ignored. That is an accident of how the
 * keys are spelled, not a rule.
 *
 * As a cva variant the radius is composed into ONE class before twMerge ever
 * sees it, so there is no conflict to resolve. `xl` is the default, so every
 * existing Button renders exactly as before.
 *
 * NOTE the general trap this leaves: ANY `rounded-9e-*` passed via className to
 * a cn()-based component still fails to merge. The systemic fix is teaching
 * tailwind-merge the project scale (extendTailwindMerge) in src/lib/utils.js —
 * deliberately not done here, because it changes conflict resolution for every
 * component at once.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-en font-semibold ' +
    'transition-all duration-9e-micro ease-9e ' +
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
          'border border-9e-brand text-9e-action bg-transparent ' +
          'hover:bg-9e-brand hover:text-9e-ice hover:-translate-y-[2px]',
        ghost:
          'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
        link:
          'text-9e-action underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-9  px-4 text-sm',
        md: 'h-11 px-6 text-base',
        lg: 'h-14 px-8 text-lg',
      },
      // From the 9e scale only: sm 8 / md 12 / lg 16 / xl 24. A radius at or
      // above HALF the button's height collapses the shape into a full pill —
      // at size md (44px) that threshold is 22px, so `xl` (24px) is already
      // past it and a two-character label reads as a circle. `md` (12px) is the
      // pick where that matters; see PDFDownload for the reasoning at the call
      // site.
      radius: {
        sm: 'rounded-9e-sm',
        md: 'rounded-9e-md',
        lg: 'rounded-9e-lg',
        xl: 'rounded-9e-xl',
      },
    },
    defaultVariants: {
      variant: 'cta',
      size:    'md',
      radius:  'xl',
    },
  }
);

export const Button = forwardRef(function Button(
  { className, variant, size, radius, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, radius }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
