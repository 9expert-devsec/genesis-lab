import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * 9Expert Logo.
 *
 * Variants map to files in /public/brand/ (copied from 9Expert_CI.zip):
 *   - `white`  → Blue & White logo (for dark backgrounds — default)
 *   - `blue`   → Full Blue logo (for light backgrounds)
 *   - `navy`   → Dark Navy logo (for light/lime backgrounds)
 *
 * By default links to the homepage. Pass `href={null}` or `asStatic` to
 * render without a link wrapper (e.g., inside a banner, as a static mark).
 */
export function Logo({
  variant = 'white',
  width = 120,
  height = 32,
  href = '/',
  className,
  priority = false,
  alt = '9Expert Training',
}) {
  const src = {
    white: '/brand/logo-white.png',
    blue:  '/brand/logo-blue.png',
    navy:  '/brand/logo-navy.png',
  }[variant] ?? '/brand/logo-white.png';

  const img = (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={cn('h-8 w-auto object-contain', className)}
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
