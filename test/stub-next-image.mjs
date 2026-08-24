// Faithful <img> stub for next/image — see stub-next-link.mjs. Drops next-only
// props (sizes, fill, priority, …) so react-dom/server doesn't warn on them.
//
// ── className AND style ARE FORWARDED, BECAUSE next/image FORWARDS THEM ──────
// They are how every call site in this repo sizes and positions its picture,
// and the Feature Content cards now carry a per-record `object-position` in
// `style` — the focal point that decides WHICH 35% of a banner a 16:9 crop
// throws away. Dropping them here made that untestable at this tier: the
// markup came out as a bare <img> and a test asking "is the crop anchored?"
// could only ever answer "there is no attribute", which passes for the wrong
// reason whichever way the component is written.
import { createElement } from 'react';

export default function Image({ src, alt = '', className, style, ...rest }) {
  return createElement('img', { src, alt, className, style }, null);
}
