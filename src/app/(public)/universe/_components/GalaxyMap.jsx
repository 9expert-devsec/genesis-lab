'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlanetSphere, SKILL_THEMES, DEFAULT_THEME } from './PlanetSphere';

/**
 * Act 2 — the galaxy map. The 6 Skill planets orbit the 9Expert sun on
 * two concentric elliptical rings, implemented with pure CSS:
 *
 *  - The whole orbital plane sits inside one wrapper squashed with
 *    scaleY(SQUASH) — circular rings and circular orbit paths render as
 *    ellipses for free.
 *  - Each planet has its own rotating orbiter (`u9-orbit` keyframes) and
 *    a counter-rotating inner element; a final scaleY(1/SQUASH) undoes
 *    the plane squash so the planet face stays upright and round.
 *  - Starting angles come from negative animation-delays; the base
 *    transform carries the same angle via --u9-angle so reduced-motion
 *    (animation: none) leaves planets distributed, not stacked.
 *
 * The animated layer is aria-hidden (every focusable inside gets
 * tabIndex -1); the semantic index is a visually-hidden (sr-only) list
 * of real skill links — there is no visible fallback grid.
 */

const PLANET_SIZES = [72, 60, 84, 56, 76, 64];

/** diameter as % of the orbital field, period in seconds — 2 rings, 3 planets each */
const RINGS = [
  { diameter: 54, period: 48 },
  { diameter: 92, period: 78 },
];

const SQUASH = 0.72;

function themeFor(planet) {
  return SKILL_THEMES[planet.slug] ?? DEFAULT_THEME;
}

/**
 * Assign planets to rings (3 per ring), with size cycling and a starting
 * angle spread evenly around each ring.
 */
function layoutPlanets(planets) {
  const ringCount = Math.min(RINGS.length, Math.max(1, Math.ceil(planets.length / 3)));
  const counts = Array.from({ length: ringCount }, () => 0);
  planets.forEach((_, i) => {
    counts[i % ringCount] += 1;
  });

  const placed = [];
  let cursor = 0;
  counts.forEach((count, ringIndex) => {
    const ring = RINGS[ringIndex];
    for (let j = 0; j < count; j += 1) {
      const angle = (360 * j) / count + ringIndex * 40;
      placed.push({
        ...planets[cursor],
        index: cursor, // original planets[] index — PlanetVoyage slide order
        size: PLANET_SIZES[cursor % PLANET_SIZES.length],
        diameter: ring.diameter,
        period: ring.period,
        angle,
        delay: -((ring.period * angle) / 360),
      });
      cursor += 1;
    }
  });
  return { placed, ringCount };
}

