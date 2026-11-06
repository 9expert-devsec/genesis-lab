'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Crown, Lock, Rocket, Trophy } from 'lucide-react';

import { BOSS_CHAPTER, chapterProgress, currentChapter, firstUnpassedLevel, isChapterComplete, isChapterUnlocked, levelHref } from '@/lib/play/game/map';
import { seriesProgress } from '@/lib/play/game/progress';

import { SectionHeading } from './HubParts';
import m from './mapMotion.module.css';

/**
 * The Excel mission map: four nodes (CH.1–3, BOSS) on a curved path, for the
 * tier picked in the tabs. The route and the lime elements are the same on every
 * tier; TIER_THEME holds what changes.
 *
 * TWO STAGES, ONE SET OF RULES. ≥768px the nodes run left→right on a
 * 1200×640 stage; below 768px they run top→bottom, zig-zagging, on a 360×1110
 * stage. Each stage is laid out in its own fixed pixel space — the SVG viewBox
 * and the HTML nodes share those units 1:1 — and the whole stage is scaled to
 * the panel width (ResizeObserver → `--s`). So the geometry is exact at every
 * width and the labels never collide as the panel narrows.
 *
 * NODE GEOMETRY comes from the platform art (880×720, content in the lower
 * half): the visible platform is centred at 50% across and PLATFORM_CY down,
 * its top surface starts at ≈45% and its base ends at ≈93%. A node's (x, y)
 * is that visible centre, so the path joins the platforms themselves. The orb
 * is anchored by its BOTTOM to the top surface and the label by its TOP to the
 * base — they stay on the platform whatever the scale. The pulse ring is centred
 * on the top disc (DISC_CY), not on the image or on the visible platform: both
 * of those are pulled off the disc by the crystals, the rim's depth and the
 * shadow. Both platform images share the same disc.
 *
 * MOTION lives in mapMotion.module.css (entrance once at 30% visibility,
 * ambient loops paused off-screen, mouse-only hover, all static under reduced
 * motion). Nothing follows the pointer.
 *
 * Lock state comes from the soft rule in lib/play/game/map and is advisory:
 * a locked node is not a link, but the level URLs themselves stay open. A
 * `comingSoon` chapter is locked whatever the player has passed: it has no levels.
 */

const COMING_SOON = 'เร็วๆ นี้';

// Whole class names, so Tailwind's scanner sees every one.
const TIER_THEME = {
  beginner: {
    bg: null,
    baseSuffix: '',
    panel: 'border-[#48B0FF]/30 bg-[linear-gradient(180deg,#0B1726_0%,#0D1B2A_45%,#102a45_100%)]',
    tabs: 'bg-white/5',
    tabIdle: 'text-white/40',
    label: 'border-white/10 bg-[#0D1B2A]/90',
    lock: 'border-[#48B0FF] bg-[#0D1B2A] text-[#48B0FF]',
    lockGlow: 'shadow-[0_0_18px_rgba(72,176,255,0.7)]',
    lockRing: 'focus-visible:ring-[#48B0FF]',
    tip: 'bg-[#0D1B2A] text-[#48B0FF] ring-[#48B0FF]/40',
    lockedOrb: 'h-[72px] w-[72px]',
    bossOrb: 'h-[72px] w-[72px]',
    bossCrownAlways: false,
  },
  intermediate: {
    bg: '/play/map/map-bg-intermediate.webp',
    baseSuffix: '-intermediate',
    panel: 'border-[#BF75FF]/40 bg-[linear-gradient(180deg,#0D0823_0%,#281041_60%,#0D0823_100%)]',
    tabs: 'border border-[#BF75FF]/40 bg-[#0D0823]/75',
    tabIdle: 'text-white/70',
    label: 'border-[#BF75FF] bg-[#170B33]',
    lock: 'border-[#BF75FF] bg-[#0D0823]/[0.92] text-[#BF75FF]',
    lockGlow: 'shadow-[0_0_18px_rgba(191,117,255,0.7)]',
    lockRing: 'focus-visible:ring-[#BF75FF]',
    tip: 'bg-[#170B33] text-[#BF75FF] ring-[#BF75FF]/40',
    lockedOrb: 'h-[58px] w-[58px]',
    bossOrb: 'h-[82px] w-[82px]',
    bossCrownAlways: true,
  },
  advanced: {
    bg: '/play/map/map-bg-advanced.webp',
    baseSuffix: '-advanced',
    panel: 'border-[#FF6231]/40 bg-[linear-gradient(180deg,#1B0506_0%,#3E0D0A_60%,#1B0506_100%)]',
    tabs: 'border border-[#FF6231]/40 bg-[#1B0506]/75',
    tabIdle: 'text-white/70',
    label: 'border-[#FF6231] bg-[#290808]',
    lock: 'border-[#FF6231] bg-[#1B0506]/[0.92] text-[#FF6231]',
    lockGlow: 'shadow-[0_0_18px_rgba(255,98,49,0.7)]',
    lockRing: 'focus-visible:ring-[#FF6231]',
    tip: 'bg-[#290808] text-[#FF6231] ring-[#FF6231]/40',
    lockedOrb: 'h-[58px] w-[58px]',
    bossOrb: 'h-[82px] w-[82px]',
    bossCrownAlways: true,
  },
};

