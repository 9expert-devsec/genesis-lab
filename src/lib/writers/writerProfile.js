import { onlineCourseInstructors } from '@/lib/onlineCourseInstructors';
import { WRITER_SECTIONS } from '@/lib/writers/writerFields';
import { writerPath } from '@/lib/writers/writerUrls';

/**
 * The rules behind /writer and /writer/[slug].
 *
 * Pure: the pages read, these decide. That is what lets the redirect, the page
 * bounds and the collapse rules run in the test tier without a database.
 */

export const WRITER_ARTICLES_PER_PAGE = 12;
export const WRITER_ONLINE_COURSE_LIMIT = 4;

/**
 * What the route does with a slug's row.
 *
 * The default writer always renders, even if a row were switched off by hand:
 * the redirect points at that writer, so following it would loop.
 *
 * @returns {'not-found'|'redirect'|'render'}
 */
export function writerRouteAction(writer) {
  if (!writer) return 'not-found';
  if (writer.isActive === false && writer.isDefault !== true) return 'redirect';
  return 'render';
}

/**
 * `?page=` as a positive whole number. Absent is page 1; anything else that is
 * not one (`0`, `-1`, `1.5`, `abc`, a repeated key) is null, which the page turns
 * into a 404 like any other page that does not exist.
 */
export function parseProfilePage(raw) {
  if (raw === undefined) return 1;
  const text = String(raw);
  if (!/^[1-9]\d*$/.test(text)) return null;
  const page = Number(text);
  return Number.isSafeInteger(page) ? page : null;
}

/** Page 1 always exists. Past it, a page must hold at least one article. */
export function isProfilePageInRange(page, total, perPage = WRITER_ARTICLES_PER_PAGE) {
  return page === 1 || (page - 1) * perPage < total;
}

/**
 * The page links to draw: the first, the last and the current page with its
 * neighbours, with null for each gap. Academy alone runs to 42 pages.
 */
export function pagerPages(page, totalPages) {
  const wanted = [1, page - 1, page, page + 1, totalPages]
    .filter((n) => n >= 1 && n <= totalPages);
  const pages = [...new Set(wanted)].sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i > 0 && n - pages[i - 1] > 1 ? [null, n] : [n]));
}

/**
 * The name for headings: the nickname in brackets when the display name has one,
 * so `ชไลเวท พิพัฒพรรณวงศ์ (อ.เวท)` reads `อ.เวท`, or else the whole name.
 */
export function writerShortName(writer) {
  const name = String(writer?.displayName ?? '').trim();
  return name.match(/\(([^()]+)\)\s*$/)?.[1].trim() || name;
}

/**
 * Who /writer lists, and in what order: active, with at least one published
 * article, the default writer first, then most articles first. Names break ties
 * so the order does not change between renders.
 *
 * @param {object[]} writers
 * @param {Map<string, number>} counts  published articles per writer id
 */
export function planWriterList(writers, counts) {
  return (writers ?? [])
    .map((writer) => ({ ...writer, articleCount: counts?.get(String(writer._id)) ?? 0 }))
    .filter((writer) => writer.isActive !== false && writer.articleCount > 0)
    .sort((a, b) => (
      Number(b.isDefault === true) - Number(a.isDefault === true)
      || b.articleCount - a.articleCount
      || String(a.displayName).localeCompare(String(b.displayName), 'th')
    ));
}

/** The pills above the name, in order. */
export function writerRolePills(writer, hasInstructor) {
  if (writer?.isDefault === true) return ['ผู้เขียน', 'ผู้เขียนหลัก'];
  return hasInstructor ? ['ผู้เขียน', 'วิทยากร 9Expert'] : ['ผู้เขียน'];
}

/**
 * The online courses an instructor teaches: an exact match on the English name.
 * A writer with no linked instructor, or one with no `name_en`, matches nothing:
 * onlineCourseInstructors never returns a blank name.
 */
export function matchOnlineCourses(courses, instructorNameEn) {
  const name = String(instructorNameEn ?? '').trim();
  return (courses ?? [])
    .filter((course) => onlineCourseInstructors(course).some((i) => i.name === name))
    .slice(0, WRITER_ONLINE_COURSE_LIMIT);
}

/**
 * What the profile body shows. A section with no items is not rendered, an empty
 * aside gives the left column the full width, and with nothing on either side the
 * body is skipped so the articles follow the hero.
 */
export function writerProfileLayout({ sections, programs, onlineCourses }) {
  const visibleSections = WRITER_SECTIONS
    .map(({ key, label }) => ({
      key,
      label,
      items: (sections?.[key] ?? []).map((item) => String(item ?? '').trim()).filter(Boolean),
    }))
    .filter((section) => section.items.length > 0);

  const showPrograms = (programs?.length ?? 0) > 0;
  const showOnlineCourses = (onlineCourses?.length ?? 0) > 0;
  const showAside = showPrograms || showOnlineCourses;

  return {
    visibleSections,
    showPrograms,
    showOnlineCourses,
    showAside,
    showBody: showAside || visibleSections.length > 0,
  };
}

/** The sitemap's rows, for exactly the writers /writer lists. */
export function writerSitemapEntries(writers, base) {
  return (writers ?? []).map((writer) => ({
    url: `${base}${writerPath(writer.slug)}`,
    lastModified: writer.updatedAt ? new Date(writer.updatedAt) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));
}
