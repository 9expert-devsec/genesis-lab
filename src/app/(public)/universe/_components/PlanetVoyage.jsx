'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlanetSphere, SKILL_THEMES, DEFAULT_THEME, MOON_THEME } from './PlanetSphere';

/**
 * Act 3 — the Planet Voyage. A LIGHT sticky storytelling section (the
 * Phase 5 rewrite that replaced the scroll-scrubbed CSS-3D fly-through):
 *
 *   Left   — skill navigation list + progress dots.
 *   Center — exactly one active premium planet.
 *   Right  — the active skill's title, course count, program links, CTA.
 *
 * A single sticky stage stays pinned while the reader scrolls through N
 * full-height "step" sentinels. Which step is active is decided by one
 * IntersectionObserver with a centre-line root margin — no GSAP, no
 * scroll-scrubbed tween, and no React state updates on every frame. The
 * active planet cross-fades + scales in; inactive planets sit static at
 * opacity 0 (the compositor never repaints them). This is what makes
 * reverse scrolling smooth: activation is symmetric and event-driven,
 * not a heavy per-frame depth calculation over a 3D translateZ stack.
 *
 * Planets are the 6 Skills; each info panel lists the Programs on that
 * skill (real links), and the active planet carries its top programs as
 * decorative orbiting moons (kept in the centre column, never over the
 * text panel).
 *
 * Two rendering modes, decided once on mount (SSR renders the fallback
 * so hydration is consistent and crawlers/screen readers get semantic
 * vertical sections on first paint).
 */

/** Decorative moon orbit slots — radii hug the sphere. */
const MOON_ORBITS = [
  { diameter: 116, period: 20, angle: 45, size: 28 },
  { diameter: 128, period: 27, angle: 190, size: 22 },
  { diameter: 138, period: 34, angle: 310, size: 32 },
];

function truncateLabel(text, max = 24) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function themeFor(planet) {
  return SKILL_THEMES[planet.slug] ?? DEFAULT_THEME;
}

/** Decorative program moons — duplicates of the panel links, aria-hidden.
    Only ever rendered for the active planet, so orbit animation runs for
    a single planet at a time. */
