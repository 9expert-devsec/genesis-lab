import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card primitives — Shadcn-style composable blocks.
 * Baseline styling assumes dark-mode-first (navy page bg, card bg is #132638).
 */

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-9e-lg border border-9e-border bg-9e-card',
        'shadow-9e-sm transition-all duration-9e-micro ease-9e',
        className
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-6 pb-3', className)} {...props} />;
});

export const CardTitle = forwardRef(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn('text-xl font-bold text-9e-ice leading-tight', className)}
      {...props}
    />
  );
});

export const CardDescription = forwardRef(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-9e-slate mt-1', className)}
      {...props}
    />
  );
});

export const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-6 pt-3', className)} {...props} />;
});

export const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  );
});
