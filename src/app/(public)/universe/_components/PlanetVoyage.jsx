'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { PlanetSphere, SKILL_THEMES, DEFAULT_THEME, MOON_THEME } from './PlanetSphere';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Act 3 — the Planet Voyage. A scroll-driven CSS-3D camera fly-through:
 * slides are stacked on translateZ (-i * SPACING) inside a preserve-3d
 * "camera" whose `z` is scrubbed by one GSAP ScrollTrigger, so each
 * skill planet in turn arrives in front of the viewer and snaps to dock.
 *
 * Planets are the 6 Skills; each info panel lists the Programs on that
 * skill (real links), and the moons are the skill's top programs.
 *
 * Scroll-performance contract (the Phase 4 fix):
 *  - NO animated background-position anywhere. Sphere textures are
 *    fully static (PlanetSphere) — even a transform-only idle-drift
 *    overlay measured too expensive, so the only idle motion is the
 *    active planet's moons.
 *  - Slides faded below 0.02 opacity get `visibility: hidden` (cached
 *    per-slide flag — style is touched only on state change), so the
 *    renderer skips paint + hit-testing for off-screen planets.
 *  - Every slide has `contain: layout style paint`.
 *  - Moon orbits are `animation-play-state: paused` on every non-active
 *    slide.
 *
 * Two rendering modes, decided once on mount (SSR renders the fallback
 * so hydration is consistent and crawlers/screen readers get semantic
 * vertical sections on first paint).
 */

const SPACING = 2600; // px between planets on the Z axis

/** Moon orbit slots — radii stay within ~1.15× the sphere radius so the
    moons hug the sphere instead of drifting over the info panel. */
const MOON_ORBITS = [
  { diameter: 104, period: 18, angle: 50, size: 30 },
  { diameter: 111, period: 24, angle: 200, size: 24 },
  { diameter: 118, period: 30, angle: 320, size: 34 },
];

function truncateLabel(text, max = 28) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function themeFor(planet) {
  return SKILL_THEMES[planet.slug] ?? DEFAULT_THEME;
}

