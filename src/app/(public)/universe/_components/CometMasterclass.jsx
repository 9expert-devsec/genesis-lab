'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Act 4 — ดาวหาง Masterclass. Masterclasses come in limited batches,
 * like a comet you have to wait for. One decorative comet streaks
 * diagonally across the section when it first enters the viewport
 * (IntersectionObserver + CSS transform animation, ~2.2s), then parks
 * top-right with a gentle infinite drift. Reduced motion: parked, no
 * fly-in, no drift. The comet layer is aria-hidden; the real content
 * is the batch cards.
 */

function formatPrice(value) {
  if (value == null) return null;
  return `${Number(value).toLocaleString('th-TH')} บาท`;
}

export function CometMasterclass({ comets }) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!comets || comets.length === 0) return null;

  const cardEntrance = (i) =>
    reduceMotion
      ? { initial: false }
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.3 },
          transition: { duration: 0.55, delay: i * 0.12, ease: 'easeOut' },
        };

  return (
    <section ref={sectionRef} className="relative min-h-[80svh] overflow-hidden py-24">
      {/* ambient blue glow — keeps the seam with the voyage invisible */}
      <div
        className="pointer-events-none absolute -right-[20%] top-[10%] h-[70vh] w-[70vw]"
        style={{ background: 'radial-gradient(closest-side, rgba(0,92,255,0.14), transparent 70%)' }}
      />

      {/* ── the comet (decorative) ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            'absolute right-[10%] top-[16%]',
            !entered && !reduceMotion && 'opacity-0',
            entered && !reduceMotion && 'u9c-fly',
            reduceMotion && 'opacity-100'
          )}
        >
          <div className="relative" style={{ transform: 'rotate(-26deg)' }}>
            {/* tail — layered lime → transparent streaks, skewed */}
            <div
              className="absolute right-3 top-1/2 h-[2px] w-52 -translate-y-1/2"
              style={{ background: 'linear-gradient(to left, rgba(212,247,63,0.85), transparent)' }}
            />
            <div
              className="absolute right-3 top-1/2 h-[6px] w-36 -translate-y-1/2"
              style={{
                background: 'linear-gradient(to left, rgba(212,247,63,0.4), transparent)',
                transform: 'translateY(-50%) skewY(-4deg)',
              }}
            />
            <div
              className="absolute right-2 top-1/2 h-[12px] w-24 -translate-y-1/2"
              style={{
                background: 'linear-gradient(to left, rgba(72,176,255,0.28), transparent)',
                transform: 'translateY(-50%) skewY(5deg)',
              }}
            />
            {/* head — ice-white core, lime glow ring (gradients only) */}
            <div
              className="absolute right-0 top-1/2 h-10 w-10 -translate-y-1/2 translate-x-1/2"
              style={{
                background:
                  'radial-gradient(circle, rgba(212,247,63,0.5) 0%, rgba(212,247,63,0.15) 45%, transparent 70%)',
              }}
            />
            <div
              className="relative ml-auto h-4 w-4 rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 40% 40%, #FFFFFF 0%, #F8FAFD 40%, rgba(212,247,63,0.9) 75%, rgba(212,247,63,0) 100%)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-widest text-9e-lime">ปรากฏการณ์พิเศษ</p>
          <h2 className="mt-3 font-heading text-3xl font-bold text-9e-ice sm:text-4xl">
            ดาวหาง Masterclass
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-thai text-base text-[#8FA6BC]">
            คลาสพิเศษที่มาเป็นรอบ ๆ และมีที่นั่งจำกัด — เหมือนดาวหางที่ต้องรอให้โคจรมาถึง
          </p>
        </div>

        {/* ── comet cards ── */}
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {comets.map((comet, i) => (
            <motion.article
              key={comet.slug}
              {...cardEntrance(i)}
              className="flex h-full flex-col rounded-9e-lg border border-white/10 border-t-2 border-t-9e-lime/60 bg-9e-card p-6"
            >
              <h3 className="font-heading text-lg font-bold text-9e-ice">{comet.title_th}</h3>
              {comet.subtitle_th && (
                <p className="mt-1 line-clamp-1 font-thai text-sm text-[#8FA6BC]">
                  {comet.subtitle_th}
                </p>
              )}

              <div className="mt-4 flex items-start gap-2 font-thai text-sm text-9e-ice/85">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-9e-air" strokeWidth={1.75} />
                <span>
                  {comet.batchLabel}
                  {comet.dayLabels.length > 0 && (
                    <span className="block text-xs text-[#8FA6BC]">
                      {comet.dayLabels.join(' · ')}
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {comet.isEarlyBird && (
                  <span className="rounded-full bg-9e-lime px-2.5 py-0.5 text-xs font-semibold text-9e-navy">
                    Early Bird
                  </span>
                )}
                {comet.effectivePrice != null && (
                  <span className="font-heading text-lg font-bold text-9e-ice">
                    {formatPrice(comet.effectivePrice)}
                  </span>
                )}
                {comet.isEarlyBird &&
                  comet.originalPrice != null &&
                  comet.originalPrice !== comet.effectivePrice && (
                    <span className="font-thai text-sm text-[#8FA6BC] line-through">
                      {formatPrice(comet.originalPrice)}
                    </span>
                  )}
              </div>

              {comet.isFull ? (
                <span className="mt-3 inline-flex w-fit rounded-full border border-white/15 px-2.5 py-0.5 font-thai text-xs text-[#8FA6BC]">
                  เต็มแล้ว
                </span>
              ) : (
                comet.seatsLeft <= 10 && (
                  <span className="mt-3 font-thai text-xs font-semibold text-9e-lime">
                    เหลือ {comet.seatsLeft} ที่นั่ง
                  </span>
                )
              )}

              <div className="mt-auto pt-6">
                <Link href={comet.href} className="btn-9e-cta w-full font-thai">
                  จองที่นั่ง
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              </div>
            </motion.article>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes u9c-fly {
          0% { transform: translate(-70vw, 48vh); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(0, 0); opacity: 1; }
        }
        @keyframes u9c-float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-9px, 7px); }
        }
        .u9c-fly {
          animation:
            u9c-fly 2.2s cubic-bezier(0.16, 1, 0.3, 1) both,
            u9c-float 7s ease-in-out 2.2s infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .u9c-fly {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </section>
  );
}
