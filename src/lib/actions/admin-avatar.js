'use server';

/**
 * The admin's own profile photo. One action, one record: their own.
 *
 * ══ IT TAKES NO TARGET, AND THAT IS THE SECURITY PROPERTY ═══════════════════
 * The signature is `setOwnAvatar(publicId)`. There is no admin id, no email, no
 * `{ target }` — the record is resolved from `session.user.email` and from
 * nowhere else. A self-service endpoint that accepts an identifier is a
 * privilege escalation waiting for someone to try the obvious thing in
 * devtools, and no amount of checking that identifier afterwards is as strong
 * as not having one. `updateOwnProfile` next door works the same way.
 *
 * ── THE GUARD ───────────────────────────────────────────────────────────────
 * `requirePage('profile')`, matching the guard on the page this is called from.
 * `requirePageAction` exists and throws rather than redirecting, which is the
 * usual choice for an action — but an admin whose `profile` permission was
 * revoked mid-session should land on /admin/403 like they would by navigating,
 * not read an inline error on a screen they can no longer open.
 *
 * ── AUDIT: DELIBERATELY NONE ────────────────────────────────────────────────
 * Checked before deciding: `updateOwnProfile` in lib/actions/admin-accounts.js
 * records nothing, and that file contains no audit call at all — a name change
 * and a PASSWORD change both go unrecorded today. Adding an audit row for a
 * profile photo would make the avatar the single most closely watched thing on
 * this screen, which is not a coherent policy. If self-service profile edits
 * should be audited, that is one change covering all three, not a rider on the
 * least sensitive of them.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { requirePage } from '@/lib/rbac/guard';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { planAvatarWrite } from '@/lib/avatar/avatarWrite';

/**
 * Set or clear the signed-in admin's avatar.
 *
 * @param {string|null} publicId a Cloudinary public_id under `<base>/avatars/`,
 *                               or null to remove the current photo
 * @returns {Promise<{ok: true, imagePublicId: string|null}|{ok: false, error: string}>}
 */
export async function setOwnAvatar(publicId) {
  const session = await requirePage('profile');
  const email = session?.user?.email;
  if (!email) return { ok: false, error: 'Unauthorized' };

  await dbConnect();

  // READ, then WRITE, as two explicit steps — and the return value of the write
  // is DELIBERATELY IGNORED.
  //
  // The tempting one-round-trip version reads the old publicId out of what
  // findOneAndUpdate hands back. Do not: without `{ new: true }` Mongoose
  // returns the PRE-image, and the in-memory model the tests run against
  // (test/fakeDb.mjs) returns the POST-image. An action whose delete target
  // came from that value would pass every test and delete the wrong file in
  // production — or nothing at all, silently accumulating orphans. Depending on
  // neither is free; the old value is already in hand from the read above.
  const current = await Admin.findOne({ email }).select('imagePublicId').lean();
  if (!current) return { ok: false, error: 'ไม่พบบัญชี' };

  // Validation happens on the value that arrived, against the record that
  // exists — before anything is written and before anything is deleted.
  const plan = planAvatarWrite({
    currentPublicId: current.imagePublicId ?? null,
    incoming: publicId,
  });
  if (!plan.ok) return { ok: false, error: plan.error };

  // THE DB WRITE'S OWN FAILURE IS NOT SWALLOWED. It is awaited before the
  // delete, so a failed write leaves the old image both referenced and present,
  // rather than deleting a file the record still points at.
  await Admin.findOneAndUpdate({ email }, { $set: { imagePublicId: plan.value } });

  // Only after the row is durable. deleteFromCloudinary already swallows and
  // logs its own failures, which is right here: an orphaned file is a storage
  // cost, and a refused save because a CDN call failed is a broken feature.
  if (plan.deleteId) await deleteFromCloudinary(plan.deleteId);

  // ── THE SCOPE, AND WHY IT IS NOT ('/', 'layout') ──────────────────────────
  // The sidebar renders on EVERY /admin route, so revalidating only
  // /admin/profile would leave a stale avatar on every other admin screen.
  //
  // The public-side idiom for that problem is `revalidatePath('/', 'layout')` —
  // syncNavMenuData, syncCareerPaths, publishVisibilityPlan all use it. Copying
  // it here would be wrong twice over. It drops the whole PUBLIC layout cache,
  // so every visitor pays for the rendered output of a site-wide bust because
  // one admin changed their photo — the exact toll publishVisibilityPlan's
  // header warns about paying for a change nobody can see. And it is aimed at
  // a cache this does not need to touch: the admin layout reads `headers()`,
  // so it is dynamic and has no full-route cache entry at all.
  //
  // `('/admin', 'layout')` is the narrowest scope that covers the surface that
  // actually changed: the admin subtree's layout, and nothing outside it.
  revalidatePath('/admin', 'layout');

  return { ok: true, imagePublicId: plan.value };
}
