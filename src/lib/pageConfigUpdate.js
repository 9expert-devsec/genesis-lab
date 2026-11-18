/**
 * The field whitelist for a ProgramPageConfig / SkillPageConfig save. A key not
 * listed here never reaches the database, whatever the form sends.
 *
 * It lives outside lib/actions/page-configs because a 'use server' module can
 * only export async functions, and this has to be callable from a test.
 * catalogPdf is deliberately absent: lib/actions/page-catalogs owns it.
 *
 * Pure; no I/O.
 *
 * THE PROGRAM COPY (introHeading … benefitCards) is added for a PROGRAM save
 * only — key === 'programId'. A SKILL save returns exactly the object it did
 * before these fields existed; test/pure/programPageCopyShape proves it.
 * shapeProgramCopy is exported on its own so scripts/apply-program-page-copy
 * validates the seed with the same rules the admin save applies.
 */

import { sanitizeRichHtml } from './sanitizeRichHtml.js';
import { isProgramCopyIconKey } from './programCopyIcons.js';

export const PROGRAM_COPY_MAX_WHY_ITEMS = 8;
export const PROGRAM_COPY_MAX_BENEFIT_CARDS = 8;

export const PROGRAM_COPY_KEYS = Object.freeze([
  'introHeading',
  'introHtml',
  'whyHeading',
  'whyLead',
  'whyItems',
  'benefitHeading',
  'benefitLead',
  'benefitCards',
]);

export function normalizeSlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^\/+/, '');
  return trimmed || null;
}

const str = (v) => String(v ?? '').trim();

/**
 * Sanitised introHtml, or '' when nothing but empty markup is left — an
 * emptied Tiptap editor emits `<p></p>`, which must not count as "has intro".
 */
function shapeIntroHtml(value) {
  const clean = sanitizeRichHtml(String(value ?? '')).trim();
  const text = clean.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '');
  return text ? clean : '';
}

function shapeRows(value, fields, max, label) {
  const rows = (Array.isArray(value) ? value : [])
    .map((r) => Object.fromEntries(fields.map((f) => [f, str(r?.[f])])))
    .filter((r) => r.title || r.description);
  if (rows.length > max) {
    throw new Error(`${label} ได้ไม่เกิน ${max} รายการ (ส่งมา ${rows.length})`);
  }
  return rows;
}

/**
 * The eight program-copy fields, shaped: trimmed strings, rows with neither
 * title nor description dropped, at most 8 rows per list, introHtml through
 * sanitizeRichHtml. THROWS on an over-cap list or an icon key the preset
 * (lib/programCopyIcons) does not list — the save action returns the message.
 * An empty icon is kept as '' and the page renders the fallback.
 */
export function shapeProgramCopy(data) {
  const whyItems = shapeRows(data?.whyItems, ['title', 'description'], PROGRAM_COPY_MAX_WHY_ITEMS, 'เหตุผล (why)');
  const benefitCards = shapeRows(
    data?.benefitCards,
    ['icon', 'title', 'description'],
    PROGRAM_COPY_MAX_BENEFIT_CARDS,
    'การ์ดประโยชน์',
  );
  for (const c of benefitCards) {
    if (c.icon && !isProgramCopyIconKey(c.icon)) {
      throw new Error(`ไอคอน "${c.icon}" ไม่อยู่ในรายการที่อนุญาต`);
    }
  }
  return {
    introHeading: str(data?.introHeading),
    introHtml: shapeIntroHtml(data?.introHtml),
    whyHeading: str(data?.whyHeading),
    whyLead: str(data?.whyLead),
    whyItems,
    benefitHeading: str(data?.benefitHeading),
    benefitLead: str(data?.benefitLead),
    benefitCards,
  };
}

export function shapePageConfigUpdate(programOrSkillId, key, data) {
  const slug = normalizeSlug(data?.urlSlug);
  const base = {
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
  return key === 'programId' ? { ...base, ...shapeProgramCopy(data) } : base;
}
