import { slotsOf, MAX_SECTION_DEPTH } from '@/lib/pageBuilder/containerSlots';
import { isHiddenVisibility } from '@/lib/pageBuilder/presets';

/**
 * D08 — which image section, if any, is a builder page's HERO, i.e. the image
 * that opens the page and should load eagerly with high fetch priority.
 *
 * The rule, kept deliberately narrow: the FIRST image section, depth-first,
 * inside the FIRST rendered top-level section. A page that opens with text or
 * a form gets no eager image at all — making a below-the-fold image eager would
 * only steal bandwidth from what is actually on screen. A container is walked
 * into (a hero is often an image inside a full_width/two_column), but the
 * search never leaves that first top-level section.
 *
 * "Rendered" mirrors SectionRenderer's own early returns: `enabled === false`
 * and a hidden visibility setting render nothing, so they are skipped rather
 * than allowed to claim the hero slot.
 *
 * @param {object[]} sections  the page's top-level sections
 * @returns {string|null} the hero image section's id, or null
 */
export function heroImageSectionId(sections) {
  if (!Array.isArray(sections)) return null;
  const first = sections.find(isRendered);
  return first ? firstImageIn(first, 0) : null;
}

function isRendered(section) {
  if (!section || typeof section !== 'object') return false;
  if (section.enabled === false) return false;
  return !isHiddenVisibility(section.settings?.visibility);
}

function firstImageIn(section, depth) {
  if (!isRendered(section) || depth > MAX_SECTION_DEPTH) return null;
  if (section.type === 'image') {
    const src = typeof section.content?.src === 'string' ? section.content.src.trim() : '';
    // ImageSection renders nothing without a src, so it cannot be the hero.
    return src && section.id ? String(section.id) : null;
  }
  const slots = slotsOf(section.type);
  if (!slots) return null;
  for (const slot of slots) {
    const children = Array.isArray(section.content?.[slot]) ? section.content[slot] : [];
    for (const child of children) {
      const hit = firstImageIn(child, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}
