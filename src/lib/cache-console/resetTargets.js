/**
 * The registry of what can be reset, and how each one is identified.
 *
 * Pure data plus lazy model loaders — no top-level model imports, so this can
 * be read by a test without a database. One entry per cache, because the
 * alternative is four near-identical action pairs whose divergence nobody
 * notices until one of them purges the wrong collection.
 *
 * ── THE IDENTITY FIELD IS THE LOAD-BEARING COLUMN ───────────────────────────
 * `idField` is the field each sync upserts on — verified against the four
 * `shapeUpsert` filters: syncCareerPaths.js:59 `{career_path_id}`,
 * syncFaqs.js:41 `{faq_id}`, syncInstructors.js:28 `{instructor_id}`,
 * syncPromotions.js:63 `{promotion_id}`.
 *
 * Getting this wrong is the worst available mistake in this round: a purge
 * computed on the wrong field matches nothing upstream, so EVERY row looks
 * deleted-upstream and the whole collection is doomed. The collapse guard
 * catches that — it is exactly the shape it exists for — but the guard is the
 * second line, not the first. A test pins each value against the sync that owns
 * it.
 */

export const MIRROR_TARGETS = Object.freeze([
  Object.freeze({
    key: 'career_paths',
    label: 'Career Paths',
    idField: 'career_path_id',
    model: () => import('@/models/CareerPath').then((m) => m.default),
    fetchUpstream: async () => {
      const { listCareerPaths } = await import('@/lib/api/career-paths');
      const resp = await listCareerPaths({ status: 'all', limit: 100 });
      return (resp?.items ?? []).map((i) => i?._id).filter(Boolean);
    },
    revalidate: ['/career-path-project'],
  }),
  Object.freeze({
    key: 'faqs',
    label: 'FAQ',
    idField: 'faq_id',
    model: () => import('@/models/Faq').then((m) => m.default),
    fetchUpstream: async () => {
      const { listFaqs } = await import('@/lib/api/faqs');
      const resp = await listFaqs();
      return (resp?.items ?? []).map((i) => i?._id).filter(Boolean);
    },
    revalidate: ['/faq'],
  }),
  Object.freeze({
    key: 'instructors',
    label: 'วิทยากร',
    idField: 'instructor_id',
    model: () => import('@/models/Instructor').then((m) => m.default),
    fetchUpstream: async () => {
      const { listInstructors } = await import('@/lib/api/instructors');
      const resp = await listInstructors();
      return (resp?.items ?? []).map((i) => i?._id).filter(Boolean);
    },
    revalidate: ['/about-us'],
  }),
  Object.freeze({
    key: 'promotions',
    label: 'โปรโมชั่น',
    idField: 'promotion_id',
    model: () => import('@/models/Promotion').then((m) => m.default),
    /**
     * THE PARAMS MUST MATCH syncPromotions.js:118-122 EXACTLY.
     *
     * `listPromotions()` with its defaults returns only currently-live
     * promotions. The sync passes includeExpired / includeUnpublished /
     * includeScheduled, so the collection legitimately holds rows the default
     * call cannot see — and a purge computed against the default set treats
     * every one of them as deleted-upstream.
     *
     * MEASURED, and this is not hypothetical: with the defaults the live
     * comparison was local 21 · upstream 1 · would remove 20. The collapse
     * guard refused it at 95%, which is the guard doing its job, but the guard
     * is the second line. This is the first.
     */
    fetchUpstream: async () => {
      const { listPromotions } = await import('@/lib/api/promotions');
      const resp = await listPromotions({
        includeExpired: true,
        includeUnpublished: true,
        includeScheduled: true,
      });
      return (resp?.items ?? []).map((i) => i?._id).filter(Boolean);
    },
    revalidate: ['/promotions'],
  }),
]);

export const MIRROR_KEYS = Object.freeze(MIRROR_TARGETS.map((t) => t.key));

export function mirrorTarget(key) {
  return MIRROR_TARGETS.find((t) => t.key === key) ?? null;
}
