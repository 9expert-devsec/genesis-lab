'use server';

/**
 * Server actions for the PageBuilder collection.
 *
 * Mirrors the structure, error handling, and Thai messages of
 * actions/customPages.js. Reads of published pages are public; writes require
 * an authenticated admin with the `pages` permission, plus tier gates:
 *   - publish / schedule            → marketing tier or higher
 *   - advanced.* fields, jsonLd.rawOverride, ADVANCED_TYPE sections → developer
 *
 * Tier violations STRIP-AND-PRESERVE rather than error on whole-page saves
 * (see lib/pages/tierSanitize.js) — an editor must never wipe a developer's
 * customisation. Audit rows are written by every mutation here; version
 * snapshots are written on PUBLISH only (see getPageVersions).
 */

import { randomUUID, randomBytes } from 'crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db/connect';
import PageBuilder from '@/models/PageBuilder';
import PageVersion from '@/models/PageVersion';
import { pageBuilderSchema, sectionSchema, PAGE_STATUSES } from '@/lib/schemas/pageBuilder';
import { requireAdmin } from '@/lib/actions/auth';
import { canPublish, canUseAdvanced, canManagePreview } from '@/lib/rbac/access';
import { checkSlugAvailable, checkPromotionSlugAvailable } from '@/lib/pages/slugGuard';
import { sanitizePageForTier, renumberSections, isAdvancedType } from '@/lib/pages/tierSanitize';
import { publishBlockers } from '@/lib/pageBuilder/publishReadiness';
import { reidSection, stripImageOwnership } from '@/lib/pageBuilder/reidSection';
import { resolveSectionData } from '@/lib/pageBuilder/resolveSectionData';
import { recordAudit, snapshotVersion } from '@/lib/pages/pageAudit';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { draftContentSchema } from '@/lib/schemas/pageBuilder';
import { DRAFT_CONTENT_KEYS, IDENTITY_KEYS, STATUS_KEYS } from '@/lib/schemas/pageBuilder';
import { stripDraft, effectiveContent, hasUnpublishedDraft } from '@/lib/pageBuilder/draftState';

const ADMIN_PATH = '/admin/pages';
// DISPLAY cap for the admin history list only — how many rows the UI shows,
// not how many are kept. Retention is now unbounded: pageAudit no longer
// prunes, because pruning strands Cloudinary assets (see snapshotVersion).
// The VALUE is unchanged; only the reason for it is, because the old comment
// justified it by a prune that no longer exists.
const MAX_VERSION_ROWS = 20;
const AUDIT_TYPE = 'builder'; // pageType stamped on every PageBuilder audit row
const PUBLISH_STATES = ['published', 'scheduled'];

// zod's .pick() wants a { key: true } mask; the key lists are arrays. One
// converter, so no pick in this file ever restates a list that already exists.
const maskOf = (keys) => Object.fromEntries(keys.map((k) => [k, true]));
// The live-only status/date window publishPageStatus accepts. PICKED from the
// page schema, never re-declared, so the nullable-date coercion ('' -> null)
// and the status vocabulary have exactly one definition — the same rule as
// draftContentSchema on the other half of the partition.
const statusSchema = pageBuilderSchema.pick(maskOf(STATUS_KEYS));

// The live-only IDENTITY fields updatePageIdentity accepts. PICKED from the
// page schema for the same reason draftContentSchema and statusSchema are:
// the slug regex, the pageType vocabulary and the promotionOrder integer rule
// have exactly one definition, and a rule change reaches this surface with no
// second edit. Together the three picks cover all seventeen editable keys.
const identitySchema = pageBuilderSchema.pick(maskOf(IDENTITY_KEYS));

/**
 * Shown when a save is rejected because the stored doc moved since the client
 * loaded it. It deliberately does NOT offer "recover from version history":
 * snapshots are written on PUBLISH only, so a conflicting draft save was never
 * snapshotted and there would be nothing to recover — promising otherwise
 * would be a lie. The honest facts are: the other edit is already safe on the
 * server, the unsaved work is only in this tab, and reloading discards it.
 */
const CONFLICT_MESSAGE =
  'หน้านี้ถูกแก้ไขโดยผู้อื่นหลังจากที่คุณเปิดขึ้นมา ระบบจึงไม่บันทึกทับให้ ' +
  '— การแก้ไขของอีกฝ่ายถูกบันทึกบนเซิร์ฟเวอร์เรียบร้อยแล้ว ส่วนการแก้ไขของคุณ ' +
  'ยังอยู่ในแท็บนี้เท่านั้นและจะหายไปหากรีโหลด โปรดคัดลอกงานของคุณเก็บไว้ก่อน ' +
  'แล้วจึงเปิดหน้านี้ใหม่';
const MAX_PREVIEW_ATTEMPTS = 5;
const PREVIEW_LOCK_MS = 15 * 60 * 1000; // 15-minute lockout
const BCRYPT_ROUNDS = 10;
// Preview links are password-gated and rate-limited (5 tries / 15 min), but a
// 4-char minimum still let a 4-digit numeric through — ~10k combinations a
// patient script walks in days. 8 is the floor for an ADMIN-TYPED password; a
// GENERATED one is 12 url-safe chars (makeReadablePassword), so it clears this
// by construction and needs no separate check.
const MIN_PREVIEW_PASSWORD_LENGTH = 8;

// ── shared helpers (mirror customPages.js) ───────────────────────────

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function firstZodMessage(error) {
  const issue = error?.issues?.[0] ?? error?.errors?.[0];
  if (!issue) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  const path = issue.path?.join('.') || 'field';
  return `${path}: ${issue.message}`;
}

async function currentUserStamp(session) {
  const user = session?.user;
  return {
    id:   user?.id   ? String(user.id)   : '',
    name: user?.name ? String(user.name) : '',
  };
}

/**
 * Bust every surface that renders a builder page. `page-builder` is the ISR
 * tag; the admin list always refreshes; the (future) public route at
 * `/[slug]` is revalidated for both slugs on a rename; and a promotion page
 * additionally busts `/promotions`, which joins on promotionId.
 */
function bustCaches(page, altSlug) {
  revalidateTag('page-builder');
  revalidatePath(ADMIN_PATH);
  if (page?.slug) revalidatePath(`/${page.slug}`);
  if (altSlug && altSlug !== page?.slug) revalidatePath(`/${altSlug}`);
  if (page?.pageType === 'promotion') revalidatePath('/promotions');
}

