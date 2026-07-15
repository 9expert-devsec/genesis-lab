// Faithful <a> stub for next/link — not resolvable under raw Node, and not what
// the suite verifies. Renders href + children so component output assertions
// (a button's label, a card's link) still hold.
import { createElement } from 'react';

export default function Link({ href, children, ...rest }) {
  return createElement('a', { href, ...rest }, children);
}
