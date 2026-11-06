import { avatarUrl } from '@/lib/avatar/avatarUrl';

/**
 * Where a writer lives on the site, in one place.
 *
 * Slugs match WRITER_SLUG_RE, so they need no encoding.
 */

export const WRITER_LIST_PATH = '/writer';

/**
 * Where a deactivated writer's page redirects. The slug is locked after creation
 * and this writer cannot be deactivated or deleted, so the address is stable.
 */
export const DEFAULT_WRITER_SLUG = '9expert-academy';

export function writerPath(slug) {
  return `${WRITER_LIST_PATH}/${slug}`;
}

export const DEFAULT_WRITER_PATH = writerPath(DEFAULT_WRITER_SLUG);

/**
 * The avatar as an absolute URL, or null.
 *
 * Null rather than the bundled default: structured data and share cards should
 * say nothing over naming a stock silhouette as this person's picture. 256 is
 * the largest size avatarUrl allows.
 */
export function writerImageUrl(writer) {
  const url = avatarUrl(writer?.avatarPublicId || null, 256);
  return url.startsWith('https://') ? url : null;
}
