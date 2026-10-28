import { webrootRewrites } from '@/lib/webrootDocuments.mjs';

/**
 * The real size of the company profile PDF, for the caption on /about-us.
 *
 * The caption used to say "ประมาณ 22 MB", typed — and the webroot admin is
 * replace-only, so a new edition changes the bytes behind
 * /9expert-company-profile.pdf without touching this page. Reading the size
 * from the file itself means the caption follows the file.
 *
 * The URL is the rewrite's own destination (webrootRewrites, the function
 * next.config.mjs uses), so this HEADs exactly what a visitor downloads.
 * Anything short of a 2xx with a positive Content-Length returns null and the
 * caption omits the size — no number beats a wrong one.
 *
 * Megabytes are 1024², one decimal, the same convention the webroot admin
 * uses (src/lib/webrootDocuments.mjs), so the two screens agree.
 */

export const COMPANY_PROFILE_PATH = '/9expert-company-profile.pdf';

/** 22899697 → "21.8 MB"; anything that is not a positive number → null. */
export function formatProfileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Company Profile card's meta line, built ONLY from values actually read:
 * "PDF · {pages} หน้า · {size}". `size` is an already formatted string (what
 * getCompanyProfileSize returns) or `bytes` is formatted here; a missing page
 * count or size simply drops that part — nothing is typed in.
 */
export function companyProfileMeta({ bytes, size, pages } = {}) {
  const sizeText = size || formatProfileSize(bytes);
  const pageCount = Number(pages);
  return [
    'PDF',
    Number.isInteger(pageCount) && pageCount > 0 ? `${pageCount} หน้า` : null,
    sizeText,
  ].filter(Boolean).join(' · ');
}

export function companyProfileBlobUrl(blobBase = process.env.BLOB_PUBLIC_BASE) {
  const rule = webrootRewrites(blobBase).find((r) => r.source === COMPANY_PROFILE_PATH);
  return rule?.destination ?? null;
}

/**
 * @param {object} [deps] injectable for tests; production callers pass nothing.
 * @returns {Promise<string|null>} e.g. "21.8 MB", or null
 */
export async function getCompanyProfileSize({
  url = companyProfileBlobUrl(),
  fetchImpl = fetch,
  revalidate = 3600,
} = {}) {
  if (!url) return null;
  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      next: { revalidate },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return formatProfileSize(res.headers.get('content-length'));
  } catch {
    return null;
  }
}
