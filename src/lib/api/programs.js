/**
 * Programs adapter.
 * Upstream path: `/programs` — canonical envelope with `summary.total`.
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/programs';

export async function listPrograms() {
  const raw = await aiFetch(PATH, { tags: ['programs'] });
  return unwrap(raw);
}
