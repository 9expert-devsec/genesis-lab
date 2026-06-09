'use client';

import { motion } from 'framer-motion';
import { Award, Star, Youtube, ExternalLink } from 'lucide-react';

const AWARDS = [
  {
    num: '01',
    Icon: Award,
    iconColor: 'text-9e-lime',
    title: 'Microsoft MVP — Power BI',
    subtitle: 'Microsoft Most Valuable Professional · คนแรกของประเทศไทย สาขา Power BI',
    badge: 'คนแรกของไทย',
    link: 'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333',
  },
  {
    num: '02',
    Icon: Star,
    iconColor: 'text-9e-lime',
    title: 'Microsoft MVP — M365 Copilot',
    subtitle: 'Microsoft Most Valuable Professional · AI & Productivity Expert',
    badge: 'AI Expert',
    link: 'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333',
  },
  {
    num: '03',
    Icon: Youtube,
    iconColor: 'text-red-400',
    title: 'YouTube Silver Creator Award',
    subtitle: 'Silver Play Button · 250,000+ Subscribers · Channel @9expert',
    badge: '250K+ Subscribers',
    link: 'https://www.youtube.com/@9expert',
  },
];

const MVP_PROFILE =
  'https://mvp.microsoft.com/en-US/mvp/profile/f547abba-8786-ed11-aad1-000d3a197333';

function Badge({ award }) {
  const badge = (
    <span className="rounded-full border border-9e-lime/40 bg-9e-lime/10 px-4 py-1.5 font-en text-xs font-bold text-9e-lime">
      {award.badge}
    </span>
  );
  return (
    <div className="relative z-10 ml-auto hidden flex-shrink-0 items-center md:flex">
      {award.link ? (
        <a href={award.link} target="_blank" rel="noopener noreferrer">
          {badge}
        </a>
      ) : (
        badge
      )}
    </div>
  );
}

export default function AwardsSection() {
  return (
    <section className="relative overflow-hidden bg-9e-navy py-20">
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

      <div className="relative z-10">
        {/* Header */}
        <div className="mx-auto mb-14 max-w-[1200px] px-4">

          <h2 className="mt-4 font-heading text-3xl font-bold text-white md:text-4xl">
            รางวัลและการรับรอง
          </h2>
        </div>

        {/* Award list */}
        <div className="mx-auto max-w-[1200px] px-4">
          {AWARDS.map((award, index) => (
            <motion.div
              key={award.num}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: index * 0.12 }}
              className="group relative flex cursor-default items-center gap-6 overflow-hidden py-8 md:gap-10"
            >
              {/* Hover background fill */}
              <motion.div
                className="absolute inset-0 bg-9e-card"
                initial={{ scaleX: 0 }}
                whileHover={{ scaleX: 1 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                style={{ originX: 0, zIndex: 0 }}
              />

              {/* Number */}
              <span className="relative z-10 min-w-[100px] select-none text-right font-en text-[72px] font-black leading-none text-white/[0.06] transition-colors duration-300 group-hover:text-9e-brand/15 md:min-w-[130px] md:text-[96px]">
                {award.num}
              </span>

              {/* Icon */}
              <award.Icon
                className={`relative z-10 h-8 w-8 flex-shrink-0 md:h-10 md:w-10 ${award.iconColor}`}
                strokeWidth={1.5}
              />

              {/* Content */}
              <div className="relative z-10 min-w-0 flex-1">
                <h3 className="font-heading text-xl font-bold text-white transition-colors duration-300 group-hover:text-9e-lime md:text-2xl">
                  {award.title}
                </h3>
                <p className="mt-1 font-en text-sm text-9e-slate-dp-400">
                  {award.subtitle}
                </p>
              </div>

              {/* Badge */}
              <Badge award={award} />

              {/* Animated separator */}
              <motion.div
                className="absolute bottom-0 left-0 h-px bg-9e-border"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                style={{ originX: 0, width: '100%' }}
              />
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <a
            href={MVP_PROFILE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-9e-lime/40 px-6 py-2.5 font-en text-sm font-semibold text-9e-lime transition-all duration-200 hover:bg-9e-lime/10"
          >
            ดู Microsoft MVP Profile บน Microsoft.com
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