function PlanetCard({ planet, onNavigate, focusable = true }) {
  const tab = focusable ? undefined : -1;
  return (
    <div className="text-left">
      <p className="font-heading text-sm font-bold text-[#F8FAFD]">{planet.name}</p>
      <p className="mt-0.5 font-thai text-xs text-[#8FA6BC]">{planet.courseCount} หลักสูตร</p>
      {planet.programs.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {planet.programs.slice(0, 4).map((program) => (
            <li key={program.href} className="truncate font-thai text-xs text-[#F8FAFD]/80">
              {program.name}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={planet.href}
        tabIndex={tab}
        onClick={onNavigate}
        className="mt-3 inline-flex items-center gap-1 font-thai text-xs font-semibold text-[#D4F73F] transition-colors hover:text-[#E4FF6B]"
      >
        สำรวจดาวดวงนี้
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </div>
  );
}

export function GalaxyMap({ planets, onPlanetVoyage }) {
  const reduceMotion = useReducedMotion();
  const [hoveredId, setHoveredId] = useState(null);
  const [sheetPlanet, setSheetPlanet] = useState(null);
  const { placed, ringCount } = useMemo(() => layoutPlanets(planets), [planets]);

  // Desktop clicks fly the voyage camera to this planet; below lg the
  // bottom sheet (which is lg:hidden) remains the tap affordance.
  const handlePlanetClick = (planet) => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      onPlanetVoyage?.(planet.index);
    } else {
      setSheetPlanet(planet);
    }
  };

  return (
    <section id="galaxy" className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="text-center">
          <h2 className="font-heading text-3xl font-bold text-[#D4F73F] sm:text-4xl">
            ดาวแห่งทักษะทั้ง {planets.length} ดวง
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-thai text-base text-[#8FA6BC]">
            แต่ละทักษะคือดาวหนึ่งดวงที่โคจรรอบดวงอาทิตย์แห่งความรู้ของ 9Expert
            ชี้หรือแตะที่ดาวเพื่อดูโปรแกรมภายใน
          </p>
        </div>

        {planets.length === 0 ? (
          <p className="mt-24 text-center font-thai text-lg text-[#8FA6BC]">กำลังจัดเรียงดวงดาว…</p>
        ) : (
          <>
            {/* ── Orbital map (decorative — the semantic index is the
                   sr-only list below) ── */}
            <div className="relative mx-auto mt-8 aspect-square w-full max-w-[720px]" aria-hidden="true">
              {/* squashed orbital plane: circles inside become ellipses */}
              <div className="absolute inset-0" style={{ transform: `scaleY(${SQUASH})` }}>
                {RINGS.slice(0, ringCount).map((ring) => (
                  <div
                    key={ring.diameter}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#22405E]"
                    style={{ width: `${ring.diameter}%`, height: `${ring.diameter}%` }}
                  />
                ))}

                {placed.map((planet) => (
                  <div
                    key={planet.id}
                    className="u9-orbiter absolute left-1/2 top-1/2"
                    style={{
                      width: `${planet.diameter}%`,
                      height: `${planet.diameter}%`,
                      '--u9-angle': `${planet.angle}deg`,
                      animationDuration: `${planet.period}s`,
                      animationDelay: `${planet.delay}s`,
                    }}
                  >
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                      <div
                        className="u9-counter"
                        style={{
                          '--u9-angle': `${planet.angle}deg`,
                          animationDuration: `${planet.period}s`,
                          animationDelay: `${planet.delay}s`,
                        }}
                      >
                        {/* undo the plane squash so the sphere stays round */}
                        <div style={{ transform: `scaleY(${1 / SQUASH})` }}>
                          <div
                            className="pointer-events-auto relative"
                            style={{ width: planet.size, height: planet.size }}
                            onMouseEnter={() => setHoveredId(planet.id)}
                            onMouseLeave={() => setHoveredId(null)}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => handlePlanetClick(planet)}
                              className="block h-full w-full cursor-pointer rounded-full transition-transform duration-300 ease-out hover:scale-125"
                            >
                              <PlanetSphere
                                theme={themeFor(planet)}
                                size="100%"
                                detail="simple"
                                className="h-full w-full"
                              />
                            </button>
                            <span className="pointer-events-none absolute left-1/2 top-full mt-2 max-w-[9rem] -translate-x-1/2 truncate font-thai text-xs text-[#8FA6BC]">
                              {planet.name}
                            </span>

                            {/* hover info card — desktop only */}
                            <AnimatePresence mode="popLayout">
                              {hoveredId === planet.id && (
                                <motion.div
                                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
                                  transition={{ duration: 0.18, ease: 'easeOut' }}
                                  className="absolute bottom-full left-1/2 z-30 mb-3 hidden w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-[#132638] p-4 shadow-xl lg:block"
                                >
                                  <PlanetCard planet={planet} focusable={false} />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* the 9Expert sun — layered radial gradients, gentle pulse */}
              <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(36,134,255,0.35) 0%, rgba(36,134,255,0.12) 45%, transparent 70%)',
                  }}
                />
                <div
                  className="u9-sun relative flex h-[90px] w-[90px] items-center justify-center rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle at 38% 34%, #BFE3FF 0%, #48B0FF 32%, #2486FF 70%, rgba(36,134,255,0) 100%)',
                  }}
                >
                  <span className="font-heading text-sm font-bold text-[#0D1B2A]">9Expert</span>
                </div>
              </div>
            </div>

            {/* ── Semantic index for screen readers / crawlers — nothing
                   renders visually (the old card grid is gone) ── */}
            <ul className="sr-only">
              {planets.map((planet) => (
                <li key={planet.id}>
                  <Link href={planet.href}>
                    {planet.name} — {planet.courseCount} หลักสูตร
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── Bottom sheet (tap, < lg) ── */}
      <AnimatePresence>
        {sheetPlanet && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.button
              type="button"
              aria-label="ปิด"
              onClick={() => setSheetPlanet(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="absolute inset-0 h-full w-full bg-[#0D1B2A]/70"
            />
            <motion.div
              role="dialog"
              aria-label={sheetPlanet.name}
              initial={reduceMotion ? { y: 0 } : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[#132638] p-6 pb-10"
            >
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setSheetPlanet(null)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#8FA6BC] transition-colors hover:bg-white/5 hover:text-[#F8FAFD]"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <div className="flex items-start gap-4">
                <PlanetSphere
                  theme={themeFor(sheetPlanet)}
                  size={48}
                  detail="simple"
                  className="mt-1 shrink-0"
                />
                <PlanetCard planet={sheetPlanet} onNavigate={() => setSheetPlanet(null)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes u9-orbit {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes u9-orbit-rev {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes u9-sun-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .u9-orbiter {
          pointer-events: none;
          will-change: transform;
          transform: translate(-50%, -50%) rotate(var(--u9-angle, 0deg));
          animation: u9-orbit linear infinite;
        }
        .u9-counter {
          transform: rotate(calc(var(--u9-angle, 0deg) * -1));
          animation: u9-orbit-rev linear infinite;
        }
        .u9-orbiter:hover {
          z-index: 30;
        }
        .u9-orbiter:hover,
        .u9-orbiter:hover .u9-counter {
          animation-play-state: paused;
        }
        .u9-sun {
          animation: u9-sun-pulse 5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .u9-orbiter,
          .u9-counter,
          .u9-sun {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
