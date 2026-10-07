import { ChartInteraction } from './ChartInteraction';
import { niceTicks, pointValueText } from './chartGeometry';

/**
 * A small single-series line chart for admin pages — plain SVG, no library.
 * The SVG is rendered on the server; the hover/keyboard/touch tooltip is a
 * small client wrapper (ChartInteraction) that receives precomputed text.
 *
 * Used by /admin/consent-stats and /admin/article-views, so it takes nothing
 * domain-specific:
 *
 *   series  [{ label, value, meta? }]  oldest first
 *           label  the tooltip's first line (callers pass a Thai date)
 *           value  number; null/undefined = NO DATA
 *           meta   optional [{ label, value }] extra tooltip lines (strings)
 *
 * ── NO DATA IS A GAP, NOT ZERO ──────────────────────────────────────────────
 * A missing period breaks the line. Drawing it as 0 would claim "nobody
 * accepted" on a day nothing was recorded at all. A point with no neighbour on
 * either side is drawn as a dot, since a one-point segment has no line. In the
 * tooltip a gap reads "ไม่มีข้อมูล", and a point inside the not-collected band
 * reads "ยังไม่เริ่มเก็บ".
 *
 * ── Y AXIS ──────────────────────────────────────────────────────────────────
 * With `yMax` (percentages: 100) the axis is split into `yTicks` equal steps —
 * 0/25/50/75/100. Without it, "nice" ticks (chartGeometry.niceTicks): 1/2/5 ×
 * 10^n steps, 4–6 ticks, max rounded up; whole steps only when every value is
 * an integer.
 *
 * Single series, so no legend box — the caption names it. The page's table is
 * the full data view.
 */

const W = 800;
const H = 240;
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Indices of up to `max` evenly spaced x-axis ticks, always first and last. */
export function tickIndices(n, max = 6) {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set([0, n - 1]);
  for (let k = 1; k < max - 1; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Runs of consecutive points that have a value — one SVG path each. */
export function lineSegments(series) {
  const segs = [];
  let cur = [];
  (series ?? []).forEach((p, i) => {
    if (isNum(p?.value)) cur.push(i);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  });
  if (cur.length) segs.push(cur);
  return segs;
}

/** The y-axis tick values and the axis top. See the note above. */
export function yAxis(values, { yMax, yTicks = 4 } = {}) {
  if (isNum(yMax) && yMax > 0) {
    return { top: yMax, ticks: Array.from({ length: yTicks + 1 }, (_, k) => (yMax * k) / yTicks) };
  }
  const nums = values.filter(isNum);
  return niceTicks(Math.max(0, ...nums), { integer: nums.every(Number.isInteger) });
}

export function LineChart({
  series = [],
  title,
  yMax,
  yTicks = 4,
  formatValue = (v) => String(v),
  // The tooltip's bold line. Defaults to formatValue (the axis format).
  formatTooltipValue,
  // (label, index) → the x-axis tick text.
  formatTick = (label) => label,
  emptyText = 'ไม่มีข้อมูลในช่วงนี้',
  // OPTIONAL. Index of the first point that was being collected; everything
  // before it is drawn as a shaded band carrying `notCollectedLabel`, so a
  // "before we started counting" stretch reads as different from a gap in
  // the middle. Omitted (or <= 0) draws no band — the default for callers
  // whose whole range is collected.
  notCollectedBefore,
  notCollectedLabel = 'ยังไม่เริ่มเก็บ',
}) {
  const values = series.map((p) => p.value).filter(isNum);
  const axis = yAxis(series.map((p) => p.value), { yMax, yTicks });
  const top = axis.top;
  const n = series.length;
  const x = (i) => PAD.left + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v) => PAD.top + PLOT_H - (Math.min(v, top) / top) * PLOT_H;

  const segments = lineSegments(series);
  const showAllDots = n <= 31;
  const tooltipFormat = formatTooltipValue ?? formatValue;

  // Everything the client wrapper shows, as plain data.
  const points = series.map((p, i) => ({
    x: x(i),
    y: isNum(p.value) ? y(p.value) : null,
    line1: p.label,
    line2: pointValueText(p.value, i, notCollectedBefore, tooltipFormat),
    meta: isNum(p.value) ? (p.meta ?? []).map((m) => ({ label: String(m.label), value: String(m.value) })) : [],
  }));

  return (
    <figure className="rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]">
      {title && (
        <figcaption className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">{title}</figcaption>
      )}
      {values.length === 0 ? (
        <p className="py-10 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{emptyText}</p>
      ) : (
        <ChartInteraction
          points={points}
          width={W}
          height={H}
          plotTop={PAD.top}
          plotBottom={PAD.top + PLOT_H}
          label={title ?? 'กราฟ'}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true" data-chart="line">
            {isNum(notCollectedBefore) && notCollectedBefore > 0 && n > 1 && (() => {
              // The band ends halfway between the last uncollected point and
              // the first collected one.
              const end = Math.min(W - PAD.right, (x(notCollectedBefore - 1) + x(Math.min(notCollectedBefore, n - 1))) / 2);
              return (
                <g data-not-collected="">
                  <rect
                    x={PAD.left}
                    y={PAD.top}
                    width={Math.max(0, end - PAD.left)}
                    height={PLOT_H}
                    className="fill-9e-ice dark:fill-[#111d2c]"
                  />
                  <text
                    x={(PAD.left + end) / 2}
                    y={PAD.top + 14}
                    textAnchor="middle"
                    className="fill-9e-slate-dp-50 text-[11px] dark:fill-[#94a3b8]"
                  >
                    {notCollectedLabel}
                  </text>
                </g>
              );
            })()}

            {axis.ticks.map((v) => (
              <g key={`y${v}`} data-y-tick={v}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(v)}
                  y2={y(v)}
                  className="stroke-[#E2E8F0] dark:stroke-[#1e3a5f]"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-9e-slate-dp-50 text-[11px] dark:fill-[#94a3b8]"
                >
                  {formatValue(v)}
                </text>
              </g>
            ))}

            {tickIndices(n).map((i) => (
              <text
                key={`x${i}`}
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
                className="fill-9e-slate-dp-50 text-[11px] dark:fill-[#94a3b8]"
              >
                {formatTick(series[i].label, i)}
              </text>
            ))}

            {segments.map((seg) =>
              seg.length > 1 ? (
                <path
                  key={`s${seg[0]}`}
                  data-segment=""
                  d={seg.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(series[i].value).toFixed(1)}`).join(' ')}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="stroke-9e-action dark:stroke-9e-air"
                />
              ) : null,
            )}

            {series.map((p, i) => {
              if (!isNum(p.value)) return null;
              const isolated = !isNum(series[i - 1]?.value) && !isNum(series[i + 1]?.value);
              if (!isolated && !showAllDots) return null;
              return (
                <circle
                  key={`p${i}`}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={4}
                  data-dot={isolated ? 'isolated' : ''}
                  className="fill-9e-action stroke-white dark:fill-9e-air dark:stroke-[#0D1B2A]"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        </ChartInteraction>
      )}
    </figure>
  );
}
