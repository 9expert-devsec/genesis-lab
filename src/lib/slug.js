/**
 * URL slug helpers — pure, safe to import from both server and client
 * code. Kept separate from `resolvePageSlug.js` because that module
 * pulls in mongoose.
 */

export function toKebab(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
