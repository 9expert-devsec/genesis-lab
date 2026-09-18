/**
 * Stub for `@/lib/actions/career-path-outlines` in the render tier.
 *
 * Reached by CareerPathOutlineUpload (and through it CareerPathForm), which
 * imports the two server actions for its upload flow. Same next-auth →
 * next/headers chain as the other action stubs, same policy: throw rather
 * than resolve, so a render test that somehow uploads fails loudly.
 */
export async function signCareerPathOutlineUpload() {
  throw new Error('stub-career-path-outline-actions: signCareerPathOutlineUpload must not be called in a render test');
}
export async function recordCareerPathOutlineUpload() {
  throw new Error('stub-career-path-outline-actions: recordCareerPathOutlineUpload must not be called in a render test');
}
