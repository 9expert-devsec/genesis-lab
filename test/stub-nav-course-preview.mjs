// Inert stand-in for @/lib/actions/nav-course-preview in the render tier.
//
// Same rationale as the next/* stubs: the real module is a 'use server' file
// that imports @/lib/db/connect, which THROWS at module load when MONGODB_URI
// is unset — so merely importing PublicHeaderClient would fail before a single
// assertion ran. Its exports are called from click/hover handlers, never during
// the server render the render tier exercises, so faithful behaviour is not
// needed; existing and returning empty is.
export async function getCoursesByProgram() {
  return { items: [], firstCover: null };
}
export async function getCoursesBySkill() {
  return { items: [], firstCover: null };
}
export async function getCoursePreview() {
  return null;
}
