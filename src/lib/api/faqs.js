/**
 * FAQs adapter.
 *
 * Upstream path: `/faqs` (plural — per integration guide summary).
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/faqs';

export async function listFaqs() {
  const raw = await aiFetch(PATH, { tags: ['faqs'] });
  return unwrap(raw);
}
