import Link from "next/link";
import { FaInstagram, FaTiktok, FaLinkedin, FaYoutube } from "react-icons/fa";
import { TbBrandShopee } from "react-icons/tb";
import { Logo } from "@/components/brand/Logo";
import { siteConfig, footerNav } from "@/config/site";

const SOCIALS = [
  {
    href: "https://www.instagram.com/9experttraining",
    label: "Instagram",
    Icon: FaInstagram,
  },
  {
    href: "https://www.tiktok.com/@9experttraining",
    label: "TikTok",
    Icon: FaTiktok,
  },
  {
    href: "https://www.linkedin.com/company/9expert",
    label: "LinkedIn",
    Icon: FaLinkedin,
  },
  {
    href: "https://www.youtube.com/@9experttraining",
    label: "YouTube",
    Icon: FaYoutube,
  },
  { href: "https://shopee.co.th/9expert", label: "Shopee", Icon: TbBrandShopee },
];

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#E2E8F0] bg-white dark:border-[#1e3a5f] dark:bg-9e-navy">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 pt-12 pb-6 text-center sm:grid-cols-2 sm:text-left md:gap-10 lg:grid-cols-4 ">
        {/* Col 1 — Logo + tagline */}
        <div className="flex flex-col items-center gap-4 sm:items-start lg:col-span-1">
          <Logo />
          <p className="text-sm leading-relaxed text-9e-navy dark:text-white">
            {siteConfig.description}
          </p>
          <p className="text-xs text-9e-slate dark:text-[#94a3b8]">
            {siteConfig.concept}
          </p>
        </div>

        <div className="grid grid-rows-2 gap-6">
          <FooterGroup title="หลักสูตร" items={footerNav.learn} />
          <FooterGroup title="เกี่ยวกับ" items={footerNav.company} />
        </div>

        <div className="grid grid-rows-2 gap-6">
          <FooterGroup title="แหล่งเรียนรู้" items={footerNav.resources} />
          <div>
            <h4 className="mb-2 text-sm font-bold text-9e-navy dark:text-white">
              ที่อยู่ติดต่อ
            </h4>
            <p className="text-xs leading-relaxed text-9e-slate dark:text-[#94a3b8]">
              9EXPERT COMPANY LIMITED
              <br />
              เลขที่ 318 อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B
              <br />
              ซอยวรฤทธิ์ ถนนพญาไท แขวงถนนเพชรบุรี
              <br />
              เขตราชเทวี กรุงเทพฯ 10400
            </p>
          </div>
        </div>

        {/* Col 4 — Contact + socials */}
        <div className="flex flex-col items-center gap-4 sm:items-start">
          <div>
            <h4 className="mb-2 text-sm font-bold text-9e-navy dark:text-white">
              ติดต่อเรา
            </h4>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-9e-slate dark:text-[#94a3b8]">Telephone</p>
              <a
                href="tel:022194304"
                className="text-sm font-bold text-9e-navy hover:text-9e-action dark:text-white dark:hover:text-[#48B0FF]"
              >
                02-219-4304
              </a>
              <p className="mt-1 text-xs text-9e-slate dark:text-[#94a3b8]">Email</p>
              <a
                href="mailto:training@9expert.co.th"
                className="text-sm font-bold text-9e-navy hover:text-9e-action dark:text-white dark:hover:text-[#48B0FF]"
              >
                training@9expert.co.th
              </a>
              <p className="mt-1 text-xs text-9e-slate dark:text-[#94a3b8]">LINE Official</p>
              <a
                href="https://line.me/R/ti/p/@9expert"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-9e-action dark:text-[#48B0FF]"
              >
                @9expert
              </a>
            </div>
          </div>

          <div className="mt-1 flex justify-center gap-3 sm:justify-start">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] text-9e-slate transition-colors hover:border-9e-action hover:text-9e-action dark:border-[#1e3a5f] dark:text-[#94a3b8] dark:hover:border-[#48B0FF] dark:hover:text-[#48B0FF]"
              >
                {s.Icon ? (
                  <s.Icon className="h-4 w-4" strokeWidth={1.75} />
                ) : (
                  <span className="text-xs font-bold">{s.text}</span>
                )}
              </a>
            ))}
          </div>

          <div className="flex w-full flex-col items-center gap-2 sm:items-start">
            <p className="text-xs text-9e-slate dark:text-[#94a3b8]">ได้รับการรับรองจาก</p>
            <a
              className="w-8/12 rounded-xl bg-white shadow-md ring-1 ring-slate-100 dark:ring-[#1e3a5f]"
              href="https://dbdregistered.dbd.go.th/api/public/trustmarkinfo/115374"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="/assets/DBD_logo.jpg"
                alt="dbd logo"
                className="mx-auto mt-1 h-auto w-1/2 object-contain"
              />
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#E2E8F0] dark:border-[#1e3a5f]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-9e-slate dark:text-[#94a3b8] sm:flex-row sm:text-left lg:px-6">
          <p>
            © {year} {siteConfig.nameFull}. All rights reserved.
          </p>
          <p>
            {siteConfig.tagline} ·{" "}
            <span className="text-9e-action dark:text-[#48B0FF]">
              {siteConfig.slogan}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, items }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-bold text-9e-navy dark:text-white">{title}</h4>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className="text-sm text-9e-slate transition-colors hover:text-9e-action dark:text-[#94a3b8] dark:hover:text-[#48B0FF]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
