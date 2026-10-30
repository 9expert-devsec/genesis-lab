/**
 * `docs` re-ordered to follow `ids`, dropping ids with no doc.
 *
 * `find({ _id: { $in: ids } })` returns documents in the collection's order,
 * not the order the admin set in `course.instructor_ids`. Same rule as the
 * corpus's own re-ordering (lib/corpus/masterclassCards.js `masterclassCardItem`).
 * Keys compare as strings, so ObjectIds and their hex strings match.
 */
export function orderByIds(ids, docs) {
  const byId = new Map((docs ?? []).map((d) => [String(d?._id), d]));
  return (ids ?? []).map((id) => byId.get(String(id))).filter(Boolean);
}
