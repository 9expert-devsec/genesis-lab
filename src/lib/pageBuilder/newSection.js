import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { newSectionId } from './reidSection';

/**
 * Mint a new section of `type`, fully populated with its schema defaults.
 *
 * The defaults are NOT written out here — they are produced by parsing a bare
 * { type, id } through the real section union. Every field in the envelope and
 * in each type's `content` already carries a .default() (see schemas/sections/
 * base.js and the category files), and ZodDefault parses the default value
 * through its inner type, so one parse fills the whole tree: settings, layout,
 * style, advanced, and the type's own content shape.
 *
 * A hand-written default table here would be a SECOND declaration of what a
 * section is, drifting from the schema the server validates against — and the
 * drift would surface as a save rejecting a section the editor just created,
 * or worse, as a field the editor never sets and the renderer reads as
 * undefined. The schema is the single source of truth (§4.6); this asks it.
 *
 * Throws on an unknown type, deliberately: the union has no member for it, and
 * a section the schema won't accept must never reach the tree.
 */
export function newSection(type) {
  return sectionSchema.parse({ type, id: newSectionId() });
}
