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
 * ── `white` IS NOT A WHITE LOGO. READ THIS BEFORE USING IT ON DARK ──────────
 * The name is the CI's lockup name — "Blue & White" — not a description of the
 * ink. logo-white.png is 100% #2486FF (--9e-brand) letterforms on
 * transparency, measured pixel by pixel: it has ZERO white pixels in it. The
 * "white" in the CI name refers to the BACKGROUND it was drawn for, so on a
 * dark surface it renders as the blue mark, not as a knockout. That is exactly
 * the bug it caused on the admin login panel.
 *
 * `cloud` is the actual knockout: the same artwork at the same 7776x2550, in
 * #F8FAFD — which is --9e-ice to the byte — on the same transparency. Use it,
 * not `white`, whenever the logo sits on navy.
 *
 * Files in /public/brand/:
 *   - `white` → Blue & White lockup — BLUE ink (#2486FF). For LIGHT surfaces.
 *   - `blue`  → Full Blue logo — #005CFF on an OPAQUE #F8FAFD plate.
 *   - `navy`  → Dark Navy logo — #0D1B2A ink. For LIGHT surfaces.
 *   - `cloud` → the knockout — #F8FAFD ink. For DARK surfaces.
 */
const VARIANT_SRC = {
  white: '/brand/logo-white.png',
  blue:  '/brand/logo-blue.png',
  navy:  '/brand/logo-navy.png',
  cloud: '/brand/primary_logo_9expert2026_03.primary_logo_cloud.png',
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

  // Both themes use the white (Blue & White) logo. The Full Blue variant
  // washes out against the translucent light-mode header
  // (bg-[var(--page-bg)]/85 + backdrop-blur). Revisit if the light
  // header gets a solid background treatment.
  const themeVariant = mounted && resolvedTheme === 'dark' ? 'white' : 'white';
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