const PLATFORM_RATIO = 720 / 880;
const PLATFORM_CY = 0.69; // visible centre of the platform, down the image
const PLATFORM_TOP_FACE = 0.5; // where an orb's bottom rests (rim at ≈0.45)
const PLATFORM_BASE = 0.93; // bottom of the visible platform
const PLATFORM_SIDE = 0.07; // visible left/right edge inset, across the image
const DISC_CY = 0.605; // centre of the disc's rings, down the image (50% across)
const DISC_RATIO = 3.65; // width ÷ height of those rings
const LABEL_GAP = 10;
const LABEL_W = 168;

// Rhythm: CH.1 low-left, CH.2 a little higher, CH.3 lower, BOSS highest and larger.
const WIDE = {
  key: 'wide',
  W: 1200,
  H: 640,
  vertical: false,
  nodes: [
    { chapter: 1, x: 230, y: 310, w: 220 },
    { chapter: 2, x: 500, y: 240, w: 220 },
    // The route climbs through where the rocket's flame would be, so it hovers higher here.
    { chapter: 3, x: 780, y: 330, w: 220, mascotLift: 36 },
    { chapter: BOSS_CHAPTER, x: 1040, y: 210, w: 260 },
  ],
  mascotW: 108,
};

// Phones: top→bottom, zig-zagging between two columns. Each leg leaves its
// node sideways toward the next column and then turns down into the next
// platform, so it never runs under its own node. Labels sit under each
// platform pushed to the panel's OUTER edge, which keeps them clear of the
// path; the mascot stands on the inner side. Rows are 280px apart so the
// mascot's bubble clears the label above it.
const TALL = {
  key: 'tall',
  W: 360,
  H: 1260,
  vertical: true,
  nodes: [
    { chapter: 1, x: 100, y: 180, w: 150 },
    { chapter: 2, x: 260, y: 460, w: 150 },
    { chapter: 3, x: 100, y: 740, w: 150 },
    { chapter: BOSS_CHAPTER, x: 260, y: 1020, w: 170 },
  ],
  mascotW: 72,
  labelInset: 12,
};

/** The platform image box and the anchor points derived from it, in stage px. */
function nodeBox(n) {
  const h = n.w * PLATFORM_RATIO;
  const top = n.y - PLATFORM_CY * h;
  const left = n.x - n.w / 2;
  return {
    left,
    top,
    h,
    face: top + PLATFORM_TOP_FACE * h,
    visibleLeft: left + PLATFORM_SIDE * n.w,
    visibleRight: left + (1 - PLATFORM_SIDE) * n.w,
  };
}

/**
 * One leg of the route. Wide stage: a horizontal S-curve. Tall stage: out
 * sideways along the node's own row, then down into the next platform (both
 * control points at the corner give a smooth quarter bend).
 */
function segment(a, b, vertical) {
  if (vertical) return `C ${b.x} ${a.y}, ${b.x} ${a.y}, ${b.x} ${b.y}`;
  const mx = (a.x + b.x) / 2;
  return `C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

function route(nodes, upto, vertical) {
  let d = `M${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i <= upto; i += 1) d += ` ${segment(nodes[i - 1], nodes[i], vertical)}`;
  return d;
}

function nodeState(chapter, levels, progress, current) {
  if (isChapterComplete(chapter, levels, progress)) return 'passed';
  if (!isChapterUnlocked(chapter, levels, progress)) return 'locked';
  if (chapter === current) return 'current';
  return 'open';
}

