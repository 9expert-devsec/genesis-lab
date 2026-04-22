'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * 9Expert Logo.
 *
 * By default the variant follows the active theme:
 *   - light → Full Blue   (/brand/logo-blue.png)
 *   - dark  → Blue & White (/brand/logo-white.png)
 *
 * Pass an explicit `variant` to override (e.g., 'navy' on a lime banner,
 * 'blue' on a login card that's always light).
 *
 * Files in /public/brand/ (copied from 9Expert_CI.zip):
 *   - `white` → Blue & White logo
 *   - `blue`  → Full Blue logo
 *   - `navy`  → Dark Navy logo
 */
const VARIANT_SRC = {
  white: '/brand/logo-white.png',
  blue:  '/brand/logo-blue.png',
  navy:  '/brand/logo-navy.png',
};

export function Logo({
  variant,
  href = '/',
  className,
  priority = false,
  alt = '9Expert Training',
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Until mounted, pick the light-mode variant to match our default theme
  // — avoids a flash of the wrong-themed logo on first paint.
  const themeVariant = mounted && resolvedTheme === 'dark' ? 'white' : 'blue';
  const src = VARIANT_SRC[variant] ?? VARIANT_SRC[themeVariant];

  const img = (
    <Image
      src={src}
      alt={alt}
      width={600}
      height={160}
      priority={priority}
      sizes="(max-width: 768px) 140px, 180px"
      className={cn('h-10 md:h-12 w-auto object-contain', className)}
    />
  );

  if (!href) return img;

  return (
    <Link
      href={href}
      className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-brand rounded-9e-sm"
      aria-label={alt}
    >
      {img}
    </Link>
  );
}
