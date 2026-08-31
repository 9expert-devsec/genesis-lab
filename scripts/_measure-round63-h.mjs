/**
 * ROUND 63 (part 6) — the EMPTY case, through the real resolver.
 *
 * Resolves four course codes the way PageBuilderView does, so section H of
 * docs/course-schedule-selection.md states the observable rather than the
 * expected: a real course with no open rounds and a code MSDB does not have
 * are INDISTINGUISHABLE at this layer — both arrive as [].
 *
 * READ-ONLY. Writes nothing.
 * Run: node --env-file=.env.local scripts/_measure-round63-h.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));
const { resolveSectionData } = await import('@/lib/pageBuilder/resolveSectionData');
for (const [courseId, limit] of [['MSE-L1', 1], ['VIBE-CODE-L2', 0], ['MAKE-L1', 0], ['NOPE-XX', 0]]) {
  const s = [{ id: 'x', type: 'course_schedule', content: { courseId, limit } }];
  const map = await resolveSectionData(s);
  const rows = map.x;
  console.log(`${courseId.padEnd(14)} limit=${limit} -> ${Array.isArray(rows) ? rows.length : typeof rows} rows` +
    (Array.isArray(rows) && rows.length ? `  first=${JSON.stringify(rows[0].dates)} status=${rows[0].status}` : ''));
}
