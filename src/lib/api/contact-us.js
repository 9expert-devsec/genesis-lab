/**
 * Contact Us adapter.
 *
 * Upstream path: `/contact-us` (singular — per integration guide summary).
 * Returns a singleton (single record), not a list.
 * curl-verified: NOT YET
 */

import { aiFetch, unwrap } from './client';

const PATH = '/contact-us';

/**
 * Get contact information (address, phone, email, map coordinates, social).
 * Returns the first item in the envelope, or null.
 */
export async function getContactInfo() {
  const raw = await aiFetch(PATH, { tags: ['contact-us'] });
  const { items } = unwrap(raw);
  return items[0] ?? null;
}
