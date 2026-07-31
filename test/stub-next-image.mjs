// Faithful <img> stub for next/image — see stub-next-link.mjs. Drops next-only
// props (sizes, unoptimized, …) so react-dom/server doesn't warn on them.
import { createElement } from 'react';

export default function Image({ src, alt = '', ...rest }) {
  return createElement('img', { src, alt }, null);
}
