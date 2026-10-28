import { isHiddenCourse } from '@/lib/courses/hiddenCourses';

/**
 * A career path with its HIDDEN courses (`CourseExtension.isPublished ===
 * false`) taken out of the curriculum — the path itself stays.
 *
 * Curriculum items are snapshots synced from MSDB (`snap.code`, `snap.name`,
 * `snap.publicUrl`) and never pass through listPublicCourses, so without this a
 * hidden course stayed named and linked on the path page, the /career-path-
 * project cards, /search, the chat corpus cards and the registration form.
 *
 * A group whose every item was hidden is dropped, so no empty heading is left
 * behind; a group that was already empty is left as it was. Items with no code
 * (external entries) are kept. Non-mutating: the stored document is untouched.
 */
export function curriculumItemCode(item) {
  return item?.snap?.code ?? item?.course_id ?? '';
}

export function dropHiddenCurriculumCourses(path, hidden) {
  if (!path || !hidden || hidden.size === 0) return path;
  if (!Array.isArray(path.curriculum)) return path;
  const curriculum = [];
  for (const group of path.curriculum) {
    const items = Array.isArray(group?.items) ? group.items : null;
    if (!items) {
      curriculum.push(group);
      continue;
    }
    const kept = items.filter((item) => !isHiddenCourse(hidden, curriculumItemCode(item)));
    if (items.length > 0 && kept.length === 0) continue;
    curriculum.push(kept.length === items.length ? group : { ...group, items: kept });
  }
  return { ...path, curriculum };
}
