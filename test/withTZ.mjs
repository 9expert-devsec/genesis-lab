/**
 * Force `process.env.TZ` for a synchronous block, and actually restore it.
 *
 * EXTRACTED VERBATIM from test/pure/articlePublishTime.test.mjs, which is where
 * this was worked out and where its controls still live. It is shared rather
 * than copied because the restore is the part that took a bug to get right, and
 * a second copy of a restore mechanism is a second chance to get it wrong — in
 * a way whose failure lands in an unrelated file.
 *
 * ── WHY THE RESTORE IS NOT `delete process.env.TZ` ──────────────────────────
 * `process.env.TZ` is normally UNSET and the runtime falls back to the OS zone.
 * Deleting it does NOT put that fallback back. Verified on Node 22 / Windows:
 * set TZ=America/Los_Angeles, delete it, and Date parsing stays on Los Angeles.
 * So the naive `if (prev === undefined) delete …` restore leaks the LAST zone
 * used into every test that runs afterwards, in every tier. (It did: the first
 * draft of articlePublishTime.test.mjs reddened a page-builder schedule render
 * test 300 lines away.) Capturing the RESOLVED ambient zone at module load and
 * assigning it back makes the restore an actual restore.
 *
 * ── SYNCHRONOUS ONLY ────────────────────────────────────────────────────────
 * test/run.mjs drives the runner with `isolation: 'none'` and
 * `concurrency: true`, so this variable is shared with every other test in
 * every tier. `withTZ` therefore contains no `await` and restores in a
 * `finally`: the moment a mutation spans a microtask boundary it leaks into
 * whatever else is mid-flight. Passing an async `fn` is a bug this cannot
 * detect — do not. Two callers doing synchronous work cannot interleave, which
 * is what makes sharing this across test files safe.
 */

/** The zone this process was ACTUALLY in before anything here touched it. */
export const AMBIENT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The observable consequence of the current zone — used to prove restoration. */
export const zoneProbe = () => new Date('2026-07-30T18:00').toISOString();

export const AMBIENT_PROBE = zoneProbe();

/** Run `fn` with process.env.TZ forced. SYNCHRONOUS ONLY — see above. */
export function withTZ(tz, fn) {
  const prev = process.env.TZ ?? AMBIENT_TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = prev;
  }
}
