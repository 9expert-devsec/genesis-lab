import { lineSegments } from '@/components/admin/charts/LineChart';

/**
 * A word-sized trend line for a table cell — plain SVG, no axes, no client JS.
 *
 *   values  number[] oldest first; null/undefined = NO DATA (a gap, not zero)
 *
 * The scale is the row's own max, so it shows SHAPE, not size — the number
 * beside it carries the size. A lone point between gaps is drawn as a dot.
 * All-null renders an empty box of the same size, so the column stays aligned.
 */

const W = 96;
const H = 24;
const PAD = 2;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function Sparkline({ values = [], label }) {
  const series = values.map((value) => ({ value }));
  const nums = values.filter(isNum);
  const top = Math.max(1, ...nums);
  const n = values.length;
  const x = (i) => PAD + (n <= 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (n - 1));
  const y = (v) => H - PAD - (v / top) * (H - 2 * PAD);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      data-chart="sparkline"
      className="block"
    >
      {lineSegments(series).map((seg) =>
        seg.length > 1 ? (
          <path
            key={seg[0]}
            d={seg.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`).join(' ')}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-9e-action dark:stroke-9e-air"
          />
        ) : (
          <circle
            key={seg[0]}
            cx={x(seg[0])}
            cy={y(values[seg[0]])}
            r={1.75}
            className="fill-9e-action dark:fill-9e-air"
          />
        ),
      )}
    </svg>
  );
}
