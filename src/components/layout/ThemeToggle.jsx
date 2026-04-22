'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pill switch that flips between light and dark themes.
 * Mounted guard avoids a hydration mismatch — on the server we don't know
 * what the user picked last, so we render a neutral placeholder first render.
 */
export function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render a placeholder styled like the light-mode track (sky/40 on
    // sky/50 border). Matches the post-mount appearance for the default
    // light theme — no flash on the first render for most visitors.
    // Returning dark-mode users see a brief flip on hydration (same
    // category as the Logo variant flip we already accept).
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-7 w-12 rounded-full border border-9e-sky/50 bg-9e-sky/40',
          className
        )}
      />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-9e-micro ease-9e',
        isDark
          ? 'bg-9e-navy border-9e-border'
          : 'bg-9e-sky/40 border-9e-sky/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]',
        className
      )}
    >
      <span
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-9e-sm transition-transform duration-9e-micro ease-9e',
          isDark ? 'translate-x-6' : 'translate-x-1'
        )}
      >
        {isDark ? (
          <Moon className="h-3 w-3 text-9e-navy" strokeWidth={2} />
        ) : (
          <Sun className="h-3 w-3 text-9e-primary" strokeWidth={2} />
        )}
      </span>
    </button>
  );
}
