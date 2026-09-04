'use server';

/**
 * Server actions for the CustomPage collection.
 *
 * Custom pages are Genesis-owned (no MSDB sync). Reads of published pages
 * are public; writes require an authenticated admin session.
 */

import { randomUUID } from 'crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CustomPage from '@/models/CustomPage';
import { customPageSchema } from '@/lib/schemas/customPage';
// The draft partition and its read helpers. ADDED beside the statement above
// rather than folded into it — the standing rule in this repo.
import { CUSTOM_PAGE_DRAFT_KEYS } from '@/lib/schemas/customPage';
import {
  hasUnpublishedDraft, effectiveContent, stripDraft,
} from '@/lib/pages/customPageDraft';
import { requireAdmin } from '@/lib/actions/auth';
import { auth } from '@/lib/auth/options';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { checkSlugAvailable } from '@/lib/pages/slugGuard';
// ADDED beside the statements above rather than folded into any — the standing
// rule in this repo.
import { recordAudit } from '@/lib/pages/pageAudit';

const ADMIN_PATH = '/admin/pages';

/**
 * ── WHY THIS FILE WRITES PageAuditLog AND NOT AdminAuditLog ─────────────────
 *
 * Two audit systems exist and they are not interchangeable. `recordAdminAction`
 * writes the org-wide AdminAuditLog behind /admin/audit-log and the
 * RecordHistory widget; `recordAudit` writes PageAuditLog, the per-page trail
 * the editor's ประวัติการดำเนินการ section reads through getPageAuditLog.
 *
 * This file takes the second, for three measured reasons:
 *
 *   1. PageAuditLog.pageType is `enum: ['builder','advanced_html']` and has been
 *      since it was written. The 'advanced_html' half was modelled and never
 *      written to — these calls are what it was built for.
 *   2. getPageAuditLog filters on pageId ALONE, with no pageType clause, so the
 *      existing ActivityTrail renders a CustomPage's rows with no reader change.
 *      The settings dialog's ประวัติการดำเนินการ section stops being a
 *      placeholder that says nothing is recorded, and starts being a list.
 *   3. pageBuilder.js — the sibling editor — already uses this system and is
 *      likewise absent from SWEPT_FILES. One vocabulary across the two page
 *      editors beats a second one here.
 *
 * THE TWO ARE NOT MERGED HERE, deliberately: unifying them would mean moving the
 * builder's trail too, and that is a change to a working, read surface with its
 * own component, cursor pagination and tests. The recordAdminAction sweep of
 * this file remains a separate open ticket — this round closes the gap that its
 * own new actions would otherwise widen, and no more.
 *
 * NEVER BLOCKS A SAVE: recordAudit swallows its own errors by design, so every
 * call below is awaited without a failed audit write ever surfacing as a failed
 * mutation.
 */
const AUDIT_TYPE = 'advanced_html';

/** The small before/after shape every row here uses — never a whole document. */
function auditFields(doc) {
  if (!doc) return null;
  return {
    slug:   String(doc.slug ?? ''),
    title:  String(doc.title ?? ''),
    status: String(doc.status ?? ''),
  };
}

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function bustCaches(slug) {
  revalidateTag('custom-pages');
  revalidatePath(ADMIN_PATH);
  // The public catch-all route at `/[slug]` arrives in a later batch —
  // wiring the revalidate now is harmless.
  if (slug) revalidatePath(`/${slug}`);
}

function firstZodMessage(error) {
  const issue = error?.issues?.[0] ?? error?.errors?.[0];
  if (!issue) return 'รูปแบบข้อมูลไม่ถูกต้อง';
  const path = issue.path?.join('.') || 'field';
  return `${path}: ${issue.message}`;
}

/**
 * Read the current admin session's user as a plain `{ id, name }`. Never
 * throws — audit stamping must not block a save.
 */
async function currentUserStamp() {
  try {
    const session = await auth();
    return {
      id:   session?.user?.id   ? String(session.user.id)   : '',
      name: session?.user?.name ? String(session.user.name) : '',
    };
  } catch {
    return { id: '', name: '' };
  }
}

/**
 * Parse the FormData posted by CustomPageForm into a plain object the Zod
 * schema can validate. `jsonLd` and `slugHistory` ride across the wire as
 * JSON blobs. previewToken / createdBy / updatedBy are set server-side and
 * are never read from the form.
 */