/** Coerce a publish/schedule request down to a safe status when the actor
 *  lacks marketing+ tier, rather than erroring (preserve their other edits). */
function coercePublishStatus(requested, user, fallback = 'draft') {
  if (PUBLISH_STATES.includes(requested) && !canPublish(user)) return fallback;
  return requested;
}

/** Load a page as a hydrated helper for the section mutations. Returns
 *  { page } or { error } (Thai). */
async function loadPage(id) {
  if (!id) return { error: 'Missing page id' };
  const page = await PageBuilder.findById(id).lean();
  if (!page) return { error: 'ไม่พบหน้าเพจ' };
  return { page };
}

// ── reads ────────────────────────────────────────────────────────────

export async function getPageBuilderPages({
  page = 1,
  limit = 20,
  search = '',
  status,
  pageType,
} = {}) {
  await dbConnect();

  const filter = {};
  if (status)   filter.status = String(status);
  if (pageType) filter.pageType = String(pageType);
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { slug:  { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [docs, total] = await Promise.all([
    PageBuilder.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    PageBuilder.countDocuments(filter),
  ]);

  return { items: serialize(docs), total, page, limit };
}

export async function getPageBuilderPageById(id) {
  if (!id) return null;
  await dbConnect();
  return serialize(await PageBuilder.findById(id).lean());
}

/**
 * Version history for one page — READ ONLY, metadata only. Newest first.
 *
 * Rollback is Phase 3. This deliberately does not read `snapshot`: it is the
 * ENTIRE page document (see models/PageVersion.js), so returning even the
 * capped 20 would ship a payload orders of magnitude larger than the list that
 * displays it, over a server-action boundary, to render four fields. The
 * projection is the point, not an optimisation — nothing here needs the
 * snapshot, and the rollback that will is a different phase with its own
 * guards.
 *
 * Empty is the NORMAL state for an unpublished page: snapshots are written on
 * publish only, so a draft that has never gone live has no history and never
 * will until it does. The UI says that rather than showing a bare "no data".
 */
export async function getPageVersions(id) {
  if (!id) return [];
  await requireAdmin('pages');
  await dbConnect();
  const rows = await PageVersion.find({ pageId: String(id) })
    .select('label actor createdAt')   // NOT snapshot — see above
    .sort({ createdAt: -1 })
    .limit(MAX_VERSION_ROWS)
    .lean();
  return serialize(rows);
}

/**
 * Published-only read for the public renderer (Phase 2).
 *
 * `-draft` is a PROJECTION, not a post-filter: an unpublished draft must never
 * leave the database on a public read, and the cheapest place to guarantee that
 * is the query. Every public read of a builder page carries the same guard.
 */
export async function getPageBuilderPageBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  return serialize(await PageBuilder.findOne({ slug: key, status: 'published' }).select('-draft').lean());
}

/** Any-status read — admin preview / redirect lookup. */
export async function getPageBuilderPageBySlugAny(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  return serialize(await PageBuilder.findOne({ slug: key }).lean());
}

/** Resolve a historical slug → the page's current record (published), for
 *  301 redirects in a later batch. */
export async function findPageBuilderPageByHistoricalSlug(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await PageBuilder.findOne({ slugHistory: key, status: 'published' })
    .select('slug')
    .lean();
  return doc ? serialize(doc) : null;
}

/**
 * Batch join helper for /promotions: given MSDB promotion_ids, return the
 * published builder pages linked to them. The caller keys these by
 * promotionId to render each promo's CTA/detail link.
 */
export async function getPageBuilderPagesByPromotionIds(ids) {
  const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (!list.length) return [];
  await dbConnect();
  const docs = await PageBuilder.find({
    pageType: 'promotion',
    status: 'published',
    promotionId: { $in: list },
  })
    .select('slug title promotionId status')
    .lean();
  return serialize(docs);
}

// ── page mutations ───────────────────────────────────────────────────

/**
 * Create a page. Its authored CONTENT lands in `.draft`, never live.
 *
 * ── CREATING A PAGE NEVER PUBLISHES IT ─────────────────────────────────────
 * `status` is hardcoded to 'draft' and is NOT read from the input. Under the
 * draft/published split, publish is always a separate, later promotion through
 * publishPageStatus — including a page's very first one. That removes a whole
 * class of question ("was this created published, or promoted?") and means the
 * snapshot history has exactly one writer.
 *
 * The old "created straight into published → snapshot it" branch is GONE rather
 * than kept behind a comment. It is not the picker's 'soon' branch, which stays
 * because a schema type outside the registry is genuinely reachable and a test
 * MEASURES that gap. Here `status` is a literal in this function: no input can
 * reach the branch, so a test "proving" it is never invoked would be asserting
 * a tautology about a constant rather than anything about a caller.
 *
 * ── WHY `title` IS THE ONE CONTENT FIELD ALSO WRITTEN LIVE ─────────────────
 * Not a hedge — the model requires it (`title: { required: true }`), so a
 * document whose title exists only inside `.draft` fails validation on
 * create(). Since nothing is published yet there is nothing for it to
 * contradict: the live title seeds the admin list with the name the author
 * typed, and every LATER edit of it goes to the draft like the other eight
 * keys. See the note in models/PageBuilder.js.
 */
export async function createPageBuilderPage(input) {
  const session = await requireAdmin('pages');
  await dbConnect();

  const parsed = pageBuilderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const slugCheck = await checkSlugAvailable(parsed.data.slug);
  if (!slugCheck.ok) return slugCheck;

  // Promotion mode (Phase 1): a promotion-type page also owns /promotions/<slug>,
  // so guard its slug against MSDB promotion identifiers too. Scoped to promotion
  // pages — other page types skip this entirely.
  if (parsed.data.pageType === 'promotion') {
    const promoSlugCheck = await checkPromotionSlugAvailable(parsed.data.slug);
    if (!promoSlugCheck.ok) return promoSlugCheck;
  }

  const user = session.user;
  const stamp = await currentUserStamp(session);

  // The content half, through the SAME pipeline every later saveDraftContent
  // applies. A freshly created page must not get a draft that skipped the tier
  // gate — that would be one authored payload in the whole system that never
  // met sanitizePageForTier, and it would be the first one.
  const content = {};
  for (const key of DRAFT_CONTENT_KEYS) content[key] = parsed.data[key];
  const sanitized = sanitizePageForTier(content, null, canUseAdvanced(user));
  sanitized.sections = renumberSections(sanitized.sections);

  try {
    const doc = await PageBuilder.create({
      // Identity, live and immediate — exactly what updatePageIdentity owns.
      slug: parsed.data.slug,
      pageType: parsed.data.pageType,
      promotionId: parsed.data.promotionId,
      promotionOrder: parsed.data.promotionOrder,
      status: 'draft',
      title: sanitized.title, // required by the model — see the note above
      draft: { ...sanitized, savedAt: new Date(), savedBy: stamp },
      createdBy: stamp,
      updatedBy: stamp,
    });
    bustCaches(doc);
    await recordAudit({
      pageId: String(doc._id), pageType: AUDIT_TYPE, action: 'create',
      after: { slug: doc.slug, title: doc.title, status: doc.status, pageType: doc.pageType },
      actor: stamp,
    });
    // NO snapshot here. A snapshot records what was once actually PUBLIC, and a
    // page created into 'draft' never was. The first snapshot is written by the
    // first publishPageStatus call.
    //
    // `updatedAt` is the optimistic-concurrency token for the caller's NEXT
    // save. The editor adopts the created id in place (history.replaceState,
    // no navigation) rather than redirecting, so there is no reload to re-read
    // the doc — without this the first autosave after a create would have no
    // token and be rejected. See updatePageBuilderPage.
    return { ok: true, id: String(doc._id), slug: doc.slug, updatedAt: doc.updatedAt?.toISOString() };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

/**
 * Update a page. `expectedUpdatedAt` is REQUIRED optimistic-concurrency
 * control: pass the `updatedAt` the client loaded, and the write is rejected
 * if the stored doc has moved since. It is not optional, because an optional
 * precondition is one a caller silently forgets — and this action is a
 * full-document $set, so an unchecked write destroys everything the other
 * editor did since your load, with no trace. Role tiers exist so a team edits
 * these pages; two people in one page is the normal case.
 *
 * On conflict it REJECTS — never merges, never coerces — and deliberately does
 * NOT return the server's current updatedAt, which would just hand the caller
 * a token to force the overwrite through.
 *
 * Returns `updatedAt` on success so a client can chain saves without a reload.
 */
export async function updatePageBuilderPage(id, input, expectedUpdatedAt) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!expectedUpdatedAt) return { ok: false, error: 'Missing expectedUpdatedAt' };
  await dbConnect();

  const existing = await PageBuilder.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const expectedMs = new Date(expectedUpdatedAt).getTime();
  const actualMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  if (Number.isNaN(expectedMs) || expectedMs !== actualMs) {
    return { ok: false, conflict: true, error: CONFLICT_MESSAGE };
  }

  const parsed = pageBuilderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const slugCheck = await checkSlugAvailable(parsed.data.slug, { excludeBuilderId: id });
  if (!slugCheck.ok) return slugCheck;

  // Promotion mode (Phase 1) — same scoped MSDB-collision guard on update.
  if (parsed.data.pageType === 'promotion') {
    const promoSlugCheck = await checkPromotionSlugAvailable(parsed.data.slug);
    if (!promoSlugCheck.ok) return promoSlugCheck;
  }

  const user = session.user;
  const data = sanitizePageForTier(parsed.data, existing, canUseAdvanced(user));
  data.status = coercePublishStatus(data.status, user, existing.status);
  data.sections = renumberSections(data.sections);

  // Readiness is the real guard, not just the dialog: reject a publish/schedule
  // of a page that still carries the placeholder slug/title or has no sections.
  // Checked AFTER coercion, against the FINAL status — a tier-downgraded save
  // lands on draft and is never blocked. See lib/pageBuilder/publishReadiness.js.
  const notReady = publishBlockers(data, data.status);
  if (notReady.length) return { ok: false, error: notReady[0].message };

  // Retire the old slug into history on a rename (deduped; new slug never lingers).
  if (data.slug !== existing.slug) {
    const history = new Set(existing.slugHistory ?? []);
    history.add(existing.slug);
    history.delete(data.slug);
    data.slugHistory = [...history];
  }
  data.updatedBy = await currentUserStamp(session);

  try {
    const updated = await PageBuilder.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    bustCaches(updated, existing.slug);
    await recordAudit({
      pageId: id, pageType: AUDIT_TYPE, action: 'update',
      before: { slug: existing.slug, status: existing.status },
      after:  { slug: updated.slug, status: updated.status },
      actor: data.updatedBy,
    });
    // Snapshot only on the transition INTO published (not every edit of an
    // already-published page) — "snapshot on every publish".
    if (existing.status !== 'published' && updated.status === 'published') {
      await snapshotVersion({ pageId: id, snapshot: updated.toObject(), label: 'publish', actor: data.updatedBy });
    }
    // ISO string so the client's next expectedUpdatedAt round-trips exactly.
    return { ok: true, slug: updated.slug, updatedAt: updated.updatedAt?.toISOString() };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deletePageBuilderPage(id) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const doc = await PageBuilder.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  // Best-effort OG image cleanup — never block deletion on Cloudinary.
  //
  // SOUNDNESS (item 5): this destroys a Cloudinary asset, which is silent and
  // irreversible, so it is only safe if THIS doc is the asset's sole owner. It
  // used to NOT be: duplicatePageBuilderPage copied `seo` verbatim, so a copy
  // shared this token and deleting the copy killed the ORIGINAL's OG image. Part
  // 1 (duplicate now strips ogImagePublicId + section publicIds) restores single
  // ownership, which is what makes this line safe. Do NOT reintroduce a copy path
  // that carries the token without stripping it.
  //
  // In practice this is also near-inert today: the builder OG field is a pasted
  // URL with no upload widget (PageSettingsDialog), so ogImagePublicId is rarely
  // set. That is a latent trap, not a guarantee — see the note at that field.
  //
  // SECTION images are deliberately NOT deleted here. They can be referenced by
  // retained PageVersion snapshots (≤20/page) and other docs, so a per-delete
  // sweep would strand or wrongly destroy them. That cleanup is a reference-
  // counted, snapshot-aware GC — its own phase (docs/page-builder-status.md 5b),
  // NOT an on-event delete.
  if (doc.seo?.ogImagePublicId) {
    try { await deleteFromCloudinary(doc.seo.ogImagePublicId); } catch { /* record already gone */ }
  }
  bustCaches(doc);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'delete',
    before: { slug: doc.slug, title: doc.title }, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

export async function duplicatePageBuilderPage(id) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const src = await PageBuilder.findById(id).lean();
  if (!src) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  // Find a free "<slug>-copy[-n]" that collides with neither collection.
  let slug = '';
  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? `${src.slug}-copy` : `${src.slug}-copy-${n}`;
    // eslint-disable-next-line no-await-in-loop
    if ((await checkSlugAvailable(candidate)).ok) { slug = candidate; break; }
  }
  if (!slug) return { ok: false, error: 'ไม่สามารถสร้าง slug สำเนาได้' };

  const stamp = await currentUserStamp(session);
  // `draft` is dropped here for the same reason the ownership tokens are
  // stripped below: a copy must not silently inherit someone else's
  // UNREVIEWED pending edit. The duplicate starts with no draft at all, so its
  // first publish ships what the copier can actually see on screen.
  const { _id, createdAt, updatedAt, slugHistory, preview, draft, ...rest } = src;

  try {
    const doc = await PageBuilder.create({
      ...rest,
      // item 5, Part 1: a copy renders the same images (src is preserved) but must
      // NOT hold their Cloudinary OWNERSHIP tokens — otherwise two live docs share
      // one asset and either delete destroys the other's image. Strip section
      // publicIds throughout the tree and the OG token. (`{...rest}` spreads
      // `sections` and `seo`, so without this the copy inherits every token.)
      sections: stripImageOwnership(rest.sections),
      seo: { ...(rest.seo ?? {}), ogImagePublicId: '' },
      slug,
      title: `${src.title} (สำเนา)`,
      status: 'draft',            // copies never inherit published state
      slugHistory: [],
      preview: undefined,         // fresh preview block (no shared password)
      promotionId: '',            // don't double-link a promotion
      createdBy: stamp,
      updatedBy: stamp,
    });
    bustCaches(doc);
    await recordAudit({
      pageId: String(doc._id), pageType: AUDIT_TYPE, action: 'duplicate',
      before: { sourceId: String(id), sourceSlug: src.slug },
      after: { slug: doc.slug }, actor: stamp,
    });
    return { ok: true, id: String(doc._id), slug: doc.slug };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    return { ok: false, error: err?.message ?? 'ทำสำเนาไม่สำเร็จ' };
  }
}

/**
 * Set a page's status and nothing else.
 *
 * ── NO LIVE CALLER, as of the draft/published split round 3 ───────────────
 * Kept as a narrow primitive; unmodified in behaviour. Its last caller was
 * the admin list's publish/unpublish toggle, now pointed at
 * publishPageStatus. Nothing in the app reaches this any more, and that is
 * deliberate rather than an oversight — read the two traps below before
 * wiring anything to it, because the name sounds like exactly what you want
 * and it has already misled twice.
 *
 *   1. NO CONFLICT CHECK. It writes a bare $set: { status } against whatever
 *      is stored, with no expectedUpdatedAt. Every other mutation in this
 *      file takes one. A caller that read the page, thought about it, and
 *      then called this will happily stamp a status onto a document someone
 *      else has since rewritten.
 *   2. IT WOULD SNAPSHOT A PENDING DRAFT. On status === 'published' it
 *      snapshots doc.toObject(), which since round 1 includes `draft`. A
 *      PageVersion row records what was once actually PUBLIC; one carrying
 *      an unpublished edit is a lie in the history, and the rollback that
 *      reads it would restore content that was never live. It also does not
 *      PROMOTE that draft, so it publishes the stale content while archiving
 *      the new — wrong in both directions at once. This is the precise trap
 *      publishPageStatus was built to avoid, and why the list moved.
 *
 * Prefer publishPageStatus from anything that changes status, and
 * updatePageBuilderPage from anything holding a working tree.
 */
export async function updatePageStatus(id, status) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!PAGE_STATUSES.includes(status)) return { ok: false, error: 'สถานะไม่ถูกต้อง' };

  // Publishing/scheduling is an explicit action here — require the tier
  // rather than silently coercing (unlike a whole-page save).
  if (PUBLISH_STATES.includes(status) && !canPublish(session.user)) {
    return { ok: false, error: 'ต้องมีสิทธิ์ marketing ขึ้นไปเพื่อเผยแพร่/ตั้งเวลา' };
  }

  await dbConnect();
  // Read the fields readiness needs, not just status: this path sets status
  // WITHOUT the tree, so it must judge the STORED page. Same guard as the
  // editor's save (publishReadiness.js) — the UI is never the only check.
  const prev = await PageBuilder.findById(id).select('status slug title sections').lean();
  if (!prev) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const notReady = publishBlockers(prev, status);
  if (notReady.length) return { ok: false, error: notReady[0].message };

  const doc = await PageBuilder.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  bustCaches(doc);

  const actor = await currentUserStamp(session);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'status',
    before: prev.status, after: doc.status, actor,
  });
  // Explicit publish → snapshot the published state.
  if (status === 'published') {
    await snapshotVersion({ pageId: id, snapshot: doc.toObject(), label: 'publish', actor });
  }
  return { ok: true, status: doc.status };
}