function Moons({ programs }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {programs.slice(0, MOON_ORBITS.length).map((program, i) => {
        const orbit = MOON_ORBITS[i];
        return (
          <div
            key={program.href}
            className="u9j-orbiter absolute left-1/2 top-1/2"
            style={{
              width: `${orbit.diameter}%`,
              height: `${orbit.diameter}%`,
              '--u9j-angle': `${orbit.angle}deg`,
              animationDuration: `${orbit.period}s`,
              animationDelay: `${-(orbit.period * orbit.angle) / 360}s`,
            }}
          >
            <div className="absolute left-1/2 top-0" style={{ transform: 'translate(-50%, -50%)' }}>
              <div
                className="u9j-counter"
                style={{
                  '--u9j-angle': `${orbit.angle}deg`,
                  animationDuration: `${orbit.period}s`,
                  animationDelay: `${-(orbit.period * orbit.angle) / 360}s`,
                }}
              >
                <div className="relative" style={{ width: orbit.size, height: orbit.size }}>
                  <PlanetSphere theme={MOON_THEME} size="100%" detail="moon" className="absolute inset-0" />
                  <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-9e-card/90 px-2.5 py-0.5 font-thai text-[10px] text-9e-ice">
                    {truncateLabel(program.name)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Info panel — the accessible content for one skill, shared by both modes. */
function PlanetInfo({ planet, index, total, active }) {
  return (
    <div className="u9j-panel-content max-w-md">
      <p className="text-sm font-semibold tracking-wide text-9e-air">
        ดาวแห่งทักษะ · {index + 1}/{total}
      </p>
      <h3 className="mt-3 font-heading text-3xl font-bold text-9e-ice lg:text-5xl">{planet.name}</h3>
      <p className="mt-3 font-thai text-9e-slate-dp-200">{planet.courseCount} หลักสูตรบนดาวดวงนี้</p>
      {planet.programs.length > 0 && (
        <>
          <p className="mt-6 font-thai text-xs uppercase tracking-wide text-9e-slate-dp-100">
            โปรแกรมบนดาวดวงนี้
          </p>
          <ul className="mt-2 space-y-2.5">
            {planet.programs.map((program) => (
              <li key={program.href}>
                <a
                  href={program.href}
                  tabIndex={active ? 0 : -1}
                  className="group inline-flex items-start gap-2 font-thai text-sm text-9e-ice/85 transition-colors duration-9e-micro ease-9e hover:text-9e-air"
                >
                  <ArrowUpRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-9e-air transition-transform duration-9e-micro ease-9e group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={1.75}
                  />
                  {program.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={planet.href} tabIndex={active ? 0 : -1} className="btn-9e-cta mt-8 font-thai">
        สำรวจดาวดวงนี้
      </Link>
    </div>
  );
}

export function PlanetVoyage({ planets, apiRef }) {
  const stepRefs = useRef([]);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // SSR + first client render = fallback, so hydration always matches and
  // the semantic layout is what crawlers/screen readers get on first paint.
  const [mode, setMode] = useState('fallback');

  const total = planets.length;

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (desktop && !reduced && total >= 2) setMode('sticky');
  }, [total]);

  const scrollToPlanet = useCallback((i) => {
    const el = stepRefs.current[i];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      document.getElementById('voyage')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Expose the jump API upward (GalaxyMap desktop clicks fly here).
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = { scrollToPlanet };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, scrollToPlanet]);

  // Event-driven activation: one observer, a centre-line band. Each step
  // sentinel is a full viewport tall, so exactly one crosses the centre
  // at a time. No per-frame work — this is the reverse-scroll fix.
  useEffect(() => {
    if (mode !== 'sticky' || total < 2) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.dataset.step);
          if (idx !== activeIndexRef.current) {
            activeIndexRef.current = idx;
            setActiveIndex(idx);
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    );
    stepRefs.current.slice(0, total).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [mode, total]);

  if (total === 0) return null;

  // ── Fallback: vertical semantic sections (mobile / reduced motion / SSR) ──
  if (mode !== 'sticky') {
    return (
      <section id="voyage" className="relative px-6 py-24">
        <h2 className="sr-only">สำรวจดาวแห่งทักษะ</h2>
        <div className="mx-auto max-w-5xl space-y-24">
          {planets.map((planet, i) => (
            <div
              key={planet.id}
              className="flex flex-col items-center gap-10 text-center lg:flex-row lg:gap-16 lg:text-left"
            >
              <PlanetSphere
                theme={themeFor(planet)}
                size="min(56vw, 240px)"
                className="shrink-0"
              />
              <div className="flex flex-col items-center lg:items-start">
                <PlanetInfo planet={planet} index={i} total={total} active />
              </div>
            </div>
          ))}
        </div>
        <style>{VOYAGE_CSS}</style>
      </section>
    );
  }

  // ── Sticky journey: pinned stage + step sentinels (desktop w/ motion) ──
  return (
    <>
      <h2 className="sr-only">สำรวจดาวแห่งทักษะ</h2>
      <section id="voyage" className="relative">
        {/* pinned stage */}
        <div
          className="sticky top-0 flex h-[100svh] items-center overflow-hidden"
          style={{ '--u9j-step': activeIndex, contain: 'layout paint' }}
        >
          {/* star parallax layers — step-based, transform-only, no scroll listener */}
          <div
            className="u9j-stars pointer-events-none absolute inset-x-0 -top-[10%] h-[130%]"
            style={{
              backgroundImage: 'radial-gradient(rgba(248,250,253,0.45) 1px, transparent 1.6px)',
              backgroundSize: '260px 200px',
              transform: 'translateY(calc(var(--u9j-step) * -8px))',
            }}
          />
          <div
            className="u9j-stars pointer-events-none absolute inset-x-0 -top-[10%] h-[130%]"
            style={{
              backgroundImage: 'radial-gradient(rgba(72,176,255,0.4) 1px, transparent 1.7px)',
              backgroundSize: '150px 170px',
              transform: 'translateY(calc(var(--u9j-step) * -16px))',
            }}
          />

          <div className="mx-auto grid w-full max-w-6xl grid-cols-[170px_minmax(0,1fr)_minmax(0,380px)] items-center gap-10 px-8">
            {/* left — skill navigation + progress */}
            <nav aria-label="เลือกดาวแห่งทักษะ">
              <ul className="space-y-3">
                {planets.map((planet, i) => (
                  <li key={planet.id}>
                    <button
                      type="button"
                      onClick={() => scrollToPlanet(i)}
                      className={cn(
                        'group flex items-center gap-3 text-left font-thai text-sm transition-colors duration-9e-micro ease-9e',
                        i === activeIndex ? 'text-9e-ice' : 'text-9e-slate-dp-100 hover:text-9e-ice/80'
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full transition-all duration-9e-micro ease-9e',
                          i === activeIndex
                            ? 'scale-125 bg-9e-lime'
                            : 'bg-[#22405E] group-hover:bg-9e-air'
                        )}
                      />
                      {planet.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* center — one active planet (all stacked, only active visible) */}
            <div className="flex items-center justify-center">
              <div
                className="relative"
                style={{ width: 'min(46vh, 440px)', height: 'min(46vh, 440px)' }}
              >
                {planets.map((planet, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <div
                      key={planet.id}
                      className={cn('u9j-planet absolute inset-0', isActive && 'is-active')}
                    >
                      <div className="u9j-float absolute inset-0">
                        <PlanetSphere theme={themeFor(planet)} size="100%" className="absolute inset-0" />
                        {isActive && <Moons programs={planet.programs} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* right — info panel (all stacked, only active visible + tabbable) */}
            <div className="relative min-h-[420px]">
              {planets.map((planet, i) => {
                const isActive = i === activeIndex;
                return (
                  <div
                    key={planet.id}
                    className={cn(
                      'u9j-panel absolute inset-0 flex flex-col justify-center',
                      isActive && 'is-active'
                    )}
                    aria-hidden={!isActive}
                  >
                    <PlanetInfo planet={planet} index={i} total={total} active={isActive} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* step sentinels — give the section its scroll length; pulled up to
            overlap the sticky stage so step i centres on the viewport when
            planet i should be active. */}
        <div className="relative -mt-[100svh]" aria-hidden="true">
          {planets.map((planet, i) => (
            <div
              key={planet.id}
              data-step={i}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className="h-[100svh]"
            />
          ))}
        </div>

        <style>{VOYAGE_CSS}</style>
      </section>
    </>
  );
}

const VOYAGE_CSS = `
  @keyframes u9j-orbit {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes u9j-orbit-rev {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  @keyframes u9j-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  .u9j-stars {
    transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }
  /* center planets: only the active one is visible + gently floating */
  .u9j-planet {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }
  .u9j-planet.is-active {
    opacity: 1;
    transform: scale(1);
  }
  .u9j-planet.is-active .u9j-float {
    animation: u9j-float 9s ease-in-out infinite;
  }
  .u9j-orbiter {
    pointer-events: none;
    transform: translate(-50%, -50%) rotate(var(--u9j-angle, 0deg));
    animation: u9j-orbit linear infinite;
  }
  .u9j-counter {
    transform: rotate(calc(var(--u9j-angle, 0deg) * -1));
    animation: u9j-orbit-rev linear infinite;
  }
  /* right panels: only the active one is visible + tabbable */
  .u9j-panel {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }
  .u9j-panel.is-active {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .u9j-stars,
    .u9j-planet,
    .u9j-panel {
      transition: none !important;
    }
    .u9j-float,
    .u9j-orbiter,
    .u9j-counter {
      animation: none !important;
    }
  }
`;
