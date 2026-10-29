import Link from 'next/link';
import {
  ArrowRight, Award, Briefcase, Building2, Layers, MonitorPlay, PlayCircle, Route, Users,
} from 'lucide-react';
import { siteConfig } from '@/config/site';
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';

/**
 * /about-us "รูปแบบการเรียน" — one link card per way to learn with 9Expert, in
 * two groups (round AB-3c): in the training room (2×2) and online (one
 * column), each card an icon, its title with an arrow, and a sub-label.
 *
 * Every in-site href is a route the site already links to (header mega menu,
 * Home's services section). A count appears only where an existing server loader
 * supplies it: `careerPathCount` is getActiveCareerPaths().length, passed in by
 * the page; null hides the number, never "0". Career Path sits with the room
 * formats: its href is the on-site /career-path-project, not academy content.
 *
 * The academy links (E-Learning, Bundle Programs) open in a new tab, as every
 * other academy link on the site does; both are built from siteConfig.academyUrl.
 */
function groups({ careerPathCount }) {
  return [
    {
      label: 'เรียนในห้องอบรม',
      Icon: Building2,
      wide: true,
      items: [
        { title: 'Public Training', subtitle: 'Classroom / Hybrid', href: '/training-course', Icon: Users },
        { title: 'In-house Training', subtitle: 'ออกแบบเฉพาะองค์กร', href: '/registration/in-house', Icon: Briefcase },
        { title: 'Masterclass', subtitle: 'Workshop เข้มข้นวันเสาร์–อาทิตย์', href: '/masterclass', Icon: Award },
        {
          title: 'Career Path',
          subtitle: careerPathCount ? `${careerPathCount} เส้นทางสายอาชีพ` : 'เส้นทางสายอาชีพ',
          href: '/career-path-project',
          Icon: Route,
        },
      ],
    },
    {
      label: 'เรียนออนไลน์',
      Icon: MonitorPlay,
      wide: false,
      items: [
        { title: 'E-Learning', subtitle: '9Expert Academy', href: siteConfig.academyUrl, external: true, Icon: PlayCircle },
        {
          title: 'Bundle Programs',
          subtitle: 'ชุดหลักสูตรออนไลน์ บน 9Expert Academy',
          href: `${siteConfig.academyUrl.replace(/\/+$/, '')}/bundles`,
          external: true,
          Icon: Layers,
        },
      ],
    },
  ];
}

// An opaque panel card; the whole card is the link. Hover/focus (border,
// title and arrow to the accent — colour only, nothing moves) lives in
// globals.css under .about-card / .about-format.
const CARD = 'about-card about-format flex h-full flex-col rounded-lg bg-[var(--ab-panel)] p-5';

function CardBody({ title, subtitle, external, Icon }) {
  return (
    <>
      <Icon className="h-6 w-6 text-[var(--ab-accent)]" aria-hidden="true" />
      <span className="about-format-title mt-4 flex items-center gap-1.5 !font-heading text-lg font-bold leading-[1.4] text-[var(--ab-bright)]">
        {title}
        <ArrowRight className="about-format-arrow h-4 w-4 shrink-0 text-[var(--ab-meta)]" aria-hidden="true" />
      </span>
      <span className="mt-1 block text-sm text-[var(--ab-meta)]">{subtitle}</span>
      {external && <span className="sr-only">(เปิดในแท็บใหม่)</span>}
    </>
  );
}

export default function FormatsSection({ careerPathCount = null }) {
  return (
    <AboutSection>
      <AboutSectionHeader title="เรียนกับเราได้หลายรูปแบบ" />
      <div data-reveal-group="" className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-6">
        {groups({ careerPathCount }).map(({ label, Icon, wide, items }) => (
          <div key={label} className={wide ? 'min-w-0 lg:col-span-8' : 'min-w-0 lg:col-span-4'}>
            <p className="flex items-center gap-2 text-sm text-[var(--ab-meta)]">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </p>
            <ul aria-label={label} className={wide ? 'mt-4 grid gap-3 md:grid-cols-2' : 'mt-4 grid gap-3'}>
              {items.map((f) => (
                <li key={f.title} data-reveal="" className="min-w-0">
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
        ))}
      </div>
    </AboutSection>
  );
}