// ── draft / publish (the draft-published split, round 2) ─────────────
//
// These three ship ALONGSIDE createPageBuilderPage / updatePageBuilderPage /
// updatePageStatus, which are unchanged and still the only thing the editor
// calls. Round 3 rewires the client; nothing below has a caller yet.
//
// THE RULE THEY IMPLEMENT: a published page must not change when the author
// edits it. Autosave writes DRAFT_CONTENT_KEYS into `draft` on the same
// document (saveDraftContent); pressing เผยแพร่ promotes that draft onto the
// live fields in the SAME write that sets the status (publishPageStatus).
// Live-only fields — slug, status, the publish window, promotionId,
// promotionOrder, pageType, slugHistory — keep taking effect immediately,
// exactly as they do today. See lib/schemas/pageBuilder.js for the partition
// and why slug in particular can never be drafted.

/**
 * The optimistic-concurrency check the three actions below share.
 *
 * Deliberately a separate helper rather than a refactor of
 * updatePageBuilderPage's inline copy: that action is in use by the live
 * editor and this round does not touch it. Returns an error object to return,
 * or null when the caller may proceed.
 */
function draftConflict(existing, expectedUpdatedAt) {
  const expectedMs = new Date(expectedUpdatedAt).getTime();
  const actualMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  if (Number.isNaN(expectedMs) || expectedMs !== actualMs) {
    return { ok: false, conflict: true, error: CONFLICT_MESSAGE };
  }
  return null;
}

