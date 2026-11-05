/**
 * The default writer, and what seeding it would do.
 *
 * Pure and alias-free, so scripts/seed-default-writer.mjs can import it by
 * relative path and the test tier can call the same plan.
 */

export const DEFAULT_WRITER_SLUG = '9expert-academy';

export const DEFAULT_WRITER = Object.freeze({
  slug: DEFAULT_WRITER_SLUG,
  displayName: '9Expert Academy',
  type: 'organization',
  role: 'ทีมคอนเทนต์ 9Expert Training',
  isDefault: true,
  isActive: true,
});

/**
 * Decide from what is stored, without writing.
 *
 *   refuse   another writer already holds `isDefault`
 *   insert   no row with this slug yet
 *   repair   the row exists but is no longer the active default
 *   noop     nothing to do
 *
 * A row that already exists keeps its text: once an admin has edited the name,
 * role or photo, a re-run must not put the seed values back. Only the two flags
 * this script is responsible for are restored.
 *
 * @param {{ existing: object|null, otherDefault: object|null, now: Date }} input
 */
export function planDefaultWriterSeed({ existing, otherDefault, now }) {
  if (otherDefault) return { action: 'refuse', otherDefault };

  if (!existing) {
    return {
      action: 'insert',
      doc: {
        ...DEFAULT_WRITER,
        bio: '',
        avatarPublicId: '',
        socialLinks: [],
        sections: { experience: [], education: [], certifications: [], recognition: [] },
        instructorId: null,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  const $set = {};
  if (existing.isDefault !== true) $set.isDefault = true;
  if (existing.isActive !== true) $set.isActive = true;
  if (Object.keys($set).length === 0) return { action: 'noop' };
  return { action: 'repair', $set: { ...$set, updatedAt: now } };
}
