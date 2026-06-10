'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Award, Star, Youtube, ExternalLink } from 'lucide-react';

const AWARDS = [
  {
    num: '01',
    Icon: Award,
    title: 'Microsoft MVP — Power BI',
    subtitle: 'Microsoft Most Valuable Professional ด้าน Power BI',
    badge: 'Microsoft',
    link: 'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333',
  },
  {
    num: '02',
    Icon: Star,
    title: 'Microsoft MVP — M365 Copilot',
    subtitle: 'Microsoft Most Valuable Professional AI & Productivity Expert',
    badge: 'AI Expert',
    link: 'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333',
  },
  {
    num: '03',
    Icon: Youtube,
    title: 'YouTube Silver Creator Award',
    subtitle: 'Silver Play Button จาก Channel 9Expert',
    badge: '250K+ Subscribers',
    link: 'https://www.youtube.com/@9expert',
  },
];

const MVP_PROFILE =
  'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333';

const GLOW_STYLES = `
  .award-card-glow {
    isolation: isolate;
    transition: background .34s ease, box-shadow .34s ease;
  }
  .award-card-glow::before {
    content: '';
    position: absolute;
    inset: -40%;
    background:
      radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(216,255,47,0.20), transparent 22%),
      linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.10), transparent 70%);
    opacity: 0;
    transform: translateX(-18%) rotate(8deg);
    transition: opacity .34s ease, transform .55s ease;
    z-index: -1;
  }
  .award-card-glow:hover {
    background:
      radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(216,255,47,0.11), transparent 28%),
      rgba(255,255,255,0.075);
    box-shadow:
      inset 0 0 0 1px rgba(216,255,47,0.16),
      inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .award-card-glow:hover::before {
    opacity: 1;
    transform: translateX(18%) rotate(8deg);
  }
  .award-card-glow:hover .award-icon-el {
    text-shadow: 0 0 28px rgba(216,255,47,0.48);
  }
  .award-card-glow:hover h3 { color: #ffffff; }
  .award-card-glow:hover p  { color: #d8eaff; }
  .award-card-glow:hover .award-badge-el {
    color: #06172f;
    background: #D4F73F;
    border-color: #D4F73F;
  }
  @media (prefers-reduced-motion: reduce) {
    .award-card-glow, .award-card-glow::before { transition: none; }
  }
`;

function AwardCard({ award, index }) {
  const cardRef = useRef(null);

  const handlePointerMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    cardRef.current.style.setProperty('--mx', `${x}%`);
    cardRef.current.style.setProperty('--my', `${y}%`);
  };

  const Icon = award.Icon;

  return (
    <motion.article
      ref={cardRef}
      onPointerMove={handlePointerMove}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.12 }}
      className="award-card-glow relative isolate min-h-[230px] overflow-hidden rounded-9e-lg p-[34px]"
      style={{ background: 'rgba(255,255,255,0.035)' }}
    >
      {/* Large background number */}
      <div className="absolute right-6 top-3 select-none font-en text-[82px] font-black leading-none tracking-tighter text-white/[0.05] transition-colors duration-300">
        {award.num}
      </div>

      {/* Icon */}
      <div className="award-icon-el mb-[26px] transition-all duration-300">
        <Icon className="h-8 w-8 text-9e-lime" strokeWidth={1.5} />
      </div>

      <h3 className="font-heading text-[22px] font-black leading-tight tracking-tight text-white transition-colors duration-300">
        {award.title}
      </h3>
      <p className="mb-[18px] mt-2.5 font-thai text-sm leading-relaxed text-[#bdd1e6] transition-colors duration-300">
        {award.subtitle}
      </p>

      <a
        href={award.link}
        target="_blank"
        rel="noopener noreferrer"
        className="award-badge-el inline-flex rounded-full border border-9e-lime/45 px-3 py-1.5 font-en text-[12px] font-black text-9e-lime transition-all duration-300"
      >
        {award.badge}
      </a>
    </motion.article>
  );
}

export default function AwardsSection() {
  return (
    <section className="relative overflow-hidden bg-9e-navy py-20">
      <style>{GLOW_STYLES}</style>

      {/* Dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(72,176,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-4">
        {/* Header */}
        <div className="mb-14 text-center">
          <p className="font-en text-xs font-black uppercase tracking-[2px] text-9e-brand">
            AWARDS &amp; RECOGNITION
          </p>
          <h2 className="mt-3 font-heading text-4xl font-black text-white">
            รางวัลและการรับรอง
          </h2>
          <p className="mt-3 font-thai text-sm text-9e-slate-dp-600">
            ความภาคภูมิใจที่สะท้อนถึงคุณภาพและมาตรฐานระดับสากล
          </p>
        </div>

        {/* Award grid */}
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-5 md:grid-cols-3">
          {AWARDS.map((award, index) => (
            <AwardCard key={award.num} award={award} index={index} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-[34px] text-center">
          <a
            href={MVP_PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-9e-lime/45 px-[22px] py-[13px] font-en text-sm font-black text-9e-lime transition-all duration-200 hover:bg-9e-lime/10"
          >
            ดู Microsoft MVP Profile บน Microsoft.com
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
