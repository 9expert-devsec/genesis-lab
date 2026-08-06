// src/lib/articleTaxonomy.js
//
// id → name maps for the two taxonomies an article card labels itself with, and
// the resolver both rows use.
//
// ── WHY THIS IS SHARED AND NOT COPIED ───────────────────────────────────────
// /articles and the landing page's BlogSection both need these maps, and the
// reasoning below (which key, what to drop, what a wrong key looks like) is the
// expensive part — not the four lines of Object.fromEntries. A second copy is
// the duplication class this repo has been bitten by repeatedly: five schedule
// status maps, one horizon constant written three ways, one rate-limit window
// released in two places. The comments travel with the code.

/**
 * program_id → program_name, for the card's overlay tag.
 *
 * DERIVED FROM ONE FETCH, never a second listPrograms() call. On /articles the
 * filter <select> and the card need the same two fields off the same response,
 * and two calls would be two answers on a slow upstream — a card tagged with a
 * program the dropdown does not offer, from one page render.
 *
 * KEYED ON `program_id`, NOT `_id`, for the same reason skillNames is: that is
 * what an article stores. src/models/Article.js:26 declares
 * `programs: [String]` and comments it "program_id values", articleSchema and
 * parseArticleFormData both carry it as a string array, and ArticleForm's
 * ProgramPicker checks and stores `p.program_id`. Keyed on `_id` this map would
 * resolve nothing and every overlay would silently disappear — which, since an
 * unresolved id is DROPPED rather than printed, produces no error and no
 * visible symptom beyond "the tags stopped appearing".
 */
export function buildProgramNames(items) {
  return Object.fromEntries(
    (items ?? [])
      .filter((p) => p?.program_id && p?.program_name)
      .map((p) => [String(p.program_id), String(p.program_name)]),
  );
}

/**
 * skill_id → skill_name, for the card's chips.
 *
 * KEYED ON `skill_id`, NOT `_id`: that is what an article stores. The form's
 * picker is built from `s.skill_id` (ArticleForm.jsx), the parser and
 * `articleSchema` both declare `skills` as a string array, and the model
 * comments the field as "skill_id values". Keying this on `_id` would resolve
 * nothing and every chip would silently disappear — which is exactly the
 * failure mode the card's "drop what you cannot resolve" rule turns into
 * silence, so the key is the part worth being sure about.
 */
export function buildSkillNames(items) {
  return Object.fromEntries(
    (items ?? [])
      .filter((s) => s?.skill_id && s?.skill_name)
      .map((s) => [String(s.skill_id), String(s.skill_name)]),
  );
}

/**
 * ids → display names, capped.
 *
 * One resolver, every row. Only the map, the field and the cap differ; if two
 * call sites ever stop looking identical, one of them has grown a rule the
 * other does not have.
 *
 * AN ID WITH NO NAME IS DROPPED, NEVER PRINTED. An article stores `skill_id` /
 * `program_id` strings and the names come from a separate service; when that
 * service is unreachable the map is empty (both pages catch to `{items: []}`),
 * and when an entry is retired upstream its id survives in old articles
 * forever. Printing the raw id would put `SK-014` on a public card, which is
 * worse than showing nothing.
 *
 * Live example at the time of writing: one featured article carries three
 * skill ids of which only two resolve upstream at all.
 */
export function resolveTaxonomyNames(ids, names, cap) {
  return (ids ?? [])
    .map((id) => names?.[String(id)])
    .filter(Boolean)
    .slice(0, cap);
}
