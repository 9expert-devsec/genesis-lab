/**
 * The field whitelist for a ProgramPageConfig / SkillPageConfig save. A key not
 * listed here never reaches the database, whatever the form sends.
 *
 * It lives outside lib/actions/page-configs because a 'use server' module can
 * only export async functions, and this has to be callable from a test.
 * catalogPdf is deliberately absent: lib/actions/page-catalogs owns it.
 *
 * Pure; no I/O.
 */

export function normalizeSlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^\/+/, '');
  return trimmed || null;
}

export function shapePageConfigUpdate(programOrSkillId, key, data) {
  const slug = normalizeSlug(data?.urlSlug);
  return {
    [key]: programOrSkillId,
    urlSlug: slug,
    heroTitle: String(data?.heroTitle ?? '').trim(),
    heroDescription: String(data?.heroDescription ?? '').trim(),
    metaTitle: String(data?.metaTitle ?? '').trim(),
    metaDescription: String(data?.metaDescription ?? '').trim(),
    ogImage: String(data?.ogImage ?? '').trim(),
    isPublished:
      typeof data?.isPublished === 'boolean' ? data.isPublished : true,
  };
}
