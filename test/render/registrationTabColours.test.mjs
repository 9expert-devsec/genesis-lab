import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClipboardList, Users, History } from 'lucide-react';
import { TabList } from '@/app/admin/registrations/_components/detailShell';
import { readSource } from '../sourceScan.mjs';
import { cn } from '@/lib/utils';
import { contrastRatio } from '@/lib/articles/normalizeAuthoredColors';

/**
 * THE RESTYLED TAB GROUP.
 *
 * The shipped selected tab was a dark navy slab (`bg-9e-navy text-9e-ice`). The
 * design's treatment inverts it: the GROUP is a light neutral surface, the
 * SELECTED tab is a raised white card carrying a BLUE label and icon, and the
 * unselected tabs are transparent.
 *
 * Three separate claims are asserted here and they fail in different ways, which
 * is why they are not one test:
 *
 *   1. WHAT RENDERS — the two states carry the classes they are supposed to.
 *   2. HOW IT IS EXPRESSED — a cva variant rather than a className override,
 *      because the two states are a CLOSED CHOICE. §3 measures twMerge's actual
 *      behaviour, in both directions, and it is not what the standing rule says:
 *      the `9e-*` COLOURS do collapse and `rounded-9e-*` does not.
 *   3. WHETHER IT IS LEGIBLE — the computed contrast of both labels, in BOTH
 *      themes. The design is drawn in light; the dark half is where a token
 *      chosen by name rather than by number goes wrong, and it did.
 */

const TABS = [
  { key: 'registration', label: 'ข้อมูลการสมัคร', icon: ClipboardList },
  { key: 'attendees', label: 'ผู้เข้าอบรม', icon: Users, count: 2 },
  { key: 'history', label: 'ประวัติการดำเนินการ', icon: History },
];

const MARKUP = renderToStaticMarkup(
  createElement(TabList, {
    tabs: TABS,
    active: 'registration',
    onSelect: () => {},
    idFor: (k, kind) => `t-${kind}-${k}`,
  }),
);

/** Every `role="tab"` button's open tag, in document order. */
const tabTags = (markup) => [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);

const classesOf = (tag) => (/\sclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/).filter(Boolean);

const selectedTag = (markup) => {
  const found = tabTags(markup).filter((t) => t.includes('aria-selected="true"'));
  assert.equal(found.length, 1, `expected exactly one selected tab, found ${found.length}`);
  return found[0];
};

const unselectedTags = (markup) =>
  tabTags(markup).filter((t) => t.includes('aria-selected="false"'));

// ── 1. What renders ─────────────────────────────────────────────────────────

test('the tab GROUP is a light neutral surface', () => {
  const group = /<div[^>]*role="tablist"[^>]*>/.exec(MARKUP)[0];
  assert.ok(group.includes('bg-[var(--surface-muted)]'), 'the group is not the muted surface');
  assert.ok(!group.includes('bg-9e-navy'), 'the group is dark');
});

test('the SELECTED tab is a raised card with a BLUE label — not a dark slab', () => {
  const cs = classesOf(selectedTag(MARKUP));
  assert.ok(cs.includes('bg-[var(--surface-raised)]'), `selected tab is not a raised card: [${cs.join(' ')}]`);
  assert.ok(cs.includes('text-9e-action'), 'the selected label is not the action blue');
  assert.ok(cs.includes('dark:text-9e-air'), 'the selected label has no dark-theme colour');

  /**
   * THE SHADOW IS LOAD-BEARING, NOT ORNAMENT. --surface-raised against
   * --surface-muted is 1.05:1 in light — a white card on a near-white group —
   * so with the shadow gone the selected tab is distinguished by its label
   * colour alone. Asserted so a tidy-up cannot read it as decoration.
   */
  assert.ok(cs.includes('shadow-9e-sm'), 'the raised card has no elevation at all');

  // The retired treatment, named, so it cannot come back quietly.
  assert.ok(!cs.includes('bg-9e-navy'), 'the selected tab is still the dark slab');
  assert.ok(!cs.includes('text-9e-ice'), 'the selected label is still the on-dark colour');
});

test('UNSELECTED tabs are transparent with muted labels', () => {
  const tags = unselectedTags(MARKUP);
  assert.equal(tags.length, 2, 'the fixture should leave two tabs unselected');
  for (const tag of tags) {
    const cs = classesOf(tag);
    assert.ok(cs.includes('bg-transparent'), `an unselected tab has a surface: [${cs.join(' ')}]`);
    assert.ok(cs.includes('text-[var(--text-secondary)]'), 'an unselected label is not muted');
    assert.ok(!cs.includes('text-9e-action'), 'an unselected label is the selected blue');
    assert.ok(!cs.includes('shadow-9e-sm'), 'an unselected tab is raised');
  }
});