function Orb({ chapter, state, theme }) {
  const boss = chapter === BOSS_CHAPTER;
  const size = boss ? theme.bossOrb : state === 'locked' ? theme.lockedOrb : 'h-[72px] w-[72px]';
  const base = `relative flex ${size} items-center justify-center rounded-full font-en text-2xl font-bold`;
  if (state === 'passed') {
    return (
      <span className={`${base} bg-[#D4F73F] text-[#0D1B2A] shadow-[0_0_24px_rgba(212,247,63,0.45)]`}>
        <Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'locked' && !(boss && theme.bossCrownAlways)) {
    return (
      <span className={`${base} border-2 ${theme.lock}`}>
        <span className={`absolute -inset-1.5 rounded-full ${theme.lockGlow} ${m.breathe}`} aria-hidden="true" />
        <Lock className="relative h-6 w-6" aria-hidden="true" />
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
        <span className={`absolute -inset-2 rounded-full border-2 border-dashed border-[#D4F73F]/70 ${m.spin}`} aria-hidden="true" />
      )}
      {chapter}
    </span>
  );
}

function Label({ chapter, name, dots, levels, progress, theme }) {
  const boss = chapter === BOSS_CHAPTER;
  const ls = levels.filter((l) => l.chapter === chapter).sort((a, b) => a.order - b.order);
  return (
    <span
      className={`flex flex-col items-center rounded-[14px] border px-3 py-2 text-center ${theme.label}`}
      style={{ width: LABEL_W }}
    >
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
          {Array.from({ length: dots ?? 0 }, (_, i) => (
            <span key={i} className="h-2 w-2 rounded-full border border-white/30" />
          ))}
        </span>
      )}
    </span>
  );
}

function platformFor(chapter, state, theme) {
  const kind = chapter === BOSS_CHAPTER ? 'boss' : state === 'locked' ? 'locked' : 'active';
  return `/play/map/base-${kind}${theme.baseSuffix}.webp`;
}

function nodeLabel(chapter, name, state, counts, comingSoon) {
  const what = chapter === BOSS_CHAPTER ? 'บอส' : `บทที่ ${chapter} ${name}`;
  const status = comingSoon ? COMING_SOON : { passed: 'ผ่านครบแล้ว', locked: 'ยังไม่ปลดล็อก', current: 'บทปัจจุบัน', open: 'เปิดแล้ว' }[state];
  return `${what} · ${status}${counts ? ` · ผ่าน ${counts.passed}/${counts.total} ด่าน` : ''}`;
}

function lockedHint(chapter, comingSoon) {
  if (comingSoon) return COMING_SOON;
  return chapter === BOSS_CHAPTER ? 'ผ่านครบ 3 บทเพื่อปลดล็อก' : `ผ่าน CH.${chapter - 1} ให้ครบก่อน`;
}

/** Scales a fixed W×H stage to its container's width. Height is set by aspect-ratio, so nothing jumps before JS. */
function ScaledStage({ W, H, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) el.style.setProperty('--s', String(w / W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);
  return (
    <div ref={ref} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: 'scale(var(--s, 1))' }}>
        {children}
      </div>
    </div>
  );
}

