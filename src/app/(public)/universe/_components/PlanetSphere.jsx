import { cn } from '@/lib/utils';

/**
 * Shared planet sphere — one recipe, three consumers (GalaxyMap,
 * PlanetVoyage, and the voyage's vertical fallback).
 *
 * The sphere is a layered, STATIC composition of plain CSS gradients.
 * There is no feTurbulence, no animated background-position, no filter
 * or backdrop-filter, and no animated layers — every planet is fully
 * static so the compositor does zero work once it has painted. The only
 * idle motion on the page is the active planet's orbiting moons (see
 * PlanetVoyage), never the sphere surface itself.
 *
 * Premium look: soft radial "mottle" + volumetric limb shading give
 * depth without the harsh stripes / craters / grid / noise of earlier
 * iterations. Each skill keeps its own identity through its base colours
 * and a single subtle accent (aurora / soft bands / ring), but all
 * planets read as one design system.
 */

/** hex (#rgb or #rrggbb) → rgba() string. */
function rgba(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Six named skill personalities, keyed by config slug (never by index —
 * each skill always gets its designed look). Blues dominate; RPA is the
 * one lime planet. `surface` selects the subtle accent treatment.
 */
export const SKILL_THEMES = {
  data: {
    light: '#5CB8FF', mid: '#2486FF', dark: '#0A2B55',
    glow: 'rgba(72,176,255,0.45)',
    surface: 'bands',
  },
  ai: {
    light: '#8A83E6', mid: '#4A5FE8', dark: '#171B4D',
    glow: 'rgba(127,119,221,0.55)', strongGlow: true,
    surface: 'aurora',
  },
  'power-platform': {
    light: '#3D97FF', mid: '#005CFF', dark: '#082347',
    glow: 'rgba(36,134,255,0.5)',
    surface: 'ring',
  },
  business: {
    light: '#F3A98D', mid: '#C86A4E', dark: '#4A2318',
    glow: 'rgba(240,153,123,0.42)',
    surface: 'mottle',
  },
  programming: {
    light: '#6E9CF0', mid: '#2F5AA8', dark: '#0D1B2A',
    glow: 'rgba(90,141,238,0.42)',
    surface: 'mottle',
  },
  rpa: {
    light: '#DBF75E', mid: '#A6C72E', dark: '#3A4A10',
    glow: 'rgba(212,247,63,0.42)',
    surface: 'bands',
  },
};

export const DEFAULT_THEME = SKILL_THEMES.data;

export const MOON_THEME = {
  light: '#FFFFFF', mid: '#C8E7FF', dark: '#4E6E8E',
  glow: 'rgba(200,231,255,0.4)',
};

/**
 * Subtle static accent per surface type. Kept low-contrast on purpose —
 * this is the layer that used to be harsh stripes / craters / a literal
 * grid. Rendered on `detail: 'full'` only.
 */
function SurfaceAccent({ theme }) {
  switch (theme.surface) {
    case 'aurora':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: [
              `conic-gradient(from 210deg at 60% 42%, transparent 0deg, ${rgba(theme.light, 0.22)} 70deg, transparent 190deg)`,
              `radial-gradient(40% 34% at 38% 64%, ${rgba(theme.light, 0.16)} 0%, transparent 72%)`,
            ].join(', '),
            mixBlendMode: 'screen',
            opacity: 0.7,
          }}
        />
      );
    case 'bands':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: [
              `linear-gradient(98deg, transparent 26%, ${rgba(theme.light, 0.12)} 40%, transparent 55%)`,
              `linear-gradient(98deg, transparent 58%, ${rgba(theme.light, 0.08)} 70%, transparent 82%)`,
            ].join(', '),
            mixBlendMode: 'screen',
            opacity: 0.8,
          }}
        />
      );
    case 'mottle':
    default:
      return (
        <div
          className="absolute inset-0"
          style={{
            background: [
              `radial-gradient(34% 28% at 62% 30%, ${rgba(theme.light, 0.16)} 0%, transparent 70%)`,
              `radial-gradient(30% 24% at 34% 66%, ${rgba(theme.dark, 0.5)} 0%, transparent 72%)`,
            ].join(', '),
            opacity: 0.7,
          }}
        />
      );
  }
}

/**
 * @param {object} props
 * @param {object} props.theme  — entry from SKILL_THEMES / MOON_THEME
 * @param {string|number} props.size — CSS size (width = height)
 * @param {'full'|'simple'|'moon'} [props.detail]
 *   full: everything (voyage heroes) · simple: base + shading + specular
 *   (galaxy-map scale) · moon: base + terminator only
 */
export function PlanetSphere({ theme, size, detail = 'full', className, style }) {
  const full = detail === 'full';
  const moon = detail === 'moon';
  return (
    <div className={cn('relative', className)} style={{ width: size, height: size, ...style }}>
      {/* atmosphere rim + glow — box-shadow on the unclipped wrapper */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow: `0 0 60px -12px ${theme.glow}${
            theme.strongGlow ? `, 0 0 120px -18px ${theme.glow}` : ''
          }, inset 0 0 40px rgba(255,255,255,0.06)`,
        }}
      />
      {full && theme.surface === 'ring' && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: '152%',
            height: '46%',
            borderRadius: '50%',
            border: `2px solid ${rgba(theme.light, 0.5)}`,
            transform: 'translate(-50%, -50%) rotate(-14deg)',
          }}
        />
      )}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {/* 1 — base ball */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 32% 26%, ${theme.light} 0%, ${theme.mid} 46%, ${theme.dark} 88%)`,
          }}
        />
        {/* 2 — volumetric limb shading (deepen the bottom-right edge) */}
        {!moon && (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 70% 76%, ${rgba(theme.dark, 0.92)} 0%, transparent 58%)`,
              opacity: 0.6,
            }}
          />
        )}
        {/* 3 — surface accent (full detail only) */}
        {full && <SurfaceAccent theme={theme} />}
        {/* 4 — terminator (day/night edge) */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(102deg, transparent 44%, rgba(5,10,20,0.5) 82%)' }}
        />
        {/* 5 — specular highlight (skipped on moons) */}
        {!moon && (
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 28% 22%, rgba(255,255,255,0.38), transparent 25%)',
            }}
          />
        )}
      </div>
    </div>
  );
}
