/**
 * Where an online course links to — ONE definition.
 *
 * Online courses run on 9Expert Academy, not on this site, so every surface
 * that renders one links OUT: `website_urls[0]` when the feed carries a direct
 * link, the academy root when it does not. That fallback is the interesting
 * half — a course with an empty `website_urls` must still be reachable, and a
 * second copy of this rule that forgot the fallback would render a dead card
 * rather than an error.
 *
 * Kept as its own module (rather than inline in a card) because it now has two
 * consumers — the home-page card and the /search result card — and mirrors the
 * shape of courseRegistrationHref.js.
 */

import { siteConfig } from '@/config/site';

/**
 * @param {{ website_urls?: string[] }} course an `o_course_*` feed row
 * @returns {string} always an absolute, outbound URL — never null
 */
export function onlineCourseHref(course) {
  const first = Array.isArray(course?.website_urls) ? course.website_urls[0] : null;
  return typeof first === 'string' && first.trim() ? first : siteConfig.academyUrl;
}
