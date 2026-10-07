/**
 * A small single-series line chart for admin pages — plain SVG, no library,
 * no client JavaScript (it renders in server components as well as client ones).
 *
 * Built for /admin/consent-stats and meant to be reused (article views next),
 * so it takes nothing domain-specific:
 *
 *   series  [{ label, value }]  oldest first; `value` null/undefined = NO DATA
 *
 * ── NO DATA IS A GAP, NOT ZERO ──────────────────────────────────────────────
 * A missing period breaks the line. Drawing it as 0 would claim "nobody
 * accepted" on a day nothing was recorded at all. A point with no neighbour on
 * either side is drawn as a dot, since a one-point segment has no line.
 *
 * Single series, so no legend box — the caption names it. Each point has a hover
 * target with a native <title> tooltip (label: value); the page's table is the
 * accessible data view.
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

export function LineChart({
  series = [],
  title,
  yMax,
  yTicks = 4,
  formatValue = (v) => String(v),
  formatTick = (label) => label,
  emptyText = 'ไม่มีข้อมูลในช่วงนี้',
}) {
  const values = series.map((p) => p.value).filter(isNum);
  const top = isNum(yMax) && yMax > 0 ? yMax : Math.max(1, ...values);
  const n = series.length;
  const x = (i) => PAD.left + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v) => PAD.top + PLOT_H - (Math.min(v, top) / top) * PLOT_H;

  const segments = lineSegments(series);
  const showAllDots = n <= 31;

  return (
    <figure className="rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]">
      {title && (
        <figcaption className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">{title}</figcaption>
      )}
      {values.length === 0 ? (
        <p className="py-10 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{emptyText}</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={title}
          data-chart="line"
        >
          {Array.from({ length: yTicks + 1 }, (_, k) => {
            const v = (top * k) / yTicks;
            return (
              <g key={`y${k}`}>
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
                  {formatValue(Math.round(v * 10) / 10)}
                </text>
              </g>
            );
          })}

          {tickIndices(n).map((i) => (
            <text
              key={`x${i}`}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}
              className="fill-9e-slate-dp-50 text-[11px] dark:fill-[#94a3b8]"
            >
              {formatTick(series[i].label)}
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
            return (
              <g key={`p${i}`} className="group">
                <title>{`${p.label}: ${formatValue(p.value)}`}</title>
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r={4}
                  data-dot={isolated ? 'isolated' : ''}
                  className={
                    'fill-9e-action stroke-white dark:fill-9e-air dark:stroke-[#0D1B2A] ' +
                    (isolated || showAllDots ? '' : 'opacity-0 group-hover:opacity-100')
                  }
                  strokeWidth={2}
                />
                <circle cx={x(i)} cy={y(p.value)} r={10} fill="transparent" />
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}
