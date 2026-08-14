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

/** `#abc` → `#aabbcc`. The same colour, written so an 8-digit alpha suffix can
 *  be appended — not a value change: #abc and #aabbcc are identical by spec. */
function expandHex(hex) {
  const s = hex.slice(1);
  return s.length === 3 ? `#${s.split('').map((c) => c + c).join('')}` : hex;
}

/** The neutral, for a programme with no usable colour. NOT a colour value: a
 *  token that already exists, so this adds nothing to the palette. */
export const NO_ACCENT_COLOR = 'var(--text-muted)';

/**
 * ── THE BAND'S ALPHA, AND WHY IT IS THIS NUMBER ────────────────────────────
 *
 * The band sits BEHIND the group name and count, so its strength is a
 * readability budget rather than a taste question. Measured across all 27 live
 * programme colours, blended over both theme surfaces (#F8FAFD / #1A2D42) and
 * contrasted against the text that sits on it — worst case, i.e. peak alpha
 * directly behind the text:
 *
 *   alpha   name (light / dark)     count (light / dark)
 *   0.10    6.13 / 6.90             4.36 / 2.00
 *   0.14    5.68 / 6.25             4.04 / 1.82     ← chosen
 *   0.20    5.05 / 5.29             3.59 / 1.54
 *   0.30    4.09 / 4.11             2.91 / 1.19     name drops below AA
 *
 * 0.14 keeps the NAME comfortably past 4.5:1 in both themes for every colour
 * (worst: Microsoft Access in light, Microsoft Fabric in dark) while still
 * being a visible wash. Going to 0.20 buys little tint and costs a third of
 * the remaining headroom; going to 0.30 puts the name itself below AA.
 *
 * THE COUNT IS THE WEAK ELEMENT, AND IT WAS ALREADY WEAK: `--text-muted` is
 * #5E6A7E in BOTH themes and scores 2.56:1 on the bare dark surface before any
 * band exists. The band worsens an existing shortfall rather than creating one;
 * fixing it means changing a token per theme, which is a palette decision and
 * out of scope here. Recorded, not fixed.
 *
 * The figures above are the WORST case. The gradient reaches transparent at
 * 55%, and the count sits well right of the name, so in practice it is over a
 * much weaker part of the ramp than these numbers assume.
 */
export const BAND_ALPHA = 0.14;
const BAND_ALPHA_HEX = Math.round(BAND_ALPHA * 255).toString(16).padStart(2, '0'); // '24'

/** Where the band has faded out completely. */
const BAND_END = '55%';

/**
 * The header band for one colour, or `null` when there is none to draw.
 *
 * FADES TO `transparent`, never to a light or dark literal: the row has to sit
 * on whatever surface the theme provides, and a hard-coded end stop would be a
 * second palette wearing a gradient. `transparent` composites against the real
 * surface in both themes by construction.
 */
export function programBandStyle(color) {
  if (typeof color !== 'string' || !HEX.test(color)) return null;
  return `linear-gradient(90deg, ${expandHex(color)}${BAND_ALPHA_HEX} 0%, transparent ${BAND_END})`;
}

/**
 * An icon URL we are willing to put in `src`.
 *
 * http(s) only. Upstream is free text; anything else is treated as absent so
 * the row degrades to name + count rather than to a broken-image box.
 */
const ICON_URL = /^https?:\/\/\S+$/i;

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
  const icons = {};
  for (const p of programs ?? []) {
    const id = String(p?.program_id ?? '').trim();
    if (!id) continue;
    names[id] = p?.program_name ?? '';
    const raw = String(p?.programcolor ?? '').trim();
    if (HEX.test(raw)) colors[id] = raw;
    /**
     * `programiconurl` — the SAME field the mega menu renders, not
     * `ProgramOrder.iconUrl`. That Mongo field is a MIRROR written by
     * syncProgramsFromAPI and refreshed only when somebody presses sync on
     * /admin/programs, and it has already drifted: measured 2026-08-14, GHC
     * (GitHub Copilot) holds a superseded Cloudinary version in Mongo while
     * upstream carries a newer one. Upstream is authoritative.
     */
    const icon = String(p?.programiconurl ?? '').trim();
    if (ICON_URL.test(icon)) icons[id] = icon;
  }
  return { names, colors, icons };
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
    return { color, matched: true, band: programBandStyle(color) };
  }
  return { color: NO_ACCENT_COLOR, matched: false, band: null };
}

/**
 * The icon URL for one group, or `''`.
 *
 * A SEPARATE lookup from the colour on purpose: the two are independent
 * upstream, so a programme can have an icon and no colour, or the reverse, and
 * folding them into one "matched" flag would make one of those states
 * unrepresentable.
 *
 * @param {Record<string,string>} icons from `buildProgramIndex`
 * @param {string} programId
 * @returns {string} '' when there is no usable icon
 */
export function programIconOf(icons, programId) {
  const id = String(programId ?? '').trim();
  const url = id ? icons?.[id] : undefined;
  return typeof url === 'string' && ICON_URL.test(url) ? url : '';
}
