import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { siteConfig, footerNav } from '@/config/site';

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-9e-border bg-9e-navy">
      <div className="mx-auto max-w-[1280px] px-4 py-12 lg:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 text-sm text-9e-slate leading-relaxed">
              {siteConfig.description}
            </p>
            <p className="mt-2 text-xs text-9e-slate/70">
              {siteConfig.concept}
            </p>
          </div>

          <FooterGroup title="เกี่ยวกับ"     items={footerNav.company} />
          <FooterGroup title="หลักสูตร"      items={footerNav.learn} />
          <FooterGroup title="แหล่งเรียนรู้" items={footerNav.resources} />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-9e-border pt-6 text-xs text-9e-slate md:flex-row md:items-center">
          <p>© {year} {siteConfig.nameFull}. All rights reserved.</p>
          <p className="text-9e-slate/70">{siteConfig.tagline} · {siteConfig.slogan}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, items }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-9e-ice">{title}</h3>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className="text-sm text-9e-slate hover:text-9e-ice transition-colors duration-9e-micro"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
