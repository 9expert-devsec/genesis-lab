'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardPosition, nearestIndex, tooltipText } from './chartGeometry';

// Layout effect in the browser (position before paint), plain effect during
// server render, where React 18 warns about useLayoutEffect.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The interactive layer over a server-rendered LineChart <svg> (`children`).
 *
 * Everything it shows is precomputed on the server and passed as plain data —
 * `points[i]` = { x, y (viewBox units, y null for no value), line1, line2,
 * meta: [{label, value}] } — so no formatting function crosses the boundary
 * and the SVG itself stays server HTML.
 *
 *   mouse  hovering ANYWHERE over the plot snaps to the nearest x point
 *   touch  a tap selects the nearest point
 *   keys   the plot is focusable; ←/→ step, Home/End jump; focus starts on the
 *          latest point
 *   leave / blur hides the card
 *
 * `active` is the only state, and it is UI state (which point is hovered), not
 * a copy of anything in the URL. The card is positioned in a layout effect from
 * its MEASURED width (chartGeometry.cardPosition), so it flips sides near
 * either edge and is never clipped.
 */
export function ChartInteraction({ points, width, height, plotTop, plotBottom, label, children }) {
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const cardRef = useRef(null);
  const xs = points.map((p) => p.x);
  const point = active >= 0 ? points[active] : null;

  const indexFromClientX = (clientX) => {
    const rect = boxRef.current.getBoundingClientRect();
    return nearestIndex(((clientX - rect.left) / rect.width) * width, xs);
  };

  useIsoLayoutEffect(() => {
    const box = boxRef.current;
    const card = cardRef.current;
    if (!box || !card || !point) return;
    const containerWidth = box.clientWidth;
    const { side, left } = cardPosition({
      anchorX: (point.x / width) * containerWidth,
      cardWidth: card.offsetWidth,
      containerWidth,
    });
    card.style.left = `${left}px`;
    card.dataset.side = side;
  }, [point, width]);

  const onKeyDown = (e) => {
    const last = points.length - 1;
    const cur = active < 0 ? last : active;
    const next = {
      ArrowLeft: Math.max(0, cur - 1),
      ArrowRight: Math.min(last, cur + 1),
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="group"
      aria-label={`${label} — ใช้ปุ่มลูกศรซ้าย/ขวาเพื่อดูทีละจุด`}
      data-chart-box=""
      className="relative touch-pan-y rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action dark:focus-visible:ring-9e-air"
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') setActive(indexFromClientX(e.clientX));
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') setActive(indexFromClientX(e.clientX));
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setActive(-1);
      }}
      onFocus={() => setActive((a) => (a < 0 ? points.length - 1 : a))}
      onBlur={() => setActive(-1)}
      onKeyDown={onKeyDown}
    >
      {children}

      {point && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <line
            x1={point.x}
            x2={point.x}
            y1={plotTop}
            y2={plotBottom}
            strokeWidth={1}
            strokeDasharray="4 3"
            className="stroke-9e-slate-dp-50 dark:stroke-[#94a3b8]"
          />
          {point.y !== null && (
            <circle
              cx={point.x}
              cy={point.y}
              r={6}
              strokeWidth={2}
              className="fill-9e-action stroke-white dark:fill-9e-air dark:stroke-[#0D1B2A]"
            />
          )}
        </svg>
      )}

      {point && (
        <div
          ref={cardRef}
          data-chart-card=""
          className="pointer-events-none absolute top-2 z-10 w-max max-w-[16rem] rounded-lg border border-[var(--surface-border)] bg-white px-3 py-2 text-xs shadow-9e-lg dark:bg-[#111d2c]"
          style={{ left: 0 }}
        >
          <div className="text-9e-slate-dp-50 dark:text-[#94a3b8]">{point.line1}</div>
          <div className="mt-0.5 text-sm font-bold text-9e-navy dark:text-white">{point.line2}</div>
          {(point.meta ?? []).map((m) => (
            <div key={m.label} className="mt-0.5 flex justify-between gap-3 text-9e-navy dark:text-white">
              <span className="text-9e-slate-dp-50 dark:text-[#94a3b8]">{m.label}</span>
              <span className="tabular-nums">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      <div aria-live="polite" className="sr-only" data-chart-live="">
        {tooltipText(point)}
      </div>
    </div>
  );
}
