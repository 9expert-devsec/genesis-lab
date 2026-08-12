/**
 * `next/headers` for the scratch walkthrough ONLY.
 *
 * syncLandingData imports getActiveBanners and the featured-* readers, which
 * are 'use server' modules reaching next-auth → next/headers. None of them is
 * CALLED with a session in this walk — the sync only reads their public data —
 * but the import must resolve.
 *
 * Deliberately NOT added to test/loader.mjs. That loader is shared by 252 test
 * files and stubbing next/headers there would let modules import which
 * currently cannot, changing what the render tier exercises. A walkthrough
 * script is not a reason to move the suite's boundaries.
 */
export function cookies() { return { get: () => undefined, getAll: () => [], has: () => false }; }
export function headers() { return new Map(); }
export function draftMode() { return { isEnabled: false }; }
