'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, Crown, Lock, Trophy } from 'lucide-react';

import { BOSS_CHAPTER, chapterProgress, currentChapter, firstUnpassedLevel, isChapterComplete, isChapterUnlocked } from '@/lib/play/game/map';

import { SectionHeading } from './HubParts';

/**
 * The Excel Beginner mission map: four nodes (CH.1–3, BOSS) on a curved path.
 *
 * Everything sits in one 1200×560 coordinate space. The SVG path uses it as
 * its viewBox; the nodes are placed at the same points as percentages, and the
 * panel keeps the 1200:560 ratio, so path and nodes line up at any width from
 * lg up. Below lg the nodes become a plain list — the curve has no room there.
 *
 * Lock state comes from the soft rule in lib/play/game/map and is advisory:
 * a locked node is not a link, but the level URLs themselves stay open.
 */

const W = 1200;
const H = 560;
const NODES = [
  { chapter: 1, x: 170, y: 270 },
  { chapter: 2, x: 460, y: 180 },
  { chapter: 3, x: 750, y: 270 },
  { chapter: BOSS_CHAPTER, x: 1030, y: 175 },
];

function segment(a, b) {
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

function nodeState(chapter, levels, progress, current) {
  if (isChapterComplete(chapter, levels, progress)) return 'passed';
  if (!isChapterUnlocked(chapter, levels, progress)) return 'locked';
  if (chapter === current) return 'current';
  return 'open';
}

function Orb({ chapter, state }) {
  const boss = chapter === BOSS_CHAPTER;
  const base = 'relative flex h-[72px] w-[72px] items-center justify-center rounded-full font-en text-2xl font-bold';
  if (state === 'passed') {
    return (
      <span className={`${base} bg-[#D4F73F] text-[#0D1B2A] shadow-[0_0_24px_rgba(212,247,63,0.45)]`}>
        <Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'locked') {
    return (
      <span className={`${base} border-2 border-[#48B0FF] bg-[#0D1B2A] text-[#48B0FF]`}>
        <Lock className="h-6 w-6" aria-hidden="true" />
      </span>
    );
  }
  if (boss) {
    return (
      <span className={`${base} border-2 border-[#D4F73F] bg-[radial-gradient(circle_at_35%_30%,#4FD18F,#1A8A4F_70%)] text-white shadow-[0_0_28px_rgba(79,209,143,0.5)]`}>
        <Crown className="h-8 w-8" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={`${base} bg-[radial-gradient(circle_at_35%_30%,#E9FF8A,#D4F73F_45%,#9DBA1F)] text-[#0D1B2A] shadow-[0_0_32px_rgba(212,247,63,0.55)]`}>
      {state === 'current' && (
        <span className="absolute -inset-2 rounded-full border-2 border-dashed border-[#D4F73F]/70" aria-hidden="true" />
      )}
      {chapter}
    </span>
  );
}

function Label({ chapter, name, levels, progress }) {
  const boss = chapter === BOSS_CHAPTER;
  const ls = levels.filter((l) => l.chapter === chapter).sort((a, b) => a.order - b.order);
  return (
    <span className="mt-1 flex w-[168px] flex-col items-center rounded-[14px] border border-white/10 bg-[#0D1B2A]/90 px-3 py-2 text-center">
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D4F73F]/15 px-2 py-0.5 font-en text-[11px] font-bold text-[#D4F73F]">
        {boss ? (
          <>
            <Trophy className="h-3 w-3" aria-hidden="true" /> BOSS
          </>
        ) : (
          `CH.${chapter}`
        )}
      </span>
      <span className="mt-1 font-heading text-sm font-bold leading-snug text-white">{boss ? name.replace(/^BOSS\s*/, '') : name}</span>
      {boss ? (
        <span className="mt-1 text-xs text-white/60">ภารกิจพิเศษ</span>
      ) : (
        <span className="mt-1.5 flex gap-1" aria-hidden="true">
          {ls.map((l) => (
            <span key={l.id} className={`h-2 w-2 rounded-full ${progress[l.id] ? 'bg-[#D4F73F]' : 'border border-white/30'}`} />
          ))}
        </span>
      )}
    </span>
  );
}

function platformFor(chapter, state) {
  if (chapter === BOSS_CHAPTER) return '/play/map/base-boss.webp';
  return state === 'locked' ? '/play/map/base-locked.webp' : '/play/map/base-active.webp';
}

function nodeLabel(chapter, name, state, counts) {
  const what = chapter === BOSS_CHAPTER ? 'บอส' : `บทที่ ${chapter} ${name}`;
  const status = { passed: 'ผ่านครบแล้ว', locked: 'ยังไม่ปลดล็อก', current: 'บทปัจจุบัน', open: 'เปิดแล้ว' }[state];
  return `${what} · ${status}${counts ? ` · ผ่าน ${counts.passed}/${counts.total} ด่าน` : ''}`;
}

export function MissionMap({ levels, chapterNames, progress }) {
  const current = currentChapter(levels, progress);
  const counts = chapterProgress(levels, progress);
  const nodes = NODES.map((n) => ({
    ...n,
    name: chapterNames[n.chapter],
    state: nodeState(n.chapter, levels, progress, current),
    href: `/play/excel/beginner/${firstUnpassedLevel(n.chapter, levels, progress)}`,
  }));
  const currentIndex = Math.max(0, nodes.findIndex((n) => n.chapter === current));
  const allDone = nodes.every((n) => n.state === 'passed');
  const mascotNode = nodes[currentIndex];

  return (
    <section id="map" aria-labelledby="play-map-title" className="mt-28 scroll-mt-28">
      <SectionHeading id="play-map-title" title="Mission map" accent="beginner" sub="แผนที่ภารกิจของดาวที่คุณเลือก · ตอนนี้คือดาว Excel" />

      <div className="relative mt-12 overflow-hidden rounded-[32px] border border-[#48B0FF]/30 bg-[linear-gradient(180deg,#0B1726_0%,#0D1B2A_45%,#102a45_100%)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 30px 40px, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 150px 120px, rgba(255,255,255,0.35), transparent), radial-gradient(1.5px 1.5px at 260px 60px, rgba(212,247,63,0.4), transparent)',
            backgroundSize: '300px 200px',
          }}
        />
        <Image
          src="/play/map/horizon.webp"
          alt=""
          width={2400}
          height={500}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-auto w-full object-contain object-bottom"
        />

        <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 pt-6 md:px-8">
          <div className="flex items-center gap-3">
            <span className="h-10 w-1.5 rounded-full bg-[#D4F73F]" aria-hidden="true" />
            <Image src="/play/icon-excel.webp" alt="" width={96} height={96} className="h-10 w-10 rounded-[8px]" />
            <div className="leading-tight">
              <p className="font-en text-sm font-bold uppercase tracking-widest text-[#D4F73F]">Planet 01 : Excel</p>
              <p className="font-heading text-base font-bold text-white">Excel แสนสนุก</p>
            </div>
          </div>
          <ul className="flex items-center gap-1 rounded-full bg-white/5 p-1 text-sm" aria-label="ระดับ">
            <li>
              <span aria-current="true" className="block rounded-full bg-[#D4F73F] px-4 py-1.5 font-bold text-[#0D1B2A]">Beginner</span>
            </li>
            {['Intermediate', 'Advanced'].map((s) => (
              <li key={s}>
                <span className="inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-white/40" aria-label={`${s} · ยังไม่เปิด`}>
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {s}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* lg+: the curved map */}
        <div className="relative hidden aspect-[1200/560] w-full lg:block">
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
            <defs>
              <filter id="play-path-glow" x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            {nodes.slice(1).map((n, i) => {
              const d = segment(nodes[i], n);
              const solid = allDone || i < currentIndex;
              return (
                <g key={n.chapter} data-play-segment={solid ? 'solid' : 'dashed'}>
                  <path d={d} stroke="#D4F73F" strokeOpacity={solid ? 0.5 : 0.25} strokeWidth="10" filter="url(#play-path-glow)" />
                  <path
                    d={d}
                    stroke="#D4F73F"
                    strokeOpacity={solid ? 1 : 0.7}
                    strokeWidth={solid ? 5 : 3}
                    strokeLinecap="round"
                    strokeDasharray={solid ? undefined : '10 12'}
                  />
                </g>
              );
            })}
          </svg>

          {mascotNode && (
            <div
              className="pointer-events-none absolute w-[9%]"
              style={{
                left: `${((mascotNode.chapter === BOSS_CHAPTER ? mascotNode.x - 230 : mascotNode.x + 95) / W) * 100}%`,
                top: `${((mascotNode.y - 150) / H) * 100}%`,
              }}
              aria-hidden="true"
            >
              <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[12px] bg-white px-3 py-1 text-sm font-bold text-[#0D1B2A] shadow-lg">
                เริ่มภารกิจ!
              </span>
              <Image src="/play/mascot-wave.webp" alt="" width={720} height={800} className="h-auto w-full object-contain" />
            </div>
          )}

          <ol className="contents">
            {nodes.map((n) => {
              const label = nodeLabel(n.chapter, n.name, n.state, n.chapter === BOSS_CHAPTER ? null : counts[n.chapter]);
              const body = (
                <>
                  <span className="relative z-10">
                    <Orb chapter={n.chapter} state={n.state} />
                  </span>
                  <Image
                    src={platformFor(n.chapter, n.state)}
                    alt=""
                    width={880}
                    height={720}
                    className="-mt-8 h-auto w-[190px] object-contain"
                  />
                  <span className="-mt-10">
                    <Label chapter={n.chapter} name={n.name} levels={levels} progress={progress} />
                  </span>
                </>
              );
              const place = {
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
              };
              const cls = 'absolute flex -translate-x-1/2 -translate-y-9 flex-col items-center';
              return (
                <li key={n.chapter} style={place} className={cls} data-play-node={n.state}>
                  {n.state === 'locked' ? (
                    <div aria-label={label} aria-disabled="true" className="flex flex-col items-center opacity-90">
                      {body}
                    </div>
                  ) : (
                    <Link
                      href={n.href}
                      aria-label={label}
                      className="group flex flex-col items-center rounded-[20px] transition-transform duration-300 ease-9e hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F] motion-reduce:transition-none"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* below lg: the same nodes as a list */}
        <ol className="relative flex flex-col gap-3 p-6 lg:hidden">
          {nodes.map((n) => {
            const inner = (
              <>
                <span className="shrink-0 scale-75">
                  <Orb chapter={n.chapter} state={n.state} />
                </span>
                <Label chapter={n.chapter} name={n.name} levels={levels} progress={progress} />
              </>
            );
            const label = nodeLabel(n.chapter, n.name, n.state, n.chapter === BOSS_CHAPTER ? null : counts[n.chapter]);
            return (
              <li key={n.chapter}>
                {n.state === 'locked' ? (
                  <div aria-label={label} aria-disabled="true" className="flex items-center gap-3">
                    {inner}
                  </div>
                ) : (
                  <Link href={n.href} aria-label={label} className="flex items-center gap-3 rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F]">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <div className="h-6 lg:hidden" />
      </div>
    </section>
  );
}
