import { useId } from 'react';

import { menuColor } from '@/lib/play/game/scene';

import styles from './scene.module.css';

/**
 * Brand-colour SVG props for the simulator scenes. Each prop draws in its own
 * small local box and is placed with x / y / s (scale), so the same component
 * serves the stage (inside the stage's 248×190 viewBox) and the row icons
 * (inside a <MiniSvg>). `state` is a sceneRows state: shadow props are dashed
 * grey outlines; current props get the blue outline.
 */

export const C = {
  lime: '#D4F73F',
  blue: '#60A5FA',
  green: '#86EFAC',
  red: '#F87171',
  shadow: 'rgba(148,163,184,0.45)',
};
const DASH = '2 1.6';

const useSvgId = () => useId().replace(/[^a-zA-Z0-9_-]/g, '');

/** A prop that just turned solid pops in once (off under reduced motion). */
function Place({ x = 0, y = 0, s = 1, state, children }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={state === 'match' || state === 'current' ? styles.pop : undefined}>{children}</g>
    </g>
  );
}

/** Wrap one prop for a row icon: a tiny SVG sized in CSS px. */
export function MiniSvg({ w, h, viewBox, children, className = '' }) {
  return (
    <svg width={w} height={h} viewBox={viewBox} className={`shrink-0 overflow-visible ${className}`} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Soft radial contact shadow, centred on (cx, cy). */
export function ContactShadow({ cx, cy, rx, ry = rx / 4 }) {
  const id = useSvgId();
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}

/**
 * Glass cup, local box 20×28 (rim at y 6). `cream` 0..1 draws a whipped
 * topping whose height follows it and replaces the straw; null or 0 → straw.
 */
const GLASS = '0,6 20,6 17.5,28 2.5,28';
export function Glass({ x, y, s = 1, menu, state, cream = null }) {
  const id = useSvgId();
  if (state === 'shadow' || state === 'error') {
    return (
      <Place x={x} y={y} s={s}>
        <polygon points={GLASS} fill="none" stroke={state === 'error' ? C.red : C.shadow} strokeWidth="1.2" strokeDasharray={DASH} />
      </Place>
    );
  }
  const color = menuColor(menu);
  const current = state === 'current';
  const h = cream ? 4 + 8 * cream : 0;
  return (
    <Place x={x} y={y} s={s} state={state}>
      <defs>
        <linearGradient id={`${id}d`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color.from} />
          <stop offset="100%" stopColor={color.to} />
        </linearGradient>
      </defs>
      <ContactShadow cx={10} cy={28.5} rx={11} ry={2.4} />
      {/* drink: the glass trapezoid from y 10 down */}
      <polygon points="0.6,10 19.4,10 17.6,27.2 2.4,27.2" fill={`url(#${id}d)`} />
      {color.foam && <polygon points="0.6,10 19.4,10 19.1,13 0.9,13" fill={color.foam} />}
      {!h && <line x1="12" y1="12" x2="15.5" y2="-1" stroke={C.lime} strokeWidth="1.8" strokeLinecap="round" />}
      <polygon points={GLASS} fill="rgba(255,255,255,0.10)" stroke={current ? C.blue : 'rgba(255,255,255,0.6)'} strokeWidth={current ? 2 : 0.9} strokeLinejoin="round" />
      <line x1="3.4" y1="9" x2="4.6" y2="25" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" strokeLinecap="round" />
      {h > 0 && (
        <g>
          <ellipse cx="10" cy={6 - h * 0.2} rx="10" ry={h * 0.32} fill="#FFF8EE" />
          <ellipse cx="10" cy={6 - h * 0.55} rx="7.4" ry={h * 0.3} fill="#FFFDF8" />
          {cream > 0.5 && <ellipse cx="10" cy={6 - h * 0.85} rx="4.2" ry={h * 0.22} fill="#FFFFFF" />}
          {[[6.5, 6 - h * 0.3], [12.8, 6 - h * 0.45], [9.6, 6 - h * 0.7]].map(([cx, cy]) => (
            <circle key={`${cx}`} cx={cx} cy={cy} r="0.9" fill="#7A4A2A" />
          ))}
        </g>
      )}
    </Place>
  );
}

/** Coin seen from the front, local box 12×12. `red` for a broken reference. */
export function Coin({ x, y, s = 1, state, red = false }) {
  if (state === 'shadow') {
    return (
      <Place x={x} y={y} s={s}>
        <circle cx="6" cy="6" r="5.4" fill="none" stroke={C.shadow} strokeWidth="1" strokeDasharray={DASH} />
      </Place>
    );
  }
  const [fill, rim] = red ? [C.red, '#B91C1C'] : ['#F5B83D', '#C98A1C'];
  return (
    <Place x={x} y={y} s={s} state={state}>
      <circle cx="6" cy="6" r="5.4" fill={fill} stroke={state === 'current' ? C.blue : rim} strokeWidth={state === 'current' ? 1.4 : 1.1} />
      <circle cx="6" cy="6" r="3.4" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.7" />
    </Place>
  );
}

/** One coin in a stack, seen from the side: local box 18×6. */
export function StackCoin({ x, y, state }) {
  if (state === 'shadow') {
    return <ellipse cx={x + 9} cy={y + 3} rx="9" ry="3" fill="none" stroke={C.shadow} strokeWidth="0.9" strokeDasharray={DASH} />;
  }
  return (
    <g>
      <path d={`M${x} ${y + 3} v2 a9 3 0 0 0 18 0 v-2`} fill="#C98A1C" />
      <ellipse cx={x + 9} cy={y + 3} rx="9" ry="3" fill="#F5B83D" stroke={state === 'current' ? C.blue : '#E0A22E'} strokeWidth="0.8" />
      <ellipse cx={x + 9} cy={y + 3} rx="5.6" ry="1.7" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.5" />
    </g>
  );
}

/** Banknote, local box 20×11. */
export function Banknote({ x, y, s = 1, state }) {
  if (state === 'shadow') {
    return (
      <Place x={x} y={y} s={s}>
        <rect x="0.5" y="0.5" width="19" height="10" rx="2" fill="none" stroke={C.shadow} strokeWidth="1" strokeDasharray={DASH} />
      </Place>
    );
  }
  return (
    <Place x={x} y={y} s={s} state={state}>
      <rect x="0.5" y="0.5" width="19" height="10" rx="2" fill="#4FD18F" stroke={state === 'current' ? C.blue : 'none'} strokeWidth="1.2" />
      <rect x="2.2" y="2.2" width="15.6" height="6.6" rx="1.2" fill="none" stroke="#258A58" strokeWidth="0.8" />
      <circle cx="10" cy="5.5" r="1.8" fill="#258A58" />
    </Place>
  );
}

/** Kraft box with a lighter lid and a lime tape stripe, local box 16×14. */
export function Box({ x, y, s = 1, state }) {
  if (state === 'shadow') {
    return (
      <Place x={x} y={y} s={s}>
        <rect x="0.5" y="2" width="15" height="11.5" rx="1.2" fill="none" stroke={C.shadow} strokeWidth="1" strokeDasharray={DASH} />
      </Place>
    );
  }
  return (
    <Place x={x} y={y} s={s} state={state}>
      <rect x="0.5" y="3.5" width="15" height="10" rx="1" fill="#C9925B" stroke={state === 'current' ? C.blue : '#9C6B3C'} strokeWidth={state === 'current' ? 1.4 : 0.6} />
      <rect x="0" y="1.5" width="16" height="3.4" rx="0.8" fill="#DDB07F" />
      <rect x="6.8" y="1.5" width="2.4" height="12" fill={C.lime} />
    </Place>
  );
}

/** Person: head + shoulders, local box 12×14. Lime, blue when current. */
export function Person({ x, y, s = 1, state }) {
  const body = 'M1 14 v-2.6 a5 4.4 0 0 1 10 0 V14 Z';
  if (state === 'shadow') {
    return (
      <Place x={x} y={y} s={s}>
        <g fill="none" stroke={C.shadow} strokeWidth="1" strokeDasharray={DASH}>
          <circle cx="6" cy="3.6" r="2.9" />
          <path d={body} />
        </g>
      </Place>
    );
  }
  const fill = state === 'current' ? C.blue : C.lime;
  return (
    <Place x={x} y={y} s={s} state={state}>
      <circle cx="6" cy="3.6" r="2.9" fill={fill} />
      <path d={body} fill={fill} />
    </Place>
  );
}