function Stage({ layout, states, levels, progress, counts, currentIndex, allDone, theme }) {
  const { W, H, vertical, key } = layout;
  const nodes = layout.nodes.map((n, i) => ({ ...n, ...states[i] }));
  const full = route(nodes, nodes.length - 1, vertical);
  const doneUpto = allDone ? nodes.length - 1 : currentIndex;
  const mascotNode = nodes[currentIndex];
  const maskId = `play-map-${key}-reveal`;
  const glowId = `play-map-${key}-glow`;

  return (
    <ScaledStage W={W} H={H}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0" fill="none" aria-hidden="true">
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          {/* Entrance: a solid copy of the whole route, drawn CH.1 → BOSS, masks the real path in. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <path d={full} stroke="white" strokeWidth="60" strokeLinecap="round" pathLength="1" strokeDasharray="1" className={m.drawMask} />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {nodes.slice(1).map((n, i) => {
            const d = `M${nodes[i].x} ${nodes[i].y} ${segment(nodes[i], n, vertical)}`;
            const solid = i < doneUpto;
            return (
              <g key={n.chapter} data-play-segment={solid ? 'solid' : 'dashed'}>
                <path d={d} stroke="#D4F73F" strokeOpacity={solid ? 0.5 : 0.25} strokeWidth="10" filter={`url(#${glowId})`} />
                <path
                  d={d}
                  stroke="#D4F73F"
                  strokeOpacity={solid ? 1 : 0.7}
                  strokeWidth={solid ? 5 : 3}
                  strokeLinecap="round"
                  strokeDasharray={solid ? undefined : '10 12'}
                  className={solid ? undefined : m.flow}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {doneUpto > 0 && (
        // Stage px == SVG units, so the completed route works directly as an offset-path.
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-[#ECFF9C] shadow-[0_0_10px_3px_rgba(212,247,63,0.85)] ${m.spark}`}
          style={{ offsetPath: `path("${route(nodes, doneUpto, vertical)}")`, marginLeft: -5, marginTop: -5 }}
        />
      )}

      {mascotNode && (() => {
        // Hull level with the current platform's top surface, beside it. The
        // art fills its square, and its nose is on the right: from the left the
        // nose tucks over the platform's edge, and on the tall stage's open right
        // side the rocket starts past the edge so the flame stays off the platform.
        const box = nodeBox(mascotNode);
        const right = vertical && mascotNode.x < W / 2;
        const left = right ? box.visibleRight : box.visibleLeft + 0.2 * layout.mascotW;
        return (
          <div
            className={`pointer-events-none absolute z-20 ${right ? '' : '-translate-x-full'} -translate-y-full`}
            style={{ left, top: box.face - (mascotNode.mascotLift ?? 0), width: layout.mascotW }}
            data-play-mascot=""
            aria-hidden="true"
          >
            <div className={m.bob}>
              {mascotNode.state !== 'locked' && (
                <span className={`absolute -top-8 left-1/2 -ml-[45px] whitespace-nowrap rounded-[12px] bg-white px-3 py-1 text-sm font-bold text-[#0D1B2A] shadow-lg ${m.bubble}`}>
                  เริ่มภารกิจ!
                </span>
              )}
              <Image src="/play/hero-rocket.webp" alt="" width={1240} height={1240} sizes={`${layout.mascotW}px`} className="h-auto w-full object-contain" />
            </div>
          </div>
        );
      })()}

      <ol className="contents">
        {nodes.map((n, i) => {
          const label = nodeLabel(n.chapter, n.name, n.state, n.chapter === BOSS_CHAPTER ? null : counts[n.chapter], n.comingSoon);
          const box = nodeBox(n);
          const boss = n.chapter === BOSS_CHAPTER;
          const live = n.state === 'current';
          const body = (
            <>
              {/* hover glow — opacity only */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-1/2 h-[46%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(212,247,63,0.45),rgba(212,247,63,0))] ${m.nodeGlow}`}
                style={{ top: `${PLATFORM_TOP_FACE * 100}%` }}
              />
              <Image src={platformFor(n.chapter, n.state, theme)} alt="" width={880} height={720} className="relative h-auto w-full object-contain" />
              {boss && n.state !== 'locked' && (
                <Image
                  src={platformFor(n.chapter, n.state, theme)}
                  alt=""
                  width={880}
                  height={720}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 h-auto w-full object-contain brightness-[1.8] saturate-150 ${m.glint}`}
                />
              )}
              {live && (
                // `translate`, not Tailwind's -translate-*: those write `transform`,
                // which the ripple's `scale` would scale too, sliding the ring sideways.
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1/2 w-[64%] rounded-[50%] border-2 border-[#D4F73F]/80 ${m.ripple}`}
                  style={{ top: `${DISC_CY * 100}%`, aspectRatio: DISC_RATIO, translate: '-50% -50%' }}
                />
              )}
              <span
                className="absolute left-1/2 z-10 -translate-x-1/2 -translate-y-full"
                style={{ top: `${PLATFORM_TOP_FACE * 100}%` }}
                data-play-orb=""
              >
                <span className={`block ${live ? m.float : boss && n.state !== 'locked' ? m.floatLate : ''}`}>
                  <Orb chapter={n.chapter} state={n.state} theme={theme} />
                </span>
              </span>
              <span
                className={`absolute z-10 ${layout.labelInset ? '' : 'left-1/2 -translate-x-1/2'}`}
                style={{
                  top: `calc(${PLATFORM_BASE * 100}% + ${LABEL_GAP}px)`,
                  // tall stage: pinned to the panel's outer edge on this node's side
                  ...(layout.labelInset
                    ? { left: (n.x < W / 2 ? layout.labelInset : W - layout.labelInset - LABEL_W) - box.left }
                    : // wide stage on a tablet: the stage shrinks to ~0.6, so the labels are
                      // scaled back up (to at most 1.4×) to stay readable; 1 on desktop.
                      { scale: 'clamp(1, calc(0.85 / var(--s, 1)), 1.4)', transformOrigin: '0 0' } /* origin = the left:50% anchor, so translateX(-50%) keeps it centred */),
                }}
                data-play-label=""
              >
                <span className={`block ${m.labelReveal}`} style={{ '--i': i }}>
                  <Label chapter={n.chapter} name={n.name} dots={n.dots} levels={levels} progress={progress} theme={theme} />
                </span>
              </span>
            </>
          );
          return (
            <li key={n.chapter} className="absolute" style={{ left: box.left, top: box.top, width: n.w }} data-play-node={n.state}>
              <div className={m.reveal} style={{ '--i': i }}>
                {n.state === 'locked' ? (
                  // Focusable so keyboard users get the same hint the mouse tooltip gives.
                  <div tabIndex={0} aria-label={`${label} · ${lockedHint(n.chapter, n.comingSoon)}`} className={`relative block rounded-[20px] outline-none focus-visible:ring-2 ${theme.lockRing} ${m.locked}`}>
                    {body}
                    <span
                      role="tooltip"
                      className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-bold shadow-lg ring-1 ${theme.tip} ${m.tip}`}
                      style={{ top: `calc(${PLATFORM_TOP_FACE * 100}% - 108px)` }}
                    >
                      {lockedHint(n.chapter, n.comingSoon)}
                    </span>
                  </div>
                ) : (
                  <Link
                    href={n.href}
                    aria-label={label}
                    className={`relative block rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0D1B2A] ${m.nodeLink}`}
                  >
                    {body}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </ScaledStage>
  );
}

// Deterministic "random" stars — the same on the server and the client.
function starField(count, seed) {
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    left: `${(rnd() * 100).toFixed(2)}%`,
    top: `${(rnd() * 70).toFixed(2)}%`,
    size: rnd() < 0.2 ? 2 : 1,
    delay: `${(-rnd() * 6).toFixed(2)}s`,
  }));
}
const STARS_A = starField(22, 7);
const STARS_B = starField(16, 23);
const inSky = (s) => parseFloat(s.top) < 50; // the tier backgrounds have ground in the lower half

const TIER_KEY = 'play:v1:tier';

export function MissionMap({ tiers, progress: allProgress }) {
  const panelRef = useRef(null);
  const pausedRef = useRef(true);
  const [shot, setShot] = useState(null);
  const [series, setSeries] = useState(tiers[0].series);

  // The tab is a per-viewer convenience, so coming back from a level lands on it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIER_KEY);
      if (tiers.some((t) => t.series === saved)) setSeries(saved);
    } catch {
      /* storage blocked: stay on the first tier */
    }
  }, [tiers]);

  function pickTier(next) {
    setSeries(next);
    try {
      localStorage.setItem(TIER_KEY, next);
    } catch {
      /* storage blocked: the tab still switches */
    }
  }

  const tier = tiers.find((t) => t.series === series);
  const theme = TIER_THEME[series];
  const { levels, chapters } = tier;
  const progress = seriesProgress(allProgress, series);
  const current = currentChapter(levels, progress);
  const counts = chapterProgress(levels, progress);
  const states = WIDE.nodes.map((n) => {
    const { name, comingSoon = false, dots } = chapters[n.chapter];
    return {
      name,
      comingSoon,
      dots,
      state: comingSoon ? 'locked' : nodeState(n.chapter, levels, progress, current),
      href: levelHref(series, firstUnpassedLevel(n.chapter, levels, progress)),
    };
  });
  const currentIndex = Math.max(0, WIDE.nodes.findIndex((n) => n.chapter === current));
  const allDone = states.every((s) => s.state === 'passed');

  // Entrance once at 30% visible; loops pause whenever the panel is off-screen.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    el.dataset.anim = 'ready';
    el.dataset.paused = '';
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.3) el.dataset.entered = '';
        pausedRef.current = !e.isIntersecting;
        if (e.isIntersecting) delete el.dataset.paused;
        else el.dataset.paused = '';
      },
      { threshold: [0, 0.3] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One shooting star every 8–12s, only while the map is on screen.
  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* assume motion is fine */
    }
    if (reduced) return undefined;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!pausedRef.current) {
          setShot({ k: Date.now(), left: `${8 + Math.random() * 40}%`, top: `${4 + Math.random() * 14}%` });
        }
        schedule();
      }, 8000 + Math.random() * 4000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const stageProps = { states, levels, progress, counts, currentIndex, allDone, theme };
  const starsA = theme.bg ? STARS_A.filter(inSky) : STARS_A;
  const starsB = theme.bg ? STARS_B.filter(inSky) : STARS_B;

  return (
    <section id="map" aria-labelledby="play-map-title" className="mt-28 scroll-mt-28">
      <SectionHeading id="play-map-title" title="Mission map" accent={series} sub={tier.sub} />

      <div
        ref={panelRef}
        className={`relative mt-12 overflow-hidden rounded-[32px] border ${theme.panel} ${m.map}`}
      >
        {theme.bg && (
          <Image src={theme.bg} alt="" fill sizes="(min-width: 1200px) 1200px, 100vw" className="pointer-events-none object-cover" data-play-tier-bg="" />
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {starsA.map((s, i) => (
            <span key={`a${i}`} className={`absolute rounded-full bg-white ${m.twinkleA}`} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
          ))}
          {starsB.map((s, i) => (
            <span key={`b${i}`} className={`absolute rounded-full bg-[#D4F73F] ${m.twinkleB}`} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
          ))}
          {shot && (
            <span
              key={shot.k}
              // `rotate` (not transform) so the keyframes' `translate` composes with it;
              // the 380×120 travel matches the 18° tilt.
              className={`absolute h-px w-24 origin-right bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.9))] ${m.shoot}`}
              style={{ left: shot.left, top: shot.top, rotate: '18deg' }}
              data-play-shooting-star=""
            />
          )}
        </div>
        {/* The horizon art is OPAQUE (its own dark sky), so its top edge is
            faded out with a mask — otherwise it shows as a hard line. Taller and
            cropped on phones, where the panel is narrow. */}
        {!theme.bg && (
          <>
            <Image
              src="/play/map/horizon.webp"
              alt=""
              width={1650}
              height={340}
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full object-cover object-bottom [mask-image:linear-gradient(to_bottom,transparent_0%,black_45%)] md:h-auto md:object-contain"
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[radial-gradient(ellipse_60%_55%_at_60%_100%,rgba(72,176,255,0.28),rgba(212,247,63,0.06)_55%,transparent_75%)] ${m.horizonGlow}`}
            />
          </>
        )}

        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 pt-5 md:px-8 md:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-10 w-1.5 shrink-0 rounded-full bg-[#D4F73F]" aria-hidden="true" />
            <Image src="/play/icon-excel.webp" alt="" width={96} height={96} className="h-10 w-10 shrink-0 rounded-[8px]" />
            <div className="min-w-0 leading-tight">
              <p className="font-en text-sm font-bold uppercase tracking-widest text-[#D4F73F]">Planet 01 : Excel</p>
              <p className="font-heading text-base font-bold text-white">Excel แสนสนุก</p>
            </div>
          </div>
          {/* Phones: the tabs scroll sideways rather than wrap. */}
          <div className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:w-auto md:px-0 [&::-webkit-scrollbar]:hidden">
            <ul className={`flex w-max items-center gap-1 rounded-full p-1 text-sm ${theme.tabs}`} aria-label="ระดับ">
              {tiers.map((t) => {
                const on = t.series === series;
                const first = t.series === tiers[0].series;
                const Icon = !first && !on ? Lock : theme.bg ? Rocket : null;
                return (
                  <li key={t.series}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickTier(t.series)}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F] ${
                        on ? 'bg-[#D4F73F] font-bold text-[#0D1B2A]' : `${theme.tabIdle} hover:text-white`
                      }`}
                    >
                      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
                      {t.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="relative hidden md:block" data-play-stage="wide">
          <Stage layout={WIDE} {...stageProps} />
        </div>
        <div className="relative px-1 pb-2 md:hidden" data-play-stage="tall">
          <Stage layout={TALL} {...stageProps} />
        </div>
      </div>
    </section>
  );
}
