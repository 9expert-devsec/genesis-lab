import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The admin rail's colour discipline: no raw hex, and no theme variants.
 *
 * ══ THESE TWO GUARDS KEEP THE ROUND'S PREMISE TRUE ══════════════════════════
 * The premise was "colour comes from this project's CI tokens, and the rail
 * renders the same in both themes". Both are the kind of claim that is true on
 * the day it is written and quietly stops being true three commits later,
 * because both are violated by ADDING something rather than by breaking
 * something — a `#1f2937` pasted from a mockup, a `dark:bg-...` copied from the
 * row above. Neither breaks a render, neither fails a build, and neither shows
 * up in any other test in this suite.
 *
 * ── COMMENTS ARE STRIPPED, AND THAT IS LOAD-BEARING HERE ────────────────────
 * This file's subject is hex literals, and the component's comments discuss hex
 * literals by name — "#48B0FF", "#0D1B2A" — because explaining a colour choice
 * without naming the colour is not much of an explanation. Read through
 * `readSource().code`, those are gone, so prose about a colour cannot fail a
 * guard about using one. That is defect 1 in test/sourceScan.mjs's header,
 * pre-empted rather than rediscovered.
 *
 * ── THE ONE EXCLUSION, BY ELEMENT AND NOT BY FILE ───────────────────────────
 * LogoutModal lives in AdminSidebar.jsx and is NOT the rail: it is
 * `fixed inset-0`, a dialog over the main column, and it follows the theme like
 * every other admin dialog. It is excluded from the theme-invariance guard by
 * NAME — the function is located and its body carved out — rather than the file
 * being excluded, because a file-level exclusion would let a `dark:` variant
 * back onto the rail itself with nothing to notice.
 *
 * It is NOT excluded from the no-hex guard, and does not need to be: its one
 * literal (`dark:bg-[#111d2c]`, a colour matching no palette entry) became
 * `bg-[var(--surface)]` in the same round. An exclusion is how the next literal
 * gets in.
 */

/**
 * The files that paint the admin rail.
 *
 * A LIST, not a directory walk, and the reason is that a walk would have to
 * decide what "a sidebar component" is — and would then either miss a new file
 * or drag in every admin screen. Two entries today; anything that starts
 * painting the rail belongs here, and the test below fails loudly if a listed
 * file stops existing.
 */
const RAIL_FILES = [
  'src/components/layout/AdminSidebar.jsx',
  // Renders <AdminSidebar> and owns the shell around it. No rail colour of its
  // own today, and this guard is what keeps it that way.
  'src/app/admin/layout.jsx',
];

test('the rail files exist and were actually read', () => {
  // Every assertion below is a "does NOT contain" check, which passes
  // triumphantly against an empty string. The read is proven first.
  for (const rel of RAIL_FILES) {
    const { code } = readSource(rel);
    assert.ok(code.length > 200, `${rel} read as ${code.length} chars — the scan is wrong`);
  }
});

// ── C6.1: no raw hex ────────────────────────────────────────────────────────
test('no #rrggbb literal appears in any rail component file', () => {
  const offenders = [];
  for (const rel of RAIL_FILES) {
    const { code } = readSource(rel);
    for (const m of code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      // Report with a little context so the red says WHERE, not just THAT.
      const line = code.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line} → ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'a raw colour literal is back in a rail component. Colour comes from the '
    + '--admin-rail-* tokens in globals.css; if none of them fits, ADD one there '
    + 'following the naming convention — never inline it here',
  );
});

