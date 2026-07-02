import { cn } from '@/lib/utils';

/**
 * Shared planet sphere — one recipe, three consumers (GalaxyMap,
 * PlanetVoyage, and the voyage's vertical fallback).
 *
 * The sphere is a layered, STATIC, pre-rasterized composition: every
 * layer is a plain background-image (gradients + an feTurbulence SVG
 * data-URI, which the browser rasterizes once as an image — it is not a
 * live DOM filter). Nothing here animates, ever — an idle-drift overlay
 * was tried in Phase 4 and measured as the single most expensive layer
 * on the page (rotating a large noise layer forces continuous re-raster
 * on non-GPU-composited paths), so the spheres are fully static.
 *
 * Hard rules: no filter/backdrop-filter, no animated background-position,
 * no animated blend-mode layers (the blended layers are all static).
 */

const noiseCache = new Map();

/** SVG fractal-noise tile as a data URI — rasterized once by the browser. */
function noiseUri(bf = 0.9, oct = 4, alpha = 0.35) {
  const key = `${bf}|${oct}|${alpha}`;
  if (!noiseCache.has(key)) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${bf}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    noiseCache.set(key, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  return noiseCache.get(key);
}

/**
 * Six named skill personalities, keyed by config slug (never by index —
 * each skill always gets its designed look). Blues dominate; RPA is the
 * one lime planet. `noise` tunes the feTurbulence surface layer.
 */
export const SKILL_THEMES = {
  data: {
    light: '#48B0FF', mid: '#2486FF', dark: '#0A2B55',
    glow: 'rgba(72,176,255,0.5)',
    ring: false, personality: 'bands',
    noise: { bf: 0.02, oct: 5, alpha: 0.5, size: 220 },
  },
  ai: {
    light: '#7F77DD', mid: '#4A5FE8', dark: '#171B4D',
    glow: 'rgba(127,119,221,0.6)', strongGlow: true,
    ring: false, personality: 'swirl',
    noise: { bf: 0.025, oct: 5, alpha: 0.45, size: 200 },
  },
  'power-platform': {
    light: '#2486FF', mid: '#005CFF', dark: '#082347',
    glow: 'rgba(36,134,255,0.5)',
    ring: true, personality: 'clouds',
    noise: { bf: 0.03, oct: 5, alpha: 0.4, size: 220 },
  },
  business: {
    light: '#F0997B', mid: '#C86A4E', dark: '#4A2318',
    glow: 'rgba(240,153,123,0.45)',
    ring: false, personality: 'craters',
    noise: { bf: 0.9, oct: 4, alpha: 0.35, size: 160 },
  },
  programming: {
    light: '#5A8DEE', mid: '#2F5AA8', dark: '#0D1B2A',
    glow: 'rgba(90,141,238,0.45)',
    ring: false, personality: 'craters-grid',
    noise: { bf: 1.0, oct: 4, alpha: 0.3, size: 150 },
  },
  rpa: {
    light: '#D4F73F', mid: '#9DBE2B', dark: '#3A4A10',
    glow: 'rgba(212,247,63,0.45)',
    ring: false, personality: 'bands-thin',
    noise: { bf: 0.8, oct: 4, alpha: 0.3, size: 170 },
  },
};

export const DEFAULT_THEME = SKILL_THEMES.data;

export const MOON_THEME = {
  light: '#FFFFFF', mid: '#C8E7FF', dark: '#4E6E8E',
  glow: 'rgba(200,231,255,0.4)',
};

/** Per-personality static texture layers (blend modes are static — allowed). */
function PersonalityLayers({ theme }) {
  switch (theme.personality) {
    case 'bands':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(7deg, rgba(255,255,255,0.12) 0px 16px, rgba(0,0,0,0) 16px 38px, ${theme.dark} 38px 64px, rgba(0,0,0,0) 64px 98px)`,
            mixBlendMode: 'overlay',
            opacity: 0.55,
          }}
        />
      );
    case 'bands-thin':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(4deg, rgba(255,255,255,0.16) 0px 6px, rgba(0,0,0,0) 6px 20px, ${theme.dark} 20px 30px, rgba(0,0,0,0) 30px 48px)`,
            mixBlendMode: 'overlay',
            opacity: 0.5,
          }}
        />
      );
    case 'swirl':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: [
              'conic-gradient(from 30deg at 42% 40%, transparent 0deg, rgba(255,255,255,0.16) 70deg, transparent 150deg, rgba(255,255,255,0.08) 240deg, transparent 360deg)',
              `conic-gradient(from 210deg at 62% 58%, transparent 0deg, ${theme.light} 90deg, transparent 200deg)`,
            ].join(', '),
            mixBlendMode: 'soft-light',
            opacity: 0.7,
          }}
        />
      );
    case 'craters':
    case 'craters-grid': {
      const craters = [
        'radial-gradient(circle at 30% 38%, rgba(0,0,0,0.35) 0%, transparent 7%)',
        'radial-gradient(circle at 58% 24%, rgba(0,0,0,0.3) 0%, transparent 5%)',
        'radial-gradient(circle at 70% 62%, rgba(0,0,0,0.35) 0%, transparent 9%)',
        'radial-gradient(circle at 44% 72%, rgba(0,0,0,0.28) 0%, transparent 6%)',
        'radial-gradient(circle at 18% 60%, rgba(0,0,0,0.25) 0%, transparent 5%)',
        'radial-gradient(circle at 62% 44%, rgba(255,255,255,0.10) 0%, transparent 5%)',
      ];
      const grid =
        theme.personality === 'craters-grid'
          ? [
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px 1px, transparent 1px 26px)',
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px 1px, transparent 1px 26px)',
            ]
          : [];
      return (
        <div
          className="absolute inset-0"
          style={{ background: [...craters, ...grid].join(', ') }}
        />
      );
    }
    case 'clouds':
      return (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: noiseUri(0.015, 5, 0.6),
            backgroundSize: '260px 260px',
            mixBlendMode: 'soft-light',
            opacity: 0.5,
          }}
        />
      );
    default:
      return null;
  }
}

/**
 * @param {object} props
 * @param {object} props.theme  — entry from SKILL_THEMES / MOON_THEME
 * @param {string|number} props.size — CSS size (width = height)
 * @param {'full'|'simple'|'moon'} [props.detail]
 *   full: everything (voyage heroes) · simple: base + noise + terminator
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
      {full && theme.ring && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: '150%',
            height: '46%',
            borderRadius: '50%',
            border: `2px solid ${theme.glow}`,
            transform: 'translate(-50%, -50%) rotate(-14deg)',
          }}
        />
      )}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {/* 1 — base ball */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 30% 28%, ${theme.light} 0%, ${theme.mid} 48%, ${theme.dark} 82%)`,
          }}
        />
        {/* 2 — surface noise (skipped on moons) */}
        {!moon && theme.noise && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: noiseUri(theme.noise.bf, theme.noise.oct, theme.noise.alpha),
              backgroundSize: `${theme.noise.size}px ${theme.noise.size}px`,
              mixBlendMode: 'soft-light',
              opacity: 0.6,
            }}
          />
        )}
        {/* 3 — personality (full detail only) */}
        {full && <PersonalityLayers theme={theme} />}
        {/* 4 — terminator (day/night edge) */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(105deg, transparent 45%, rgba(5,10,20,0.55) 78%)' }}
        />
        {/* 5 — specular highlight (skipped on moons) */}
        {!moon && (
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 26% 22%, rgba(255,255,255,0.35), transparent 26%)',
            }}
          />
        )}
      </div>
    </div>
  );
}
