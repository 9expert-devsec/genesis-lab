import Link from 'next/link';
import { Globe } from 'lucide-react';
import { FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import { avatarUrl } from '@/lib/avatar/avatarUrl';
import { WRITER_PLATFORM_LABELS } from '@/lib/writers/writerFields';
import { pagerPages } from '@/lib/writers/writerProfile';

/** The band at the top of both writer pages: the brand tint, soft. */
export const WRITER_HERO_BAND = 'bg-gradient-to-br from-9e-air/20 via-9e-ice to-white dark:from-[#0F2A4A] dark:via-[#0D1B2A] dark:to-[#0D1B2A]';

const PLATFORM_ICONS = {
  facebook: FaFacebook,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  x: FaXTwitter,
  instagram: FaInstagram,
  website: Globe,
};

/** A circular avatar. 256 is the largest allowlisted file, so it backs every size here. */
export function WriterPhoto({ writer, className, alt = '' }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={avatarUrl(writer.avatarPublicId || null, 256)}
      alt={alt}
      className={`rounded-full object-cover ${className}`}
    />
  );
}

export function WriterSocialLinks({ links }) {
  if (!links?.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" data-testid="writer-social">
      {links.map((link) => {
        const Icon = PLATFORM_ICONS[link.platform] ?? Globe;
        return (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={WRITER_PLATFORM_LABELS[link.platform] ?? link.platform}
              className="flex h-10 w-10 items-center justify-center rounded-9e-md border border-[var(--surface-border)] bg-white text-9e-action transition-colors hover:bg-9e-action hover:text-white dark:bg-[#111d2c] dark:text-9e-air dark:hover:text-white"
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** `?page=` links, read by the server page. Page 1 keeps the bare address. */
export function WriterPager({ path, page, totalPages }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="เลือกหน้า" className="mt-8 flex flex-wrap items-center justify-center gap-1.5" data-testid="writer-pager">
      {pagerPages(page, totalPages).map((n, index) => (n === null ? (
        // eslint-disable-next-line react/no-array-index-key
        <span key={`gap-${index}`} className="px-1 text-sm text-[var(--text-muted)]">…</span>
      ) : (
        <Link
          key={n}
          href={n === 1 ? path : `${path}?page=${n}`}
          aria-current={n === page ? 'page' : undefined}
          className={
            'flex h-9 min-w-9 items-center justify-center rounded-9e-md border px-2 text-sm font-medium transition-colors ' +
            (n === page
              ? 'border-9e-action bg-9e-action text-white'
              : 'border-[var(--surface-border)] text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#111d2c]')
          }
        >
          {n}
        </Link>
      )))}
    </nav>
  );
}