test('CONTROL: the hex matcher finds a hex when there is one', () => {
  // Without this, a broken regex reports [] forever and the guard above is a
  // decoration. The fixture is local, so the control stays green while the real
  // assertion goes red.
  const fixture = 'className="bg-[#1f2937] text-[var(--admin-rail-item)]"';
  assert.equal([...fixture.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length, 1);
  assert.equal([...'className="bg-[var(--x)]"'.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length, 0);
});

// ── C6.3: theme invariance ──────────────────────────────────────────────────

/**
 * The source of a file with LogoutModal's body removed.
 *
 * Shape-bound (test/sourceScan.mjs, defect 7): it finds the function by name
 * and cuts to the next top-level `}`. If that component is renamed, moved to
 * its own file, or reshaped, this stops excluding what it means to exclude —
 * and the assertion that follows would then FAIL rather than pass, which is the
 * right direction for a scan that has lost its footing.
 */
function withoutLogoutModal(code) {
  const start = code.indexOf('function LogoutModal(');
  if (start === -1) return code; // already extracted elsewhere; nothing to carve
  const end = code.indexOf('\n}', start);
  assert.notEqual(end, -1, 'LogoutModal is unterminated — the carve-out is wrong');
  return code.slice(0, start) + code.slice(end);
}

test('no dark: variant remains on the rail itself', () => {
  const offenders = [];
  for (const rel of RAIL_FILES) {
    const railOnly = withoutLogoutModal(readSource(rel).code);
    for (const m of railOnly.matchAll(/\bdark:[\w[\]/.#-]+/g)) offenders.push(`${rel} → ${m[0]}`);
  }
  assert.deepEqual(
    offenders, [],
    'the admin rail renders the same dark CI surface in light mode and in dark '
    + 'mode, so a dark: variant on it is either dead code a later reader will '
    + '"restore", or live code producing exactly the half-theming the ruling '
    + 'forbids — a card that flips while the rail behind it does not',
  );
});

test('the exclusion is scoped to LogoutModal and nothing else', () => {
  // The carve-out must be narrow. If it silently swallowed the whole file, the
  // assertion above would pass against an empty string — so this proves the
  // dialog's OWN variants survive the cut everywhere else, and that the cut
  // removes a plausible amount of text rather than most of the component.
  const { code } = readSource('src/components/layout/AdminSidebar.jsx');
  const railOnly = withoutLogoutModal(code);
  assert.ok(code.includes('function LogoutModal('), 'LogoutModal moved — re-read this guard');
  assert.ok(!railOnly.includes('function LogoutModal('), 'the carve-out removed nothing');
  assert.ok(
    railOnly.length > code.length * 0.8,
    `the carve-out removed ${code.length - railOnly.length} of ${code.length} chars — `
    + 'far more than one dialog, so the guard above is checking almost nothing',
  );
  // And the dialog really is the only thing in this file that still theme-switches.
  assert.match(code, /dark:/, 'no dark: variant anywhere — has the dialog been restyled too?');
});

test('the rail paints from --admin-rail-* and not from the theme-aware tokens', () => {
  // The other direction. A rail element reading --surface or --text-primary
  // carries no `dark:` variant and no hex, so both guards above stay green
  // while it flips with the theme anyway — the tokens do the flipping.
  const railOnly = withoutLogoutModal(readSource('src/components/layout/AdminSidebar.jsx').code);
  const themeAware = [...railOnly.matchAll(/var\(--(surface|surface-muted|surface-border|surface-raised|surface-hover|text-primary|text-secondary|text-muted|page-bg)\)/g)]
    .map((m) => m[0]);
  assert.deepEqual(
    themeAware, [],
    'a rail element reads a theme-aware token. Those resolve differently under '
    + '.dark, so this element flips while the rail behind it does not — and '
    + 'neither the hex guard nor the dark: guard can see it',
  );
});

test('the rail actually uses the rail tokens — the guards are not vacuous', () => {
  // Everything above is a prohibition. If AdminSidebar stopped painting
  // altogether, every one of them would pass. This is the positive claim.
  const { code } = readSource('src/components/layout/AdminSidebar.jsx');
  const used = new Set([...code.matchAll(/var\(--(admin-rail-[\w-]+)\)/g)].map((m) => m[1]));
  for (const token of [
    'admin-rail-surface', 'admin-rail-divider', 'admin-rail-hover',
    'admin-rail-brand', 'admin-rail-brand-accent',
    'admin-rail-item', 'admin-rail-group',
    'admin-rail-active-bg', 'admin-rail-active-fg', 'admin-rail-focus',
    'admin-rail-card', 'admin-rail-card-hover', 'admin-rail-card-fg',
    'admin-rail-card-muted',
    // --admin-rail-scroll-track and --admin-rail-scroll-thumb are absent on
    // purpose and must stay absent: the scrollbar is painted by rules in
    // globals.css, not by this component, so they never appear in `code` and
    // adding them here would go red for the wrong reason. Their positive claim
    // lives in test/fs/adminRailScrollbar instead.
  ]) {
    assert.ok(used.has(token), `--${token} is declared but never used by the rail`);
  }
});
