/**
 * AboutConfig text as the /about-us page renders it. Pure.
 *
 * Only `tagline` is rendered: the เรื่องราวของเรา pull quote (split for
 * emphasis by quoteParts in ./quoteParts.js). The hero
 * paragraph is fixed design copy. description, mission and vision stay
 * admin-only — the live document holds unrelated values for them.
 */

/**
 * The tagline's default in the model and the admin action — so a missing
 * document and an untouched field read the same.
 */
export const DEFAULT_TAGLINE = 'สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"';

/** What the pull quote says when the tagline is empty. */
export const QUOTE_FALLBACK = 'สอนแบ่งปันความรู้เทคโนโลยี เพื่อขับเคลื่อนประเทศไทย';
