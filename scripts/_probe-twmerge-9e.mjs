/**
 * DOES twMerge COLLAPSE THIS REPO'S `9e-*` COLOUR CLASSES?
 *
 * The standing rule says it does not, and that premise is the whole reason the
 * tab states are a cva variant rather than a className override. A control
 * written to prove the premise FAILED, so the premise is measured here directly
 * rather than argued about.
 *
 * Usage: node scripts/_probe-twmerge-9e.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));

const { cn } = await import('@/lib/utils');

const PAIRS = [
  // text colour, both operands a 9e-* single token
  ['text-9e-ice', 'text-9e-action'],
  ['text-9e-navy', 'text-9e-air'],
  // background, same shape
  ['bg-9e-navy', 'bg-[var(--surface-raised)]'],
  ['bg-9e-navy', 'bg-transparent'],
  // a 9e-* SCALE (the numbered ones) — a different beast from the flat tokens
  ['text-9e-signature-50', 'text-9e-signature-900'],
  ['bg-9e-action-scale-50', 'bg-9e-action-scale-900'],
  // opacity-modified
  ['bg-9e-action/10', 'bg-9e-air/15'],
  // stock, as the baseline — these MUST collapse or `cn` itself is broken
  ['text-red-500', 'text-blue-500'],
  ['bg-red-500', 'bg-blue-500'],
  // radius, a non-colour extend — the 9e-* radii are theme.extend.borderRadius
  ['rounded-9e-md', 'rounded-9e-lg'],
  // shadow, likewise
  ['shadow-9e-sm', 'shadow-9e-lg'],
];

console.log('');
console.log('══ twMerge BEHAVIOUR ON `9e-*` UTILITIES ══════════════════════════════════');
console.log('   COLLAPSED = only the last class survives (an override would work)');
console.log('   BOTH KEPT = both survive; the winner is decided by CSS emission order');
console.log('');
for (const [a, b] of PAIRS) {
  const out = cn(a, b);
  const parts = out.split(/\s+/).filter(Boolean);
  const collapsed = parts.length === 1 && parts[0] === b;
  console.log(`   ${collapsed ? 'COLLAPSED' : 'BOTH KEPT'}  cn(${JSON.stringify(a)}, ${JSON.stringify(b)}) → ${JSON.stringify(out)}`);
}
console.log('');