/** Decorative program moons — duplicates of the panel links, aria-hidden. */
function Moons({ programs }) {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      {programs.slice(0, MOON_ORBITS.length).map((program, i) => {
        const orbit = MOON_ORBITS[i];
        return (
          <div
            key={program.href}
            className="u9v-orbiter absolute left-1/2 top-1/2"
            style={{
              width: `${orbit.diameter}%`,
              height: `${orbit.diameter}%`,
              '--u9v-angle': `${orbit.angle}deg`,
              animationDuration: `${orbit.period}s`,
              animationDelay: `${-(orbit.period * orbit.angle) / 360}s`,
            }}
          >
            <div className="absolute left-1/2 top-0" style={{ transform: 'translate(-50%, -50%)' }}>
              <div
                className="u9v-counter"
                style={{
                  '--u9v-angle': `${orbit.angle}deg`,
                  animationDuration: `${orbit.period}s`,
                  animationDelay: `${-(orbit.period * orbit.angle) / 360}s`,
                }}
              >
                <div className="relative" style={{ width: orbit.size, height: orbit.size }}>
                  <PlanetSphere theme={MOON_THEME} size="100%" detail="moon" className="absolute inset-0" />
                  <span className="u9v-chip absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-9e-card/90 px-2.5 py-0.5 font-thai text-[10px] text-9e-ice">
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
    <div className="u9v-panel-content max-w-md">
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
  const sectionRef = useRef(null);
  const cameraRef = useRef(null);
  const starsARef = useRef(null);
  const starsBRef = useRef(null);
  const slideRefs = useRef([]);
  const veilRefs = useRef([]);
  const stRef = useRef(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // SSR + first client render = fallback, so hydration always matches and
  // the semantic layout is what crawlers/screen readers get on first paint.
  const [mode, setMode] = useState('fallback');

  const total = planets.length;

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (desktop && !reduced && total >= 2) setMode('voyage');
  }, [total]);

  const scrollToPlanet = useCallback(
    (i) => {
      const st = stRef.current;
      if (st && total > 1) {
        const top = st.start + (i / (total - 1)) * (st.end - st.start);
        window.scrollTo({ top, behavior: 'smooth' });
      } else {
        document.getElementById('voyage')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [total]
  );

  // Expose the jump API upward (GalaxyMap desktop clicks fly here).
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = { scrollToPlanet };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, scrollToPlanet]);

  useLayoutEffect(() => {
    if (mode !== 'voyage') return undefined;
    if (total < 2 || !sectionRef.current || !cameraRef.current) return undefined;

    let disposed = false;
    const ctx = gsap.context(() => {
      const slides = slideRefs.current.slice(0, total).filter(Boolean);
      const veils = veilRefs.current.slice(0, total).filter(Boolean);
      const slideSet = slides.map((el) => gsap.quickSetter(el, 'opacity'));
      const veilSet = veils.map((el) => gsap.quickSetter(el, 'opacity'));
      // Cached visibility flags — touch style.visibility only on change,
      // never per frame.
      const shown = slides.map(() => true);

      // Depth cues: fade slides by camera distance; slides the camera has
      // already passed fade out much faster so their back side never
      // shows. Fully-faded slides are visibility:hidden so the renderer
      // skips them entirely (the Phase 4 reverse-scroll jank fix).
      const applyDepth = (progress) => {
        const pos = progress * (total - 1);
        for (let i = 0; i < slides.length; i += 1) {
          const dist = Math.abs(pos - i);
          let opacity = 1 - (dist - 0.35) * 1.6;
          if (pos > i) opacity = Math.min(opacity, 1 - (dist - 0.1) * 2.4);
          opacity = Math.max(0, Math.min(1, opacity));
          slideSet[i](opacity);
          if (veilSet[i]) veilSet[i](Math.max(0, Math.min(0.75, (dist - 0.18) * 1.1)));
          // Hysteresis: show at ≥0.035, hide below 0.015. A single
          // threshold would thrash visibility every frame while the
          // snap settles right on the boundary — each flip is a full
          // slide repaint.
          const visible = shown[i] ? opacity >= 0.015 : opacity >= 0.035;
          if (visible !== shown[i]) {
            shown[i] = visible;
            slides[i].style.visibility = visible ? 'visible' : 'hidden';
          }
        }
      };

      const tween = gsap.to(cameraRef.current, {
        z: (total - 1) * SPACING,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          // one viewport of scroll per planet transition
          end: () => `+=${(total - 1) * window.innerHeight}`,
          pin: true,
          anticipatePin: 1,
          scrub: 0.6,
          invalidateOnRefresh: true,
          snap: {
            snapTo: 1 / (total - 1),
            duration: { min: 0.15, max: 0.4 },
            ease: 'power2.out',
            // no velocity prediction — a fast flick (or our smooth-scroll
            // jumps) would otherwise overshoot and dock planets away
            inertia: false,
            directional: false,
          },
          onUpdate: (self) => {
            applyDepth(self.progress);
            const idx = Math.round(self.progress * (total - 1));
            if (idx !== activeIndexRef.current) {
              activeIndexRef.current = idx;
              setActiveIndex(idx);
            }
          },
        },
      });
      stRef.current = tween.scrollTrigger;

      // Star parallax — one extra ScrollTrigger over the same pinned range.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: () => `+=${(total - 1) * window.innerHeight}`,
            scrub: true,
          },
        })
        .to(starsARef.current, { yPercent: -12, ease: 'none' }, 0)
        .to(starsBRef.current, { yPercent: -24, ease: 'none' }, 0);

      applyDepth(stRef.current.progress || 0);
    }, sectionRef);

    // Font swaps can shift layout above the pin — re-measure once settled.
    if (document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (!disposed) ScrollTrigger.refresh();
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      stRef.current = null;
      ctx.revert();
    };
  }, [mode, total]);

  if (total === 0) return null;

  // ── Fallback: vertical semantic sections (mobile / reduced motion / SSR) ──
  if (mode !== 'voyage') {
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

  // ── Voyage: pinned 3D fly-through (desktop with motion) ──
  return (
    <>
      <h2 className="sr-only">สำรวจดาวแห่งทักษะ</h2>
      <section id="voyage" ref={sectionRef} className="relative h-screen overflow-hidden">
        {/* star parallax layers — repeating gradient dots, not canvas */}
        <div
          ref={starsARef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[140%]"
          style={{
            backgroundImage: 'radial-gradient(rgba(248,250,253,0.5) 1px, transparent 1.6px)',
            backgroundSize: '260px 200px',
          }}
        />
        <div
          ref={starsBRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[150%]"
          style={{
            backgroundImage: 'radial-gradient(rgba(72,176,255,0.4) 1px, transparent 1.7px)',
            backgroundSize: '150px 170px',
          }}
        />

        <div
          className="absolute inset-0"
          style={{ perspective: '1200px', perspectiveOrigin: '50% 45%' }}
        >
          <div
            ref={cameraRef}
            className="absolute inset-0"
            style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
          >
            {planets.map((planet, i) => {
              const isActive = i === activeIndex;
              return (
                <article
                  key={planet.id}
                  ref={(el) => {
                    slideRefs.current[i] = el;
                  }}
                  className={cn(
                    'u9v-slide absolute left-1/2 top-1/2 w-[min(1200px,92vw)] px-20 py-16',
                    isActive && 'is-active'
                  )}
                  style={{ transform: `translate(-50%, -50%) translateZ(${-i * SPACING}px)` }}
                >
                  <div className="flex items-center justify-center gap-20">
                    {/* sphere + moons — kept BELOW the panel's stacking context */}
                    <div
                      className="relative z-10 shrink-0"
                      style={{ width: 'min(52vh, 480px)', height: 'min(52vh, 480px)' }}
                    >
                      <PlanetSphere
                        theme={themeFor(planet)}
                        size="100%"
                        className="absolute inset-0"
                      />
                      <Moons programs={planet.programs} />
                    </div>
                    {/* info panel — its own stacking context ABOVE the moon
                        layer, so orbiting chips can never cover the text */}
                    <div className="relative z-20">
                      <PlanetInfo planet={planet} index={i} total={total} active={isActive} />
                    </div>
                  </div>
                  {/* distance veil — same navy as the page bg, reads as depth haze */}
                  <div
                    ref={(el) => {
                      veilRefs.current[i] = el;
                    }}
                    className="pointer-events-none absolute inset-0 bg-9e-navy"
                    style={{ opacity: 0 }}
                  />
                </article>
              );
            })}
          </div>
        </div>

        {/* left planet menu */}
        <aside
          aria-label="เลือกดาวแห่งทักษะ"
          className="absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
        >
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
                      'h-2 w-2 shrink-0 rounded-full transition-colors duration-9e-micro ease-9e',
                      i === activeIndex ? 'bg-9e-lime' : 'bg-[#22405E] group-hover:bg-9e-air'
                    )}
                  />
                  {planet.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <style>{VOYAGE_CSS}</style>
      </section>
    </>
  );
}

const VOYAGE_CSS = `
  @keyframes u9v-orbit {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes u9v-orbit-rev {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  .u9v-slide {
    pointer-events: none;
    contain: layout style paint;
  }
  .u9v-slide.is-active {
    pointer-events: auto;
  }
  .u9v-orbiter {
    pointer-events: none;
    transform: translate(-50%, -50%) rotate(var(--u9v-angle, 0deg));
    animation: u9v-orbit linear infinite;
  }
  .u9v-counter {
    transform: rotate(calc(var(--u9v-angle, 0deg) * -1));
    animation: u9v-orbit-rev linear infinite;
  }
  /* Perf: moons orbit ONLY on the active planet; idle spin overlay too.
     Everything else is frozen (compositor does zero work for them). */
  .u9v-slide .u9v-orbiter,
  .u9v-slide .u9v-counter {
    animation-play-state: paused;
  }
  .u9v-slide.is-active .u9v-orbiter,
  .u9v-slide.is-active .u9v-counter {
    animation-play-state: running;
  }
  .u9v-panel-content {
    opacity: 1;
    transform: translateY(0);
  }
  .u9v-slide .u9v-panel-content {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s;
  }
  .u9v-slide.is-active .u9v-panel-content {
    opacity: 1;
    transform: translateY(0);
  }
  .u9v-chip {
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .is-active .u9v-chip {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .u9v-orbiter,
    .u9v-counter {
      animation: none !important;
    }
  }
`;
