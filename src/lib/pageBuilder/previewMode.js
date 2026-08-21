/**
 * /preview/[slug] has TWO modes, and this module owns the difference.
 *
 * PURE — no db, no models, no React, no next/*. The route is a server component
 * that cannot be rendered by the test runner without a request context, so
 * every decision it makes that is worth asserting lives here instead, where it
 * can be proven as a function of its inputs.
 *
 * ── WHY ONE ROUTE AND NOT A SIBLING ───────────────────────────────────────
 * Round 33 asked. The two modes differ in exactly what is handed to
 * PageBuilderView — `composeWorkingView(page)` versus `stripDraft(page)` — and
 * share everything before it: the any-status read, the three terminal gates
 * (preview disabled / link expired / no valid cookie), the signed slug-scoped
 * cookie check, force-dynamic, and noindex. A sibling route would be a second
 * copy of four security gates whose whole value is that there is one of them,
 * and the route's own header is a list of what goes wrong when a builder page
 * acquires a second render path.
 *
 * So: a `?mode=published` search param, resolved here.
 */

export const PREVIEW_MODE_PARAM = 'mode';

/** The two modes, least privileged first. Exported so tests cannot restate it. */
export const PREVIEW_MODES = ['draft', 'published'];

export const DEFAULT_PREVIEW_MODE = 'draft';

/**
 * Which mode a request is asking for.
 *
 * UNKNOWN FALLS TO DRAFT, which is the safe direction and not an arbitrary
 * one: the draft view is what this route has always been, so a typo, a stale
 * bookmark or a crawler appending junk lands on the behaviour that already
 * existed rather than on a claim about what the public can see. An array value
 * (`?mode=a&mode=b`) is not a mode either.
 */
export function resolvePreviewMode(searchParams) {
  const raw = searchParams?.[PREVIEW_MODE_PARAM];
  return typeof raw === 'string' && PREVIEW_MODES.includes(raw) ? raw : DEFAULT_PREVIEW_MODE;
}

/**
 * ── THE THREE BANNER STATES, WHICH MUST PARTITION ─────────────────────────
 * Round 5 shipped two; this adds a third. They are declared as one frozen
 * object and selected by a TOTAL function, rather than written inline as a
 * nested ternary, because the failure this shape rules out is two of them being
 * reachable at once — a banner claiming the page has no pending draft while
 * another claims visitors are seeing it.
 *
 * The selection deliberately ignores `pending` in published mode. That is the
 * point of the mode: what is on screen is the live document, and whether an
 * unpublished draft happens to exist beside it does not change what visitors
 * are reading. Mentioning the draft here would be the one sentence on this
 * banner that is not about what is rendered below it.
 */
export const PREVIEW_BANNERS = Object.freeze({
  draftPending: 'ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — ห้ามแชร์ลิงก์นี้ต่อ',
  draftMatchesLive: 'หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้',
  published: 'กำลังดูเวอร์ชันที่เผยแพร่อยู่ — ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้',
});

/** Which banner key this request shows. Total: every input yields exactly one. */
export function previewBannerKey({ mode, pending }) {
  if (mode === 'published') return 'published';
  return pending ? 'draftPending' : 'draftMatchesLive';
}

/** The banner string itself. */
export function previewBanner({ mode, pending }) {
  return PREVIEW_BANNERS[previewBannerKey({ mode, pending })];
}

/**
 * Does this page have a published version at all?
 *
 * A UNION of two signals, because each covers a case the other misses and
 * neither is reliable alone:
 *
 *   · `publishedVersion >= 1` — round 35's counter, `$inc`-ed atomically with
 *     the publish write. Absent on any database where round 35's backfill has
 *     not run, which is why it cannot be the only test.
 *   · a PageVersion row exists — written by the same publish. Absent if that
 *     write was lost (snapshotVersion swallows, loudly since round 35), which
 *     is why it cannot be the only test either.
 *
 * A page that has genuinely never been published has neither, and that matters:
 * createPageBuilderPage populates the LIVE fields at creation, so a never-
 * published page has content in exactly the place the published view reads
 * from. Rendering it under "visitors are seeing this version" would be a lie
 * about a page the public has never been shown.
 */
export function hasPublishedVersion({ publishedVersion, hasVersionRow }) {
  return (Number.isInteger(publishedVersion) && publishedVersion >= 1) || Boolean(hasVersionRow);
}

/** The URL of a page's published view. One definition; two callers, so far. */
export function publishedViewHref(slug) {
  return `/preview/${encodeURIComponent(String(slug ?? ''))}?${PREVIEW_MODE_PARAM}=published`;
}

/**
 * May the editor OFFER a link to the published view?
 *
 * THREE conditions, and each one is the difference between an affordance and a
 * dead end — which is the inert-control class round 18 exists to catch:
 *
 *   · a PENDING DRAFT. Without one the editor's content IS the live content,
 *     so there is nothing to compare and the link answers a question nobody
 *     has. This is also the condition the pending-draft chip already renders
 *     on, so the two appear and disappear together.
 *   · a PUBLISHED VERSION. Offering "see what is live" on a page that has never
 *     been published leads to the unpublished dead end.
 *   · an ENABLED PREVIEW LINK. The published view lives behind the same preview
 *     cookie gate as the draft view — deliberately, because a page whose status
 *     is draft or closed has live fields the public cannot see. With no preview
 *     link configured, the destination is the revoked-link dead end.
 *
 * The requirement's §4 banner pairs this control with a second sentence —
 * "การเปลี่ยนแปลงนี้บันทึกแล้ว แต่ยังไม่แสดงบนเว็บไซต์". That sentence is NOT
 * shipped: it is a fourth way of saying what the pending-draft chip already
 * says, and round 27 refused a second save vocabulary for exactly this reason
 * (round 34's saver line respected it). What is new here is the way to go and
 * look, not another way to be told.
 */
export function canOfferPublishedView({ pendingDraft, publishedVersion, hasVersionRow, previewEnabled }) {
  if (!pendingDraft || !previewEnabled) return false;
  return hasPublishedVersion({ publishedVersion, hasVersionRow });
}

/**
 * Is the newest version row the one that produced what is live?
 *
 * Only ever answers false when BOTH numbers exist and disagree — which means a
 * publish incremented the counter but its snapshot never landed, so the newest
 * surviving row belongs to an EARLIER publish and its actor is the wrong person
 * to name. When either number is absent (an un-backfilled database) drift
 * cannot be detected, and the newest row is still the newest publish, so its
 * facts stand.
 *
 * Silence beats a confident wrong name — the same rule round 33 applied to
 * `updatedBy` and round 35 applied to an unnumbered row.
 */
export function versionRowMatchesLive({ publishedVersion, rowVersionNumber }) {
  const a = publishedVersion;
  const b = rowVersionNumber;
  if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
  return true;
}
