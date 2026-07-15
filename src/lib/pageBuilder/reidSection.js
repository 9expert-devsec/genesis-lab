import { slotsOf } from '@/lib/pageBuilder/containerSlots';

/**
 * Re-identify a section for duplication. ONE definition, shared by the server
 * action (duplicateSection) and the editor's client-side duplicate — a second
 * implementation of this walk would drift, and the two would disagree about
 * what a copy is.
 *
 * A copy needs BOTH halves:
 *
 *  1. A fresh `id` on the section AND every descendant. A shallow re-id leaves
 *     a duplicated container's children sharing ids with the original.
 *
 *  2. `advanced.sectionId` CLEARED throughout. This is the half that matters:
 *     the anchor id is rendered as a DOM id, so copying it mints a SECOND
 *     element claiming `#hero` — which breaks `#hero` links and makes the
 *     original's scoped customCss style the copy too, defeating the
 *     containment scopeCss guarantees. The scoper is not at fault; a second
 *     element claiming the id is. Note that `customCss` itself is PRESERVED —
 *     the copy's CSS was never the unsafe part, the copied id was.
 *
 *  3. `content.publicId` CLEARED throughout (item 5, Part 1). publicId is the
 *     OWNERSHIP TOKEN for a section's Cloudinary asset — the thing a delete path
 *     keys off. A copy renders the same image because `content.src` (the URL) is
 *     preserved, but it must NOT claim the asset: two docs holding the same token
 *     means either one's delete destroys the other's live image. Same category as
 *     clearing `advanced.sectionId` — a token that is not the copy's to hold.
 *     (This converts "shared owner" into "one owner"; the remaining, narrower
 *     failure — deleting the original 404s the copy's src — is Part 2's to
 *     handle, by counting `src` references, not just publicId. See
 *     docs/page-builder-status.md item 5 / 5b.)
 *
 * The cleared id is not auto-derived (`hero-2`): an author-chosen name has no
 * correct automatic successor, and a guess that collides with a real `hero-2`
 * looks deliberate. The copy's customCss simply re-scopes once the author
 * names it; until then the scoper fails closed and does not apply it, which is
 * the scoper working, not failing.
 */

/**
 * New section id. Web Crypto, not Node's `crypto`: this module runs on the
 * server (the action) AND in the browser (the editor). Falls back for
 * non-secure contexts, where crypto.randomUUID is unavailable.
 */
export function newSectionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function reidSection(section) {
  if (!section || typeof section !== 'object') return section;

  const copy = { ...section, id: newSectionId() };
  if (copy.advanced?.sectionId) copy.advanced = { ...copy.advanced, sectionId: '' };

  const slots = slotsOf(section.type);
  const hasContent = section.content && typeof section.content === 'object';
  if (hasContent) {
    const content = { ...section.content };
    // Ownership token (see header #3): keep src, drop the copy's claim on the asset.
    if ('publicId' in content) content.publicId = '';
    if (slots) {
      for (const slot of slots) {
        if (Array.isArray(content[slot])) {
          content[slot] = content[slot].map((child) => reidSection(child));
        }
      }
    }
    copy.content = content;
  }
  return copy;
}

/**
 * Clear `content.publicId` throughout a section tree WITHOUT re-minting ids —
 * the ownership half of a copy, for callers (page duplication) that keep ids.
 * Same rule as reidSection #3: a copy renders the same image (src preserved) but
 * does not own the Cloudinary asset. Pure; returns a new tree.
 */
export function stripImageOwnership(sections) {
  const strip = (section) => {
    if (!section || typeof section !== 'object') return section;
    if (!section.content || typeof section.content !== 'object') return section;
    const content = { ...section.content };
    if ('publicId' in content) content.publicId = '';
    const slots = slotsOf(section.type);
    if (slots) {
      for (const slot of slots) {
        if (Array.isArray(content[slot])) content[slot] = content[slot].map(strip);
      }
    }
    return { ...section, content };
  };
  return (Array.isArray(sections) ? sections : []).map(strip);
}
