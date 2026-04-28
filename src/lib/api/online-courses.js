/**
 * Online Courses adapter.
 *
 * Upstream path: `/online-course` (singular — mirrors `/public-course`
 * naming convention).
 *
 * Online courses are streamed/self-paced from 9Expert Academy and have
 * no schedule rows; consumers should treat `schedules` as empty.
 */

import { aiFetch, unwrap } from './client';

const PATH = '/online-course';

/**
 * List all active online courses. Mirrors `listPublicCourses` so the
 * homepage can feed them into the same CourseCarousel/CourseCard.
 */
export async function getOnlineCourses() {
  const raw = await aiFetch(PATH, {
    tags: ['online-courses'],
  });
  return unwrap(raw);
}
