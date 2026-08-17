/**
 * Stub for `@/lib/actions/program-order` in the render tier.
 *
 * CoursesAdminClient imports `saveProgramCourseOrder` for the reorder save. The
 * real module is `'use server'` and its chain reaches next-auth → next/headers,
 * which does not resolve outside a Next runtime — the same reasoning as the
 * course, article and registration action stubs already in the loader.
 *
 * EVERY export throws. The render tier asserts whether the drag affordance is
 * OFFERED (test/render/coursesAdminReorder), which is a property of the markup;
 * nothing there drops a row, so nothing should reach a save. A stub that
 * returned `{ ok: true }` would let a test that accidentally invoked one pass
 * while writing nothing, which is the "stub that agrees with everything"
 * false-green named in test/fs/stubExportParity's own header.
 *
 * The decision about what a save may send is pure and is driven for real in
 * test/pure/courseOrderEditing; the write's shape is pinned from source in
 * test/fs/courseOrderWriteShape.
 *
 * Export set must match the real module exactly — see test/fs/stubExportParity.
 */

const refuse = (name) => async () => {
  throw new Error(`stub-program-order-actions: ${name} must not be called in a render test`);
};

export const syncProgramsFromAPI     = refuse('syncProgramsFromAPI');
export const getOrderedPrograms      = refuse('getOrderedPrograms');
export const saveProgramOrder        = refuse('saveProgramOrder');
export const saveProgramCourseOrder  = refuse('saveProgramCourseOrder');
export const toggleProgramHidden     = refuse('toggleProgramHidden');
export const syncSkillsFromAPI       = refuse('syncSkillsFromAPI');
export const getOrderedSkills        = refuse('getOrderedSkills');
export const saveSkillOrder          = refuse('saveSkillOrder');
export const saveSkillProgramOrder   = refuse('saveSkillProgramOrder');
export const toggleSkillHidden       = refuse('toggleSkillHidden');
