'use client';

import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Starfield } from './Starfield';
import { GalaxyMap } from './GalaxyMap';
import { PlanetVoyage } from './PlanetVoyage';
import { CometMasterclass } from './CometMasterclass';
import { CareerConstellation } from './CareerConstellation';
import { UniverseLanding } from './UniverseLanding';

/**
 * "Universe of 9Expert Training" — client experience.
 *
 * Act 1: full-viewport warp starfield hero; content fades in after the
 * warp settles (~1.3s), instantly under prefers-reduced-motion.
 * Act 2: the interactive galaxy map (see GalaxyMap.jsx).
 *
 * The page is always deep navy regardless of the site theme toggle.
 * No filter: blur() anywhere — nebulae are pure CSS radial gradients
 * (Tailwind blur utilities break GPU compositing on iOS Safari).
 */
export function UniverseClient({ planets, comets = [], constellations = [], stats = [] }) {
  const reduceMotion = useReducedMotion();
  const totalCourses = planets.reduce((sum, p) => sum + (p.courseCount || 0), 0);
  // Populated by PlanetVoyage once its ScrollTrigger exists; GalaxyMap
  // desktop clicks fly the camera to the chosen planet through this ref.
  const voyageApiRef = useRef(null);

  const heroEntrance = reduceMotion
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: 1.3, duration: 0.7, ease: 'easeOut' },
      };

  return (
    <div className="bg-[#0D1B2A] text-[#F8FAFD]">
      {/* ── Act 1 — warp starfield hero ─────────────────────────── */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        {/* nebulae — pure radial gradients only */}
        <div
          className="pointer-events-none absolute -left-[15%] top-[-10%] h-[60vh] w-[60vw]"
          style={{ background: 'radial-gradient(closest-side, rgba(0,92,255,0.22), transparent 72%)' }}
        />
        <div
          className="pointer-events-none absolute -right-[10%] bottom-[-15%] h-[55vh] w-[55vw]"
          style={{ background: 'radial-gradient(closest-side, rgba(36,134,255,0.14), transparent 70%)' }}
        />

        <Starfield className="absolute inset-0 h-full w-full" />

        <motion.div className="relative z-10 mx-auto max-w-3xl px-6 py-24 text-center" {...heroEntrance}>
          <p className="text-sm font-semibold tracking-widest text-[#D4F73F]">
            UNIVERSE OF LEARNING TECHNOLOGY
          </p>
          <h1 className="mt-4 font-heading text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            จักรวาลแห่งการเรียนรู้
            <span className="mt-2 block bg-gradient-to-r from-[#2486FF] to-[#48B0FF] bg-clip-text text-transparent">
              Universe of 9Expert Training
            </span>
          </h1>
          <p className="mt-6 font-thai text-base text-[#8FA6BC] sm:text-lg">
            {planets.length > 0
              ? `ออกเดินทางสำรวจดาวแห่งทักษะทั้ง ${planets.length} ดวง พร้อมหลักสูตรกว่า ${totalCourses} หลักสูตร ที่โคจรอยู่ในจักรวาลแห่งการเรียนรู้ของ 9Expert`
              : 'ออกเดินทางสำรวจจักรวาลแห่งการเรียนรู้ของ 9Expert ที่ซึ่งทุกทักษะคือดวงดาวที่รอให้คุณค้นพบ'}
          </p>
          <a
            href="#galaxy"
            aria-label="เลื่อนลงไปยังแผนที่จักรวาล"
            className="u9-bounce mt-12 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-[#8FA6BC] transition-colors hover:border-[#D4F73F] hover:text-[#D4F73F]"
          >
            <ChevronDown className="h-5 w-5" strokeWidth={1.75} />
          </a>
        </motion.div>
      </section>

      {/* ── Act 2 — galaxy map ──────────────────────────────────── */}
      <GalaxyMap
        planets={planets}
        onPlanetVoyage={(i) => voyageApiRef.current?.scrollToPlanet(i)}
      />

      {/* ── Act 3 — planet voyage ───────────────────────────────── */}
      <PlanetVoyage planets={planets} apiRef={voyageApiRef} />

      {/* ── Act 4 — masterclass comet ───────────────────────────── */}
      <CometMasterclass comets={comets} />

      {/* ── Act 5 — career constellation ────────────────────────── */}
      <CareerConstellation constellations={constellations} />

      {/* ── Act 6 — stats + final CTA ───────────────────────────── */}
      <UniverseLanding stats={stats} />

      <style>{`
        @keyframes u9-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        .u9-bounce {
          animation: u9-bounce 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .u9-bounce {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
