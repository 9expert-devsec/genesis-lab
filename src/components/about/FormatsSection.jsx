import Link from 'next/link';
import { siteConfig } from '@/config/site';

/**
 * /about-us "รูปแบบการเรียน" — one link card per way to learn with 9Expert.
 *
 * Every in-site href is a route the site already links to (header mega menu,
 * Home's services section). A count appears only where an existing server loader
 * supplies it: `careerPathCount` is getActiveCareerPaths().length, passed in by
 * the page; null hides the number, never "0".
 *
 * The academy links (E-Learning, Bundle Programs) open in a new tab, as every
 * other academy link on the site does; both are built from siteConfig.academyUrl.
 */
function formats({ careerPathCount }) {
  return [
    { title: 'Public Training', subtitle: 'Classroom / Hybrid', href: '/training-course' },
    { title: 'In-house Training', subtitle: 'ออกแบบเฉพาะองค์กร', href: '/registration/in-house' },
    { title: 'Masterclass', subtitle: 'Workshop เข้มข้นวันเสาร์–อาทิตย์', href: '/masterclass' },
    {
      title: 'Career Path',
      subtitle: careerPathCount ? `${careerPathCount} เส้นทางสายอาชีพ` : 'เส้นทางสายอาชีพ',
      href: '/career-path-project',
    },
    { title: 'E-Learning', subtitle: '9Expert Academy', href: siteConfig.academyUrl, external: true },
    {
      title: 'Bundle Programs',
      subtitle: 'ชุดหลักสูตรออนไลน์ บน 9Expert Academy',
      href: `${siteConfig.academyUrl.replace(/\/+$/, '')}/bundles`,
      external: true,
    },
  ];
}

// Hover/focus/active treatment (sweep, accent ring, title colour, arrow
// nudge, press) lives in globals.css under .about-format.
const CARD =
  'about-card about-format flex min-h-[72px] items-center justify-between gap-4 rounded-2xl bg-[var(--page-bg-muted)] p-5';

function CardBody({ title, subtitle, external }) {
  return (
    <>
      <span className="min-w-0">
        <span className="about-format-title block font-heading text-base font-bold text-[var(--text-primary)] lg:text-lg">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-sm text-[var(--text-secondary)]">{subtitle}</span>
        {external && <span className="sr-only">(เปิดในแท็บใหม่)</span>}
      </span>
      <span
        aria-hidden="true"
        className="about-format-arrow shrink-0 text-xl text-9e-action dark:text-9e-air"
      >
        →
      </span>
    </>
  );
}

export default function FormatsSection({ careerPathCount = null }) {
  return (
    <section className="bg-[var(--page-bg)] px-4 pb-20 lg:px-6 lg:pb-24">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="font-heading text-3xl font-bold leading-snug text-[var(--text-primary)] md:text-[40px]">
          เรียนกับเราได้หลายรูปแบบ
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {formats({ careerPathCount }).map((f) => (
            <li key={f.title} className="min-w-0">
              {f.external ? (
                <a href={f.href} target="_blank" rel="noopener noreferrer" className={CARD}>
                  <CardBody {...f} />
                </a>
              ) : (
                <Link href={f.href} className={CARD}>
                  <CardBody {...f} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