function parseFormData(formData) {
  let jsonLd = {};
  try {
    const parsed = JSON.parse(String(formData.get('jsonLd') ?? '{}'));
    if (parsed && typeof parsed === 'object') jsonLd = parsed;
  } catch {
    jsonLd = {};
  }

  let slugHistory = [];
  try {
    const parsed = JSON.parse(String(formData.get('slugHistory') ?? '[]'));
    if (Array.isArray(parsed)) slugHistory = parsed;
  } catch {
    slugHistory = [];
  }

  return {
    slug:            String(formData.get('slug') ?? '').trim(),
    title:           String(formData.get('title') ?? '').trim(),
    // NOT SANITISED — stored verbatim. `sanitizePageHtml` (render-time only)
    // is the sole guard on the public route; CustomPageForm's own `content:`
    // load reads this field raw, with no sanitiser in between. This used to
    // be a smaller risk because the editor's schema accidentally dropped
    // unrecognised markup like <script> on its own round trip; wrapIfLossy
    // (lib/customPages/wrapIfLossy.js) now deliberately PRESERVES exactly
    // that markup instead, verbatim, specifically so legitimate raw HTML
    // survives — which means <script>, event-handler attributes and
    // `javascript:` URLs typed into Source HTML mode now reach this field
    // uncontested too. Open follow-up: a save-time sanitiser here, before
    // `customPageSchema.parse()` below — see the proposal in the RawHtmlNode
    // feature's own writeup for the shape (block script/on*/javascript:,
    // allow div/span/style/class through untouched).
    body:            String(formData.get('body') ?? ''),
    status:          String(formData.get('status') ?? 'draft'),
    metaTitle:       String(formData.get('metaTitle') ?? '').trim(),
    metaDescription: String(formData.get('metaDescription') ?? '').trim(),
    canonicalUrl:    String(formData.get('canonicalUrl') ?? '').trim(),
    noIndex:         formData.get('noIndex') === 'true',
    ogTitle:         String(formData.get('ogTitle') ?? '').trim(),
    ogDescription:   String(formData.get('ogDescription') ?? '').trim(),
    ogImage:         String(formData.get('ogImage') ?? '').trim(),
    ogImagePublicId: String(formData.get('ogImagePublicId') ?? '').trim(),
    ogType:          String(formData.get('ogType') ?? 'website'),
    twitterCard:     String(formData.get('twitterCard') ?? 'summary_large_image'),
    jsonLd,
    slugHistory,
  };
}

// ── reads ────────────────────────────────────────────────────────

