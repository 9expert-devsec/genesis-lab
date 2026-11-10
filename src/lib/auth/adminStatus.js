/**
 * Is this admin still allowed in? The decision alone, with no I/O, so it can be
 * tested without a database. lib/auth/assertActiveAdmin does the reading.
 *
 * `active !== true` is inactive, not `active === false`: the login query filters
 * on `active: true`, so this is the same rule login applies, and a missing
 * document or a missing field cannot read as allowed.
 *
 * PURE: no I/O.
 */

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** `token.id` is `String(Admin._id)`. Anything else cannot match a row. */
export function isWellFormedAdminId(id) {
  return typeof id === 'string' && OBJECT_ID.test(id);
}

/** @param {{active?: boolean}|null|undefined} doc the row, or null when deleted */
export function isActiveAdminDoc(doc) {
  return doc?.active === true;
}
