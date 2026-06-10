'use client';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { id: 'learning', label: 'Learning' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'awards', label: 'Awards' },
  { id: 'community', label: 'Community' },
];

export default function PortfolioSectionNav() {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState('learning');
  const [onDarkBg, setOnDarkBg] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const first = document.querySelector('#learning');
      const last = document.querySelector('#community');
      if (!first || !last) return;

      const inRange =
        first.getBoundingClientRect().top <= window.innerHeight * 0.55 &&
        last.getBoundingClientRect().bottom >= window.innerHeight * 0.45;
      setVisible(inRange);

      let current = 'learning';
      NAV_ITEMS.forEach(({ id }) => {
        const el = document.querySelector(`#${id}`);
        if (el && el.getBoundingClientRect().top <= 160) current = id;
      });
      setActiveId(current);

      // Dark background detection — awards section is bg-9e-navy
      const awardsEl = document.querySelector('#awards');
      if (awardsEl) {
        const r = awardsEl.getBoundingClientRect();
        const mid = window.innerHeight / 2;
        setOnDarkBg(r.top < mid && r.bottom > mid);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const lineColor = onDarkBg ? 'rgba(255,255,255,0.28)' : '#d8e2ef';
  const dotInactive = onDarkBg
    ? 'border-white/50 bg-transparent'
    : 'border-[#cbd5e1] bg-white dark:bg-9e-navy dark:border-9e-border';
  const labelInactive = onDarkBg ? 'text-white/60' : 'text-[#94a3b8]';
  const labelActive = onDarkBg ? 'text-white' : 'text-9e-action';

  return (
    <nav
      aria-label="Section navigation"
      className={`fixed left-[34px] top-1/2 z-[90] hidden lg:flex
                  -translate-y-1/2 flex-col items-center
                  transition-all duration-300
                  ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {/* Single continuous vertical line — full height of nav */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[2px] pointer-events-none"
        style={{
          top: '36px', // start from center of first dot
          bottom: '36px', // end at center of last dot
          background: lineColor,
          zIndex: 0,
          transition: 'background 0.3s ease',
        }}
        aria-hidden
      />

      {/* Items */}
      {NAV_ITEMS.map((item) => {
        const isActive = activeId === item.id;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .querySelector(`#${item.id}`)
                ?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="group relative flex h-[72px] w-[96px] flex-col items-center justify-center"
            aria-label={item.label}
          >
            {/* Dot — centered in the 72px block, sits on top of the line */}
            <span
              className={`relative z-[2] flex-none rounded-full border-2
                          transition-all duration-[240ms]
                          ${
                            isActive
                              ? 'h-[22px] w-[22px] border-9e-action bg-9e-action shadow-[0_0_0_9px_rgba(0,92,255,0.12),0_0_24px_rgba(0,92,255,0.22)]'
                              : `h-[13px] w-[13px] ${dotInactive} group-hover:h-[17px] group-hover:w-[17px] group-hover:border-9e-action/50`
                          }`}
            />

            {/* Label — below dot, fades in on hover or when active */}
            <span
              className={`absolute top-[calc(50%+14px)] left-1/2 -translate-x-1/2
                          w-max max-w-[96px] text-center font-en text-[11px] font-black
                          leading-tight tracking-wide pointer-events-none
                          transition-all duration-[220ms]
                          ${
                            isActive
                              ? `opacity-100 translate-y-0 ${labelActive}`
                              : `opacity-0 translate-y-[-3px] ${labelInactive}
                               group-hover:opacity-100 group-hover:translate-y-0`
                          }`}
            >
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
