/**
 * The programme's own colour, for the /admin/courses group headers.
 *
 * ── WHERE THE COLOUR COMES FROM, AND WHERE IT DOES NOT ─────────────────────
 * `programcolor` is a field on the upstream `/programs` response — the same
 * value the public course hero and the programme page already paint with:
 *
 *   · (public)/[...slug]/page.jsx   `programMatch?.programcolor ?? skillcolor ?? '#005CFF'`
 *   · (public)/program/[slug]/…     `programcolor` → a two-stop gradient
 *
 * There is NO token map, no image sampling and no Mongo field. `ProgramOrder`
 * carries `iconUrl` and deliberately does not carry a colour; nothing here adds
 * one. This module reads the upstream value and nothing else, so a colour
 * changed upstream changes every surface at once, admin included.
 *
 * ── WHY THE ADMIN SCREEN CANNOT JUST IMPORT THE ADAPTER ────────────────────
 * `src/lib/api/programs.js` reaches `aiFetch`, which reads `AI_API_KEY` at
 * module scope. Importing it from a client component would pull server
 * configuration into the browser bundle. So the maps are built on the server —
 * from the `listPrograms()` call /admin/courses already makes — and handed down
 * as plain objects, and only this pure accessor crosses into the client.
 *
 * ── ONE WALK, TWO MAPS ─────────────────────────────────────────────────────
 * `buildProgramIndex` produces the name map and the colour map together, from
 * one pass over one array, under one key discipline. Two hand-rolled
 * `Object.fromEntries` calls would be two chances to key one of them by `_id`
 * and the other by `program_id` — which is exactly the mismatch the grouping
 * already had to be careful about (see programKeyOf in courseOrder.js).
 */

/**
 * A CSS hex colour, `#rgb` or `#rrggbb`. Anything else is treated as absent.
 *
 * Upstream is free text. A malformed value handed to `style` renders as
 * nothing, which would look identical to "no colour set" — and the whole point
 * of the neutral is that it is DISTINGUISHABLE from a real colour. Rejecting a
 * value we cannot paint means the neutral shows instead, which is honest.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The neutral, for a programme with no usable colour. NOT a colour value: a
 *  token that already exists, so this adds nothing to the palette. */
export const NO_ACCENT_COLOR = 'var(--text-muted)';

/**
 * Both maps for the admin list, keyed by `program_id` — the CODE, matching
 * `programKeyOf` and `ProgramOrder.programId`, never the ObjectId.
 *
 * @param {Array<object>} programs items from `listPrograms()`
 * @returns {{names: Record<string,string>, colors: Record<string,string>}}
 */
export function buildProgramIndex(programs) {
  const names = {};
  const colors = {};
  for (const p of programs ?? []) {
    const id = String(p?.program_id ?? '').trim();
    if (!id) continue;
    names[id] = p?.program_name ?? '';
    const raw = String(p?.programcolor ?? '').trim();
    if (HEX.test(raw)) colors[id] = raw;
  }
  return { names, colors };
}

/**
 * The accent for one group.
 *
 * Returns `matched: false` for a programme with no usable colour — a new one
 * created upstream without one, a group whose `program_id` is in no
 * `/programs` entry, or the whole list when `listPrograms()` failed and
 * page.jsx fell back to `[]`. That last case is the one worth naming: it turns
 * EVERY group neutral at once, so the neutral has to be a state the screen can
 * wear without looking broken.
 *
 * Measured against production on 2026-08-14: 27 of 27 programmes carry a
 * colour and all 25 that appear as course groups are matched, so the neutral
 * has no live instance today. That is precisely why it is asserted rather than
 * eyeballed.
 *
 * @param {Record<string,string>} colors from `buildProgramIndex`
 * @param {string} programId
 * @returns {{color: string, matched: boolean}}
 */
export function programAccentOf(colors, programId) {
  const id = String(programId ?? '').trim();
  const color = id ? colors?.[id] : undefined;
  if (typeof color === 'string' && HEX.test(color)) {
    return { color, matched: true };
  }
  return { color: NO_ACCENT_COLOR, matched: false };
}