test('the ICON takes the label colour rather than carrying its own', () => {
  /**
   * A second place for the selected blue to live is a second place for it to
   * drift. lucide renders with `currentColor` by default, so the icon inherits —
   * and the assertion is that NO colour utility was added to it, which is the
   * thing a future edit would do.
   */
  const icons = [...MARKUP.matchAll(/<svg[^>]*class="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(icons.length >= 3, 'the tab icons did not render');
  for (const cls of icons) {
    assert.ok(!/\btext-/.test(cls), `a tab icon carries its own colour: [${cls}]`);
  }
});

// ── 2. How it is expressed ──────────────────────────────────────────────────

const SHELL = readSource('src/app/admin/registrations/_components/detailShell.jsx');

test('the two states are a cva VARIANT, not a className override', () => {
  assert.match(SHELL.withImports, /import\s*\{\s*cva\s*\}\s*from\s*'class-variance-authority'/,
    'detailShell does not import cva');
  assert.match(SHELL.code, /const tabVariants = cva\(/, 'tabVariants is not a cva definition');
  assert.match(SHELL.code, /className=\{tabVariants\(\{ selected \}\)\}/,
    'the tab does not take its classes from the variant');
  assert.match(SHELL.code, /const tabCountVariants = cva\(/, 'the count badge is not a variant either');
});

test('the tab passes its class list through NO merge function', () => {
  /**
   * The strong form. `cva` being present is satisfied by a file that computes a
   * variant and then hands it to `cn` with an override beside it — a default
   * plus an exception, which is the shape the variant exists to replace. What is
   * asserted is that the variant call IS the className, with nothing around it.
   *
   * ── MATCHED LITERALLY, BECAUSE `[^}]*` CANNOT DO THIS ────────────────────
   * The first draft captured with `className=\{([^}]*)\}` and reddened on
   * correct source: the value contains its OWN braces (`tabVariants({ selected
   * })`), so the character class stopped at the inner `}` and captured
   * `tabVariants({ selected `. That is defect 6 from sourceScan's header in a
   * new costume — a matcher bounded by a delimiter that occurs inside the thing
   * being matched — and the fix is the same one: do not try to balance braces
   * with a regex when the exact expected text is known.
   */
  assert.ok(SHELL.code.includes('className={tabVariants({ selected })}'),
    "the tab's className is not the bare variant call");
  for (const wrapped of ['cn(tabVariants(', 'className={cn(tabVariants']) {
    assert.ok(!SHELL.code.includes(wrapped), `the variant is wrapped in a merge: ${wrapped}`);
  }
  assert.ok(SHELL.code.includes('className={tabCountVariants({ selected })}'),
    'the count badge is not the bare variant call either');
});

test('TabList accepts no className for its tabs — an override has nowhere to go', () => {
  // Not "overrides are discouraged" but "unrepresentable". The signature is the
  // guard: a prop that does not exist cannot be threaded to the wrong place.
  const sig = /export function TabList\(\{([^}]*)\}\)/.exec(SHELL.code);
  assert.ok(sig, 'TabList signature not found');
  assert.ok(!/className/.test(sig[1]), `TabList takes a className: [${sig[1].trim()}]`);
});

// ── 3. THE CONTROL: an override really would be ignored ─────────────────────

/**
 * ══ A MEASURED CORRECTION, PINNED IN BOTH DIRECTIONS ════════════════════════
 *
 * The standing rule reads "twMerge does not merge this repo's `9e-*` scales",
 * and the control written to prove it FAILED. Measured with
 * scripts/_probe-twmerge-9e.mjs, the truth is split:
 *
 *   · `9e-*` COLOUR utilities COLLAPSE correctly. twMerge groups by the utility
 *     PREFIX (`text-`, `bg-`) and treats the rest as an opaque value, so it
 *     never needs to know that `9e-action` is a colour. Flat tokens, numbered
 *     scales and opacity-modified forms all collapse.
 *   · `rounded-9e-*` DOES NOT COLLAPSE. `borderRadius` has a closed set of
 *     known suffixes, `9e-md` is not one, and twMerge emits BOTH.
 *
 * So the hazard is real but it lives on the RADII — which this file uses on
 * every card — and not on the tab colours. Both facts are asserted, because the
 * useful thing is not which one is true today but being told the day either
 * changes under a twMerge upgrade.
 */
test('CONTROL: twMerge DOES collapse 9e-* COLOUR utilities', () => {
  for (const [a, b] of [
    ['text-9e-ice', 'text-9e-action'],
    ['bg-9e-navy', 'bg-transparent'],
    ['bg-9e-action/10', 'bg-9e-air/15'],
    ['text-9e-signature-50', 'text-9e-signature-900'],
  ]) {
    assert.equal(cn(a, b).trim(), b,
      `cn(${a}, ${b}) did not collapse — the note in detailShell is now wrong in the other direction`);
  }
});

test('CONTROL: twMerge does NOT collapse rounded-9e-* — the real hazard', () => {
  /**
   * THE ONE THAT IS GENUINELY UNMERGEABLE, and it is used on every card in this
   * file. A caller passing `rounded-9e-md` to something already carrying
   * `rounded-9e-lg` gets both, and which one paints is decided by CSS emission
   * order — a property of the generated stylesheet that no reader of the call
   * site can see.
   */
  const merged = cn('rounded-9e-md', 'rounded-9e-lg');
  const parts = merged.split(/\s+/).filter(Boolean);
  assert.equal(parts.length, 2,
    `rounded-9e-* now collapses ([${merged}]) — the hazard note in detailShell can be revisited`);
  assert.ok(parts.includes('rounded-9e-md') && parts.includes('rounded-9e-lg'));
});

test('CONTROL: cn itself is not simply broken', () => {
  // Without this, "colours collapse" above is satisfied by a helper that always
  // returns its last argument, and "radii do not" by one that never merges.
  assert.equal(cn('text-red-500', 'text-blue-500').trim(), 'text-blue-500',
    'twMerge failed on two STOCK colour classes — cn is broken, not clever');
  assert.equal(cn('p-2', 'p-4').trim(), 'p-4', 'twMerge failed on stock padding');
  // …and it keeps genuinely unrelated classes.
  assert.equal(cn('flex', 'text-blue-500').split(/\s+/).length, 2, 'twMerge dropped an unrelated class');
});

// ── 4. Whether it is legible ────────────────────────────────────────────────

/** Straight from globals.css — light `:root`, then `.dark`. */
const TOKENS = {
  light: { raised: '#FFFFFF', muted: '#F8FAFD', secondary: '#465469', selected: '#005CFF' },
  dark:  { raised: '#1E3A5F', muted: '#1A2D42', secondary: '#C5CEDA', selected: '#48B0FF' },
};

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * 4.5:1 — WCAG AA for NORMAL text. The labels are 13px semibold, below the
 * 18.66px large-text threshold, so 3.0 does not apply to them.
 */
const AA = 4.5;

test('the SELECTED label clears AA against its own card, in both themes', () => {
  for (const [theme, t] of Object.entries(TOKENS)) {
    const ratio = contrastRatio(hexToRgb(t.selected), hexToRgb(t.raised));
    assert.ok(ratio >= AA,
      `${theme}: the selected label is ${ratio.toFixed(2)}:1 against ${t.raised}, below ${AA}`);
  }
});

test('the UNSELECTED labels clear AA against the group, in both themes', () => {
  for (const [theme, t] of Object.entries(TOKENS)) {
    const ratio = contrastRatio(hexToRgb(t.secondary), hexToRgb(t.muted));
    assert.ok(ratio >= AA,
      `${theme}: an unselected label is ${ratio.toFixed(2)}:1 against ${t.muted}, below ${AA}`);
  }
});

test('THE TOKENS THAT WERE REJECTED, and why — pinned so the choice is not re-made', () => {
  /**
   * ══ THE DESIGN, TAKEN LITERALLY, FAILS ══════════════════════════════════════
   *
   * Two near-misses are recorded as assertions rather than as prose, because
   * both are what a future reader would reach for first and both are wrong for
   * reasons only a number shows:
   *
   *   · `--text-muted` is the token literally NAMED "muted", and the design says
   *     "unselected tabs … with muted labels". It is 2.56:1 in dark. Using it
   *     would have been a regression introduced by following the brief.
   *   · `9e-brand` is the LOGO blue and the obvious choice for "a blue label".
   *     It fails in BOTH themes — 3.54 light, 3.25 dark — which is exactly what
   *     its own comment in tailwind.config.js warns about.
   *
   * If a token change ever makes one of these pass, this test goes red and the
   * decision gets re-made deliberately.
   */
  const textMutedDark = contrastRatio(hexToRgb('#5E6A7E'), hexToRgb(TOKENS.dark.muted));
  assert.ok(textMutedDark < AA,
    `--text-muted now clears AA in dark (${textMutedDark.toFixed(2)}:1) — reconsider it on purpose`);

  for (const [theme, t] of Object.entries(TOKENS)) {
    const brand = contrastRatio(hexToRgb('#2486FF'), hexToRgb(t.raised));
    assert.ok(brand < AA, `${theme}: 9e-brand now clears AA (${brand.toFixed(2)}:1) — reconsider it on purpose`);
  }
});