export async function getCustomPages({
  page = 1,
  limit = 20,
  search = '',
  status,
} = {}) {
  await dbConnect();

  const filter = {};
  if (status) filter.status = String(status);
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { slug:  { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [docs, total] = await Promise.all([
    CustomPage.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomPage.countDocuments(filter),
  ]);

  return {
    // STRIPPED for PAYLOAD, not for secrecy. This list is admin-only, so a draft
    // here leaks to nobody who may not already open it — but the read has no
    // projection and returns up to `limit` whole documents, so carrying the
    // draft would ship a second full copy of every page's body to the browser on
    // every list render. The list renders a title, a slug, a status and a date.
    //
    // A row's `hasDraft` flag, if the list ever wants to mark pending work the
    // way the builder's rows are marked, is a boolean derived here — never the
    // draft itself.
    items: serialize(docs.map((d) => stripDraft(d))),
    total,
    page,
    limit,
  };
}

/**
 * The EDITOR's read.
 *
 * DELIBERATELY NOT STRIPPED. This is what /admin/pages/[id]/edit opens, and the
 * editor's whole job is to work on the pending draft — stripping here would show
 * the author the published content, and their next save would write it back over
 * their own unpublished work. Admin-gated by the route, never public.
 */
export async function getCustomPageById(id) {
  if (!id) return null;
  await dbConnect();
  const doc = await CustomPage.findById(id).lean();
  return serialize(doc);
}

export async function getCustomPageBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  // Slugs are ASCII kebab-case, but keep parity with the article action:
  // Next.js sometimes hands us the raw `[slug]` param URL-encoded.
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({
    slug: key,
    status: 'published',
  }).lean();
  // THE PUBLIC READ. stripDraft is mandatory here and is the single most
  // important line in this file: the draft is unpublished by definition, this
  // read has no projection, and its result is serialized into a page a visitor
  // receives. Without it, every published page with pending edits would ship
  // them to the public — the exact failure the whole split exists to prevent.
  return serialize(stripDraft(doc));
}

/**
 * Fetch a page by slug with NO status filter — used by the admin preview
 * and the future redirect lookup.
 *
 * DELIBERATELY NOT STRIPPED, and this is the one read where that is correct.
 * It backs `?preview=<token>`, whose entire purpose is to show the author what
 * is NOT public yet; a stripped read here would render the live page and the
 * preview link would silently stop being a preview. The caller is gated on the
 * token before it ever gets here — see resolveCustomPageForRequest in
 * (public)/[...slug]/page.jsx, which matches previewToken first and calls
 * getCustomPageBySlug (stripped) on every other path.
 */
export async function getCustomPageBySlugAny(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({ slug: key }).lean();
  return serialize(doc);
}

/**
 * Resolve a historical slug to the page's current slug — used for 301
 * redirects in a later batch. Returns the current slug string or null.
 */
export async function findCustomPageByHistoricalSlug(slug) {
  if (!slug) return null;
  await dbConnect();
  let key = String(slug);
  try { key = decodeURIComponent(key); } catch { /* malformed → use raw */ }
  const doc = await CustomPage.findOne({ slugHistory: key, status: 'published' })
    .select('slug')
    .lean();
  return doc ? serialize(doc) : null;
}

// ── mutations ────────────────────────────────────────────────────

export async function createCustomPage(formData) {
  await requireAdmin('pages');
  await dbConnect();

  const raw = parseFormData(formData);
  const parsed = customPageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  // Reserved slugs + cross-collection uniqueness (a custom page and a
  // builder page must never share a slug — see lib/pages/slugGuard.js).
  const slugCheck = await checkSlugAvailable(parsed.data.slug);
  if (!slugCheck.ok) return slugCheck;

  const stamp = await currentUserStamp();

  try {
    const doc = await CustomPage.create({
      ...parsed.data,
      previewToken: randomUUID(),
      createdBy: stamp,
      updatedBy: stamp,
    });
    await recordAudit({
      pageId: String(doc._id),
      pageType: AUDIT_TYPE,
      action: 'create',
      before: null,
      after: auditFields(doc),
      actor: stamp,
    });
    bustCaches(doc.slug);
    return { ok: true, slug: doc.slug, id: String(doc._id) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateCustomPage(id, formData) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const existing = await CustomPage.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const raw = parseFormData(formData);
  const parsed = customPageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  const slugCheck = await checkSlugAvailable(parsed.data.slug, { excludeCustomId: id });
  if (!slugCheck.ok) return slugCheck;

  const update = { ...parsed.data };

  // Slug history: if the slug changed, retire the old one into history
  // (deduped) and make sure the new slug never lingers there.
  if (parsed.data.slug !== existing.slug) {
    const history = new Set(existing.slugHistory ?? []);
    history.add(existing.slug);
    history.delete(parsed.data.slug);
    update.slugHistory = [...history];
  }

  update.updatedBy = await currentUserStamp();

  try {
    const updated = await CustomPage.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    await recordAudit({
      pageId: String(id),
      pageType: AUDIT_TYPE,
      action: 'update',
      before: auditFields(existing),
      after: auditFields(updated),
      actor: update.updatedBy,
    });
    // Bust caches for both the old and the new slug.
    bustCaches(existing.slug);
    bustCaches(updated.slug);
    return { ok: true, slug: updated.slug };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

/**
 * Save the author's work WITHOUT touching the live page.
 *
 * ── ONE ACTION, WHERE THE BUILDER HAS THREE, AND THAT IS DELIBERATE ────────
 * The Page Builder splits this across updatePageIdentity / saveDraftContent /
 * publishPageStatus. That shape exists because the builder has THREE UI
 * surfaces that write independently — an identity panel, a five-second autosave
 * and a publish dialog — so each needs its own entry point and its own conflict
 * story.
 *
 * This form has ONE button. Copying the builder's split without the reason for
 * it would invent a partial-failure state this form cannot describe to anyone:
 * identity saved, draft not, with a single "บันทึกฉบับร่าง" having half worked
 * and no way to say which half. So identity and content are written together,
 * in one call, with one conflict story and one round trip. Do not "fix" the
 * divergence from the builder — the divergence is the point.
 *
 * ── WHAT GOES WHERE ───────────────────────────────────────────────────────
 * The thirteen CUSTOM_PAGE_DRAFT_KEYS go into `draft`, so a published page does
 * not change. `slug` and its history are LIVE-ONLY and are written immediately:
 * slug is identity, with a unique index, a cross-collection guard and a public
 * route, and a "draft slug" is a slug the unique index cannot protect. That is
 * a known, accepted limit, exactly as it is for the builder.
 *
 * ── IT DOES NOT WRITE `status`, AND THAT IS THE SECOND-AUTHORITY FIX ──────
 * status is live-only but it is NOT this action's to set. Exactly one path makes
 * a page public — publishCustomPage — and exactly one takes it down —
 * toggleCustomPageStatus. If saving a draft could also set status, a save would
 * be able to publish the STALE live content while the new content sat in the
 * draft, which is the precise defect the draft split exists to remove. Enforced
 * here at the action layer rather than only in the UI, so no future caller can
 * reintroduce it by passing a status.
 */
export async function saveCustomPageDraft(id, formData) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const existing = await CustomPage.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const raw = parseFormData(formData);
  const parsed = customPageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }

  const slugCheck = await checkSlugAvailable(parsed.data.slug, { excludeCustomId: id });
  if (!slugCheck.ok) return slugCheck;

  const actor = await currentUserStamp();

  // The live half: identity only. `status` is deliberately absent — see above.
  const set = { slug: parsed.data.slug, updatedBy: actor };
  if (parsed.data.slug !== existing.slug) {
    const history = new Set(existing.slugHistory ?? []);
    history.add(existing.slug);
    history.delete(parsed.data.slug);
    set.slugHistory = [...history];
  }

  // The draft half. savedAt/savedBy are SERVER-managed and deliberately outside
  // customPageDraftContentSchema — a client cannot submit them.
  const content = {};
  for (const key of CUSTOM_PAGE_DRAFT_KEYS) content[key] = parsed.data[key];
  set.draft = { ...content, savedAt: new Date(), savedBy: actor };

  try {
    const updated = await CustomPage.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    await recordAudit({
      pageId: String(id),
      pageType: AUDIT_TYPE,
      action: 'draft.save',
      before: { hadDraft: hasUnpublishedDraft(existing) },
      after: { hasDraft: true },
      actor,
    });
    // The live page did not change unless the SLUG did, so only a rename needs
    // the old path busted. The new path is busted either way: a draft save
    // changes what the ?preview= route renders.
    if (parsed.data.slug !== existing.slug) bustCaches(existing.slug);
    bustCaches(updated.slug);
    return { ok: true, slug: updated.slug };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
    return { ok: false, error: err?.message ?? 'บันทึกฉบับร่างไม่สำเร็จ' };
  }
}

/**
 * Promote the pending draft onto the live fields and publish the page.
 *
 * THE ONLY PATH THAT MAKES A PAGE PUBLIC. The สถานะ select can take a published
 * page down and nothing else; the admin list's toggle routes here for the same
 * reason. One concept, one writer.
 *
 * A NULL DRAFT IS A VALID PUBLISH, not an error: it is a republish of content
 * that is already live, or the first publish of a page whose content was seeded
 * at create. Mirrors publishPageStatus, which treats it the same way.
 */
export async function publishCustomPage(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const existing = await CustomPage.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const set = { status: 'published', draft: null };
  if (hasUnpublishedDraft(existing)) Object.assign(set, effectiveContent(existing));

  /**
   * RE-VALIDATED BEFORE PROMOTION — defence in depth on top of the write path's
   * own validation, not a substitute for it. `draft` is stored as a Mixed blob
   * and nothing in the database enforces its shape, so a draft written by an
   * older or looser path would otherwise reach the live fields unchecked. This
   * is the last point at which that is still catchable.
   *
   * WHAT IT DOES *NOT* CHECK, stated here so nobody reads more into it than it
   * earns: `body` is validated as a non-empty STRING and nothing else. Zod knows
   * nothing about the HTML inside it — not that it parses, not that it is safe,
   * not that the sanitizer will keep any of it. Sanitisation happens at render
   * time in CustomPageView and is the only thing that judges the markup. A green
   * result here means the envelope is well-formed, not that the page is.
   */
  const resulting = customPageSchema.safeParse(stripDraft({ ...existing, ...set }));
  if (!resulting.success) return { ok: false, error: firstZodMessage(resulting.error) };

  const actor = await currentUserStamp();
  try {
    const updated = await CustomPage.findByIdAndUpdate(
      id,
      { $set: { ...set, updatedBy: actor } },
      { new: true, runValidators: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    await recordAudit({
      pageId: String(id),
      pageType: AUDIT_TYPE,
      action: 'publish',
      before: { status: String(existing.status ?? ''), hadDraft: hasUnpublishedDraft(existing) },
      after: { status: 'published', hasDraft: false },
      actor,
    });
    bustCaches(updated.slug);
    return { ok: true, slug: updated.slug };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'เผยแพร่ไม่สำเร็จ' };
  }
}

/**
 * Throw the pending draft away and go back to what is published.
 *
 * Writes `draft: null` and NOTHING else — it does not touch status, content or
 * identity. Discarding pending work and taking a page down are different
 * decisions and neither implies the other.
 */
export async function discardCustomPageDraft(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();

  const existing = await CustomPage.findById(id).lean();
  if (!existing) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  const actor = await currentUserStamp();
  try {
    const updated = await CustomPage.findByIdAndUpdate(
      id,
      { $set: { draft: null } },
      { new: true }
    );
    if (!updated) return { ok: false, error: 'ไม่พบหน้าเพจ' };
    await recordAudit({
      pageId: String(id),
      pageType: AUDIT_TYPE,
      action: 'draft.discard',
      before: { hadDraft: hasUnpublishedDraft(existing) },
      after: { hasDraft: false },
      actor,
    });
    bustCaches(updated.slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ยกเลิกฉบับร่างไม่สำเร็จ' };
  }
}

export async function deleteCustomPage(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();
  const doc = await CustomPage.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };

  // BEFORE is captured from the deleted document, which is the only place it
  // still exists — the row would otherwise record a deletion of nothing.
  await recordAudit({
    pageId: String(id),
    pageType: AUDIT_TYPE,
    action: 'delete',
    before: auditFields(doc),
    after: null,
    actor: await currentUserStamp(),
  });

  // Best-effort image cleanup — never block deletion on Cloudinary.
  if (doc.ogImagePublicId) {
    try {
      await deleteFromCloudinary(doc.ogImagePublicId);
    } catch {
      /* swallow — the DB record is already gone */
    }
  }

  bustCaches(doc.slug);
  return { ok: true };
}

export async function toggleCustomPageStatus(id, status) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  if (!['draft', 'published'].includes(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();
  // Read before the write so the row can say what the status WAS — a status row
  // whose two halves are both the new value records nothing.
  const before = await CustomPage.findById(id).select('slug title status').lean();
  const doc = await CustomPage.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  await recordAudit({
    pageId: String(id),
    pageType: AUDIT_TYPE,
    action: 'status',
    before: auditFields(before),
    after: auditFields(doc),
    actor: await currentUserStamp(),
  });
  bustCaches(doc.slug);
  return { ok: true };
}

export async function regeneratePreviewToken(id) {
  await requireAdmin('pages');
  if (!id) return { ok: false, error: 'Missing page id' };
  await dbConnect();
  const token = randomUUID();
  const doc = await CustomPage.findByIdAndUpdate(
    id,
    { $set: { previewToken: token } },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  /**
   * THE TOKEN ITSELF IS NEVER RECORDED, and neither half of this row carries a
   * value at all. `previewToken` is a credential: anyone holding it can read an
   * unpublished page, so writing it into an append-only log that a different
   * screen renders would turn the audit trail into a way to obtain access.
   *
   * That is the same reasoning `auditContract.js` applies to the builder's
   * preview pair, which it files as `act_only` precisely so that
   * regeneratePreviewPassword cannot log what it generated. The ACT is worth
   * recording — someone invalidated the old link — and the value is not.
   */
  await recordAudit({
    pageId: String(id),
    pageType: AUDIT_TYPE,
    action: 'preview.regenerate',
    before: null,
    after: null,
    actor: await currentUserStamp(),
  });
  return { ok: true, token };
}