/**
 * Save the page's CONTENT as an unpublished draft. The live page does not move.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and each omission is the feature:
 *   - no bustCaches. Revalidating a public path on a draft save would push the
 *     edit to the public page, which is the exact thing this whole split
 *     exists to prevent. A draft save must be invisible from outside.
 *   - no snapshot. PageVersion records what was once actually PUBLIC; a draft
 *     never was.
 *   - no status change, no slug write, no date write. It sets one field.
 *
 * UNIFORM: every page writes a draft, including one that has never been
 * published. There is no status-dependent branch here on purpose — a branch
 * would mean the save path behaves differently on the day a page first goes
 * live, which is the day nobody is watching the save path.
 */
export async function saveDraftContent(id, patch, expectedUpdatedAt) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!expectedUpdatedAt) return { ok: false, error: 'Missing expectedUpdatedAt' };
  await dbConnect();

  const existing = await PageBuilder.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const conflict = draftConflict(existing, expectedUpdatedAt);
  if (conflict) return conflict;

  const parsed = draftContentSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const user = session.user;

  // TIER SANITISATION, with the baseline that makes it correct.
  //
  // sanitizePageForTier reads only `jsonLd` and `sections` off both arguments,
  // and both are draft-content keys — so it runs on a nine-key object with no
  // adaptation. The real decision is what counts as "already stored, and this
  // actor may not change it". That is the page's EFFECTIVE content, not its
  // live fields: if a developer saved a draft carrying an advanced section and
  // an editor saves next, baselining against the live doc would silently
  // replace the developer's PENDING work with whatever is live.
  // effectiveContent falls back to the live fields when no draft exists, so the
  // same call is right in both cases.
  const baseline = effectiveContent(existing);
  const sanitized = sanitizePageForTier(parsed.data, baseline, canUseAdvanced(user));
  // Same realignment live saves get — the editor reorders the ARRAY and leaves
  // sortOrder stale, and the renderer sorts by sortOrder. See tierSanitize.js.
  sanitized.sections = renumberSections(sanitized.sections);

  const actor = await currentUserStamp(session);
  // savedAt/savedBy are SERVER-managed and deliberately outside
  // draftContentSchema — the same reasoning that keeps `preview` out of
  // pageBuilderSchema. A client cannot submit them.
  const draft = { ...sanitized, savedAt: new Date(), savedBy: actor };

  try {
    const updated = await PageBuilder.findByIdAndUpdate(
      id, { $set: { draft } }, { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    // before/after stay a PRESENCE FLAG, never the content: this file's own
    // convention is that an audit row holds a status or a {slug,title} pair,
    // never a whole doc — and a draft is a whole doc's worth of body.
    await recordAudit({
      pageId: id, pageType: AUDIT_TYPE, action: 'draft.save',
      before: { hadDraft: hasUnpublishedDraft(existing) },
      after:  { hasDraft: true },
      actor,
    });
    return { ok: true, updatedAt: updated.updatedAt?.toISOString() };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกฉบับร่างไม่สำเร็จ' };
  }
}

/**
 * Set the live status/date window and, on a publish target, promote the pending
 * draft onto the live fields — in ONE document write.
 *
 * WHY ONE WRITE and not "save the draft, then flip the status": the second call
 * would carry an `expectedUpdatedAt` the first call had already invalidated, so
 * it would trip this action's own precondition. That is the failure the
 * updatePageStatus note in this file already warns about, and splitting the
 * publish across two writes walks straight into it.
 *
 * `statusPatch` is `{ status, publishStartDate, publishEndDate }` — the same
 * object PublishDialog already computes.
 */
export async function publishPageStatus(id, statusPatch, expectedUpdatedAt) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!expectedUpdatedAt) return { ok: false, error: 'Missing expectedUpdatedAt' };
  if (!PAGE_STATUSES.includes(statusPatch?.status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();

  const existing = await PageBuilder.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const conflict = draftConflict(existing, expectedUpdatedAt);
  if (conflict) return conflict;

  // The status/date window, validated by the SAME rules the page schema uses —
  // picked from it rather than re-declared, so '' coerces to null exactly once.
  const patch = statusSchema.safeParse(statusPatch);
  if (!patch.success) return { ok: false, error: firstZodMessage(patch.error) };

  const user = session.user;
  // Coerce rather than error, so a tier-limited actor keeps their date edits.
  const coercedStatus = coercePublishStatus(patch.data.status, user, existing.status);
  const isPublishTarget = PUBLISH_STATES.includes(coercedStatus);

  const set = {
    status: coercedStatus,
    publishStartDate: patch.data.publishStartDate,
    publishEndDate: patch.data.publishEndDate,
  };

  if (isPublishTarget) {
    // Promote the pending draft. A null draft is a REPUBLISH with no content
    // change — still a valid publish, and still snapshotted below.
    if (hasUnpublishedDraft(existing)) Object.assign(set, effectiveContent(existing));
    set.draft = null;
  }

  // The document as it WILL be. Everything below judges this, never `existing`:
  // a page can be correctly blocked, or correctly cleared, by what the draft
  // contains, and reading the stale live content gets that wrong in BOTH
  // directions — clearing a publish that the draft breaks, and blocking one the
  // draft fixes.
  const resulting = { ...existing, ...set };

  if (isPublishTarget) {
    // DEFENCE IN DEPTH on top of round 1's exact-partition guarantee, not a
    // substitute for it. The draft is stored as a Mixed blob; nothing in the
    // database enforces its shape, and a draft written by an older or looser
    // path would otherwise be promoted onto the live fields unchecked. This is
    // the last point at which that is still catchable.
    const revalidated = pageBuilderSchema.safeParse(stripDraft(resulting));
    if (!revalidated.success) return { ok: false, error: firstZodMessage(revalidated.error) };
  }

  // No-op for draft/closed/archived (publishBlockers returns [] for those), so
  // this runs unconditionally exactly as the whole-page save does.
  const notReady = publishBlockers(resulting, coercedStatus);
  if (notReady.length) return { ok: false, error: notReady[0].message };

  const actor = await currentUserStamp(session);

  try {
    const updated = await PageBuilder.findByIdAndUpdate(
      id, { $set: set }, { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    bustCaches(updated, existing.slug);
    await recordAudit({
      pageId: id, pageType: AUDIT_TYPE,
      action: isPublishTarget ? 'publish' : 'status',
      before: { status: existing.status, hadDraft: hasUnpublishedDraft(existing) },
      after:  { status: updated.status, hasDraft: hasUnpublishedDraft(updated) },
      actor,
    });
    if (isPublishTarget) {
      // EVERY publish, not just the transition into published — a republish of
      // an already-published page is still a moment something became public,
      // and the old "only on the transition" rule left every later publish
      // with no recoverable record.
      //
      // stripDraft because a snapshot is a record of what was once actually
      // PUBLIC. It must never carry a pending edit — and on this branch the
      // draft has just been cleared anyway, so this is belt and braces against
      // the field ever arriving some other way.
      await snapshotVersion({
        pageId: id, snapshot: stripDraft(updated.toObject()), label: 'publish', actor,
      });
    }
    return { ok: true, status: updated.status, updatedAt: updated.updatedAt?.toISOString() };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตสถานะไม่สำเร็จ' };
  }
}

/**
 * Throw away the pending draft; the live page is untouched.
 *
 * No bustCaches (nothing public changes) and no snapshot (a draft was never
 * public). Idempotent: discarding when there is no draft is a no-op that still
 * succeeds, because the client cannot always know whether one exists.
 */
export async function discardDraftContent(id, expectedUpdatedAt) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!expectedUpdatedAt) return { ok: false, error: 'Missing expectedUpdatedAt' };
  await dbConnect();

  const existing = await PageBuilder.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const conflict = draftConflict(existing, expectedUpdatedAt);
  if (conflict) return conflict;

  const actor = await currentUserStamp(session);
  try {
    const updated = await PageBuilder.findByIdAndUpdate(
      id, { $set: { draft: null } }, { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    await recordAudit({
      pageId: id, pageType: AUDIT_TYPE, action: 'draft.discard',
      before: { hadDraft: hasUnpublishedDraft(existing) },
      after:  { hasDraft: false },
      actor,
    });
    return { ok: true, updatedAt: updated.updatedAt?.toISOString() };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ยกเลิกฉบับร่างไม่สำเร็จ' };
  }
}


/**
 * Change the page's IDENTITY: slug, pageType, promotionId, promotionOrder.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Round 2 split the editor's single full-document save into two narrower
 * writes: saveDraftContent (the nine DRAFT_CONTENT_KEYS) and publishPageStatus
 * (status + the date window). Between them they cover thirteen of the
 * seventeen editable keys. These four are the remainder — live-only fields
 * that are not status fields — and nothing else can write them. Without this,
 * rewiring the editor would make a slug or pageType rename impossible.
 *
 * These take effect IMMEDIATELY, draft or no draft, which is the whole reason
 * they are live-only: slug is identity (a unique index, a slugHistory trail, a
 * cross-collection guard and two public routes), and pageType is routing
 * (/promotions queries it, and it gates both the cross-collection slug guard
 * and promotionMode). See lib/schemas/pageBuilder.js for the partition.
 *
 * DOES NOT touch `.draft` — a pending edit survives a rename untouched — and
 * DOES NOT snapshot: a snapshot records what was once actually PUBLIC, and
 * renaming a slug is not a publish. Both are asserted, not assumed.
 */
export async function updatePageIdentity(id, patch, expectedUpdatedAt) {
  const session = await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!expectedUpdatedAt) return { ok: false, error: 'Missing expectedUpdatedAt' };
  await dbConnect();

  const existing = await PageBuilder.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const conflict = draftConflict(existing, expectedUpdatedAt);
  if (conflict) return conflict;

  const parsed = identitySchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  // BOTH slug guards, exactly as the whole-page save runs them today. The
  // second is scoped to promotion pages because only they claim
  // /promotions/<slug>, a namespace the general guard does not cover — and it
  // is keyed off the RESULTING pageType, so a page becoming a promotion in the
  // same call is checked as one.
  const slugCheck = await checkSlugAvailable(parsed.data.slug, { excludeBuilderId: id });
  if (!slugCheck.ok) return slugCheck;
  if (parsed.data.pageType === 'promotion') {
    const promoSlugCheck = await checkPromotionSlugAvailable(parsed.data.slug);
    if (!promoSlugCheck.ok) return promoSlugCheck;
  }

  const set = {
    slug: parsed.data.slug,
    pageType: parsed.data.pageType,
    promotionId: parsed.data.promotionId,
    promotionOrder: parsed.data.promotionOrder,
  };

  // Retire the old slug into history on a rename (deduped; the NEW slug never
  // lingers in its own history, or the 301 lookup would resolve to itself).
  // Byte-identical to the whole-page save's rule — one behaviour, two callers.
  if (set.slug !== existing.slug) {
    const history = new Set(existing.slugHistory ?? []);
    history.add(existing.slug);
    history.delete(set.slug);
    set.slugHistory = [...history];
  }

  const actor = await currentUserStamp(session);

  try {
    const updated = await PageBuilder.findByIdAndUpdate(
      id, { $set: set }, { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    // The OLD slug too: on a rename the previous public URL must be
    // revalidated or it keeps serving the page from cache under a slug that no
    // longer resolves. Same call shape the whole-page save uses.
    bustCaches(updated, existing.slug);
    await recordAudit({
      pageId: id, pageType: AUDIT_TYPE, action: 'update',
      before: { slug: existing.slug, status: existing.status },
      after:  { slug: updated.slug, status: updated.status },
      actor,
    });
    return { ok: true, slug: updated.slug, updatedAt: updated.updatedAt?.toISOString() };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

// ── section mutations ────────────────────────────────────────────────
//
// All require the `pages` permission; advanced-type sections additionally
// require developer tier. Each persists the whole array and busts caches.
//
// LIMITATION — TOP-LEVEL SECTIONS ONLY (not a TODO; nobody should "fix" this
// until there is a caller that needs it):
//   Every function below addresses `page.sections` directly. None traverses
//   into a container's `content.children` / `content.left` / `content.right`,
//   so a NESTED section is invisible to them: updateSection/deleteSection/
//   duplicateSection/toggleSection return 'ไม่พบบล็อก' for a nested id, and
//   reorderSections silently no-ops on one (unmatched ids filter out, then the
//   untouched top-level list is re-appended).
//
//   This is a Phase-1/2A seam: these were written in Phase 1, and nesting
//   arrived in 2A. It is left as-is deliberately. The 2B canvas editor does
//   NOT use them — it holds the whole tree in client state and persists via
//   updatePageBuilderPage (a full-document save is the only mutation that can
//   express nesting, and a canvas needs local optimistic state rather than a
//   server round-trip per toggle). Making six actions tree-aware for zero
//   callers would be speculative work (§4.4). A future programmatic caller
//   that needs nesting should read this note first.

async function saveSections(id, sections) {
  const doc = await PageBuilder.findByIdAndUpdate(
    id,
    { $set: { sections: renumberSections(sections) } },
    { new: true }
  );
  if (doc) bustCaches(doc);
  return doc;
}

/** Top-level sections only — see the section-mutations note above. */
export async function reorderSections(id, orderedSectionIds) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  const byId = new Map((page.sections ?? []).map((s) => [s.id, s]));
  const order = Array.isArray(orderedSectionIds) ? orderedSectionIds : [];
  const reordered = order.map((sid) => byId.get(sid)).filter(Boolean);
  // Append any sections the order list forgot, so none are lost.
  for (const s of page.sections ?? []) if (!order.includes(s.id)) reordered.push(s);

  await saveSections(id, reordered);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.reorder',
    after: { order: reordered.map((s) => s.id) }, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

/** Appends to the top level only — see the section-mutations note above. */
export async function addSection(id, section) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  const withId = { ...section, id: section?.id || randomUUID() };
  const parsed = sectionSchema.safeParse(withId);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const isDev = canUseAdvanced(session.user);
  if (isAdvancedType(parsed.data.type) && !isDev) {
    return { ok: false, error: 'ต้องมีสิทธิ์ developer เพื่อเพิ่มบล็อกขั้นสูง' };
  }
  // Non-developers can't seed advanced.* on a normal section.
  const clean = isDev
    ? parsed.data
    : { ...parsed.data, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' } };

  await saveSections(id, [...(page.sections ?? []), clean]);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.add',
    sectionId: clean.id, after: { type: clean.type }, actor: await currentUserStamp(session),
  });
  return { ok: true, id: clean.id };
}

/** Top-level sections only — see the section-mutations note above. */
export async function updateSection(id, sectionId, patch) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  const current = (page.sections ?? []).find((s) => s.id === sectionId);
  if (!current) return { ok: false, error: 'ไม่พบบล็อก' };

  // Type is immutable via update; merge the patch over the current section.
  const merged = { ...current, ...patch, id: sectionId, type: current.type };
  const parsed = sectionSchema.safeParse(merged);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const isDev = canUseAdvanced(session.user);
  let next = parsed.data;
  if (!isDev) {
    if (isAdvancedType(next.type)) {
      return { ok: false, error: 'ต้องมีสิทธิ์ developer เพื่อแก้ไขบล็อกขั้นสูง' };
    }
    // Preserve the stored advanced.* — a non-developer edit can't touch it.
    next = { ...next, advanced: current.advanced ?? { sectionId: '', customClass: '', customCss: '', customHtml: '' } };
  }

  const sections = (page.sections ?? []).map((s) => (s.id === sectionId ? next : s));
  await saveSections(id, sections);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.update',
    sectionId, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

/** Top-level sections only — see the section-mutations note above. */
export async function deleteSection(id, sectionId) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  const sections = (page.sections ?? []).filter((s) => s.id !== sectionId);
  await saveSections(id, sections);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.delete',
    sectionId, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

/**
 * Top-level sections only — see the section-mutations note above.
 *
 * The copy is produced by reidSection(): a fresh id on the section and every
 * descendant, and `advanced.sectionId` cleared throughout (see that module for
 * why a copied anchor id defeats scopeCss containment). `customCss` is
 * preserved — the copied id was the unsafe part, not the CSS.
 */
export async function duplicateSection(id, sectionId) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  const src = (page.sections ?? []).find((s) => s.id === sectionId);
  if (!src) return { ok: false, error: 'ไม่พบบล็อก' };
  if (isAdvancedType(src.type) && !canUseAdvanced(session.user)) {
    return { ok: false, error: 'ต้องมีสิทธิ์ developer เพื่อทำสำเนาบล็อกขั้นสูง' };
  }

  const copy = { ...reidSection(src), name: src.name ? `${src.name} (สำเนา)` : '' };
  const sections = [...(page.sections ?? [])];
  const idx = sections.findIndex((s) => s.id === sectionId);
  sections.splice(idx + 1, 0, copy);
  await saveSections(id, sections);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.duplicate',
    sectionId, after: { newId: copy.id }, actor: await currentUserStamp(session),
  });
  return { ok: true, id: copy.id };
}

/** Top-level sections only — see the section-mutations note above. */
export async function toggleSection(id, sectionId) {
  const session = await requireAdmin('pages');
  await dbConnect();
  const { page, error } = await loadPage(id);
  if (error) return { ok: false, error };

  let enabled = null;
  const sections = (page.sections ?? []).map((s) => {
    if (s.id !== sectionId) return s;
    enabled = !s.enabled;
    return { ...s, enabled };
  });
  await saveSections(id, sections);
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'section.toggle',
    sectionId, after: { enabled }, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

// ── preview link (marketing / developer only) ────────────────────────

function requirePreviewTier(session) {
  return canManagePreview(session?.user);
}

function makeReadablePassword() {
  // ~12 url-safe chars — shown to the admin once, then stored only as a hash.
  return randomBytes(9).toString('base64url');
}

async function setPreview(id, patch) {
  const doc = await PageBuilder.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (doc) revalidatePath(ADMIN_PATH);
  return doc;
}

export async function enablePreviewLink(id, password) {
  const session = await requireAdmin('pages');
  if (!requirePreviewTier(session)) return { ok: false, error: 'ต้องมีสิทธิ์ marketing ขึ้นไป' };
  if (!id) return { ok: false, error: 'Missing page id' };
  const pw = String(password ?? '');
  if (pw.length < MIN_PREVIEW_PASSWORD_LENGTH) {
    return { ok: false, error: `รหัสผ่านสั้นเกินไป (อย่างน้อย ${MIN_PREVIEW_PASSWORD_LENGTH} ตัวอักษร)` };
  }

  await dbConnect();
  const passwordHash = await bcrypt.hash(pw, BCRYPT_ROUNDS);
  const doc = await setPreview(id, {
    'preview.enabled': true,
    'preview.passwordHash': passwordHash,
    'preview.passwordUpdatedAt': new Date(),
    'preview.status': 'active',
    'preview.failedAttempts': 0,
    'preview.lockedUntil': null,
  });
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await recordAudit({ pageId: id, pageType: AUDIT_TYPE, action: 'preview.enable', actor: await currentUserStamp(session) });
  return { ok: true };
}

export async function regeneratePreviewPassword(id) {
  const session = await requireAdmin('pages');
  if (!requirePreviewTier(session)) return { ok: false, error: 'ต้องมีสิทธิ์ marketing ขึ้นไป' };
  if (!id) return { ok: false, error: 'Missing page id' };

  await dbConnect();
  const password = makeReadablePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const doc = await setPreview(id, {
    'preview.enabled': true,
    'preview.passwordHash': passwordHash,
    'preview.passwordUpdatedAt': new Date(),
    'preview.status': 'active',
    'preview.failedAttempts': 0,
    'preview.lockedUntil': null,
  });
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await recordAudit({ pageId: id, pageType: AUDIT_TYPE, action: 'preview.regenerate', actor: await currentUserStamp(session) });
  // Return the plaintext ONCE so the admin can copy it — never stored plain.
  return { ok: true, password };
}

/**
 * Current preview state for the editor dialog. Never returns passwordHash.
 *
 * Read fresh rather than taken from the editor's working tree: `preview` is NOT
 * part of pageBuilderSchema (the dedicated actions below own it, and
 * passwordHash must never enter the client tree), so the copy the editor loaded
 * at mount goes stale the instant any of them runs — and would keep showing a
 * revoked link as active, or a rotated password's old timestamp. A dialog that
 * reports security state must not report a cached one.
 */
export async function getPreviewState(id) {
  if (!id) return null;
  await requireAdmin('pages');
  await dbConnect();
  const doc = await PageBuilder.findById(id).select('preview').lean();
  const p = doc?.preview;
  if (!p) return null;
  return serialize({
    enabled: Boolean(p.enabled),
    status: p.status ?? 'disabled',
    expireDate: p.expireDate ?? null,
    passwordUpdatedAt: p.passwordUpdatedAt ?? null,
    lockedUntil: p.lockedUntil ?? null,
  });
}

export async function setPreviewExpiry(id, expireDate) {
  const session = await requireAdmin('pages');
  if (!requirePreviewTier(session)) return { ok: false, error: 'ต้องมีสิทธิ์ marketing ขึ้นไป' };
  if (!id) return { ok: false, error: 'Missing page id' };

  await dbConnect();
  let when = null;
  if (expireDate) {
    const d = new Date(expireDate);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'วันหมดอายุไม่ถูกต้อง' };
    when = d;
  }
  const expired = when && when.getTime() < Date.now();
  const doc = await setPreview(id, {
    'preview.expireDate': when,
    'preview.status': expired ? 'expired' : 'active',
  });
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await recordAudit({
    pageId: id, pageType: AUDIT_TYPE, action: 'preview.expiry',
    after: { expireDate: when }, actor: await currentUserStamp(session),
  });
  return { ok: true };
}

export async function revokePreviewAccess(id) {
  const session = await requireAdmin('pages');
  if (!requirePreviewTier(session)) return { ok: false, error: 'ต้องมีสิทธิ์ marketing ขึ้นไป' };
  if (!id) return { ok: false, error: 'Missing page id' };

  await dbConnect();
  const doc = await setPreview(id, {
    'preview.enabled': false,
    'preview.status': 'disabled',
    'preview.passwordHash': '',
    'preview.failedAttempts': 0,
    'preview.lockedUntil': null,
  });
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await recordAudit({ pageId: id, pageType: AUDIT_TYPE, action: 'preview.revoke', actor: await currentUserStamp(session) });
  return { ok: true };
}

/**
 * PUBLIC — verify a preview password for the (Phase-2) preview page. No
 * session. Rate-limited on the doc: 5 wrong tries → 15-minute lockout.
 */
export async function verifyPreviewPassword(slug, password) {
  if (!slug) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await dbConnect();

  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await PageBuilder.findOne({ slug: key }).select('preview').lean();
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const pv = doc.preview ?? {};
  if (!pv.enabled || !pv.passwordHash) return { ok: false, error: 'ลิงก์พรีวิวถูกปิด' };

  const now = Date.now();
  if (pv.expireDate && new Date(pv.expireDate).getTime() < now) {
    return { ok: false, error: 'ลิงก์พรีวิวหมดอายุแล้ว' };
  }
  if (pv.lockedUntil && new Date(pv.lockedUntil).getTime() > now) {
    return { ok: false, error: 'ป้อนรหัสผิดหลายครั้ง โปรดลองใหม่ภายหลัง' };
  }

  const match = await bcrypt.compare(String(password ?? ''), pv.passwordHash);
  if (match) {
    await PageBuilder.findOneAndUpdate(
      { slug: key },
      { $set: { 'preview.failedAttempts': 0, 'preview.lockedUntil': null } }
    );
    return { ok: true };
  }

  const attempts = Number(pv.failedAttempts ?? 0) + 1;
  const patch = { 'preview.failedAttempts': attempts };
  if (attempts >= MAX_PREVIEW_ATTEMPTS) patch['preview.lockedUntil'] = new Date(now + PREVIEW_LOCK_MS);
  await PageBuilder.findOneAndUpdate({ slug: key }, { $set: patch });

  return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
}

/**
 * resolveBuilderSectionData — the CANVAS half of the fetch-hoist (2C.2a).
 *
 * The public page calls resolveSectionData() directly (server component). The
 * client canvas can't: MSDB is API-key'd, server-only, and 2C.2a deliberately
 * ships NO public data endpoint. So the canvas hands its live (unsaved) section
 * tree to this admin-gated action and gets back the same id-keyed data map to
 * inject into the ONE SectionRenderer — same renderer, same data shape, edit-
 * time freshness. Read-only: no audit row, no mutation, no revalidate.
 *
 * Gated on `pages` like every builder action. Fail-closed: a resolver blip
 * returns {} rather than throwing, so the editor never breaks over stale data.
 */
export async function resolveBuilderSectionData(sections) {
  await requireAdmin('pages');
  try {
    return await resolveSectionData(Array.isArray(sections) ? sections : []);
  } catch {
    return {};
  }
}
