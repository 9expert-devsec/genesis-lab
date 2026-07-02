'use client';

import Link from 'next/link';
import CountUp from 'react-countup';
import { useReducedMotion } from 'framer-motion';
import { CalendarDays, Rocket } from 'lucide-react';

/**
 * Act 6 — landing. The canonical company stats (same figures as
 * about-us) count up once on scroll into view, then the final CTA pair
 * hands the visitor off to the course catalog or the schedule. A static
 * sparse star layer + one recurring shooting star close out the sky.
 * Reduced motion: values render statically, no shooting star.
 */
export function UniverseLanding({ stats }) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden pb-32 pt-24">
      {/* ambient glow + static star layer */}
      <div
        className="pointer-events-none absolute left-1/2 top-[35%] h-[80vh] w-[90vw] -translate-x-1/2"
        style={{ background: 'radial-gradient(closest-side, rgba(0,92,255,0.12), transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(248,250,253,0.4) 1px, transparent 1.6px)',
          backgroundSize: '240px 190px',
        }}
      />

      {/* shooting star — fires every ~14s, absent under reduced motion */}
      {!reduceMotion && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="u9l-shooting absolute right-[12%] top-[18%] h-[2px] w-28"
            style={{ background: 'linear-gradient(to left, rgba(248,250,253,0.9), transparent)' }}
          />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-6">
        {/* ── stats band ── */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-10 border-y border-white/10 py-12 text-center sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dd className="font-heading text-4xl font-bold text-9e-lime lg:text-5xl">
                {reduceMotion ? (
                  `${stat.value.toFixed(stat.decimals || 0)}${stat.suffix || ''}`
                ) : (
                  <CountUp
                    end={stat.value}
                    suffix={stat.suffix || ''}
                    decimals={stat.decimals || 0}
                    duration={2}
                    enableScrollSpy
                    scrollSpyOnce
                  />
                )}
              </dd>
              <dt className="mt-2 font-thai text-sm text-[#8FA6BC]">{stat.label}</dt>
            </div>
          ))}
        </dl>

        {/* ── final CTA ── */}
        <div className="mt-24 text-center">
          <h2 className="font-heading text-4xl font-bold text-9e-ice sm:text-5xl">
            เริ่มการเดินทางของคุณ
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-thai text-base text-[#8FA6BC] sm:text-lg">
            จักรวาลแห่งการเรียนรู้เปิดกว้างเสมอ — เลือกดาวดวงแรกของคุณ แล้วออกเดินทางไปกับเรา
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/training-course" className="btn-9e-cta font-thai">
              <Rocket className="h-4 w-4" strokeWidth={2} />
              ดูหลักสูตรทั้งหมด
            </Link>
            <Link
              href="/schedule"
              className="inline-flex items-center justify-center gap-2 rounded-9e-xl border border-[#48B0FF] px-6 py-3 font-thai font-semibold text-[#48B0FF] transition-colors duration-9e-micro ease-9e hover:bg-[#48B0FF] hover:text-9e-navy"
            >
              <CalendarDays className="h-4 w-4" strokeWidth={2} />
              ดูตารางอบรม
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes u9l-shoot {
          0% { transform: translate(0, 0) rotate(-26deg); opacity: 0; }
          2% { opacity: 1; }
          11% { transform: translate(-340px, 170px) rotate(-26deg); opacity: 0; }
          100% { transform: translate(-340px, 170px) rotate(-26deg); opacity: 0; }
        }
        .u9l-shooting {
          animation: u9l-shoot 14s linear 4s infinite;
          opacity: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .u9l-shooting {
            animation: none !important;
            opacity: 0 !important;
          }
        }
      `}</style>
    </section>
  );
}
