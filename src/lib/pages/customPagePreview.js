/**
 * What the ?preview=<token> banner says on an Advanced HTML page.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 * Before the draft split, `?preview=` meant exactly one thing — "this page is
 * not published yet, here is what it will look like" — and one sentence covered
 * it: "ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่)".
 *
 * The split gives the token a second job. It now also shows the pending draft of
 * a page that IS published, and on that page the old sentence is simply false:
 * the page is published, and the visitor-facing URL is serving different
 * content. Shipping a fourth false sentence in the work that removed three would
 * be indefensible, so the banner became a function of what the reader is
 * actually looking at.
 *
 * ── THREE STATES, NOT TWO, AND THE THIRD IS WHY ───────────────────────────
 * The round called for splitting the one sentence in two — the unpublished case
 * and the pending-draft case. Writing them out produced a third that neither
 * covers: a PUBLISHED page with NO draft. Its preview is byte-for-byte what the
 * public already sees, and both other sentences lie about it — one claims it is
 * unpublished, the other claims the live page differs. So it gets its own line.
 *
 * PURE, and separate from the route, for the reason the builder's previewMode is:
 * a banner is a claim about state, and a claim that can only be exercised by
 * fetching a page is a claim nothing pins. Every branch is reachable from a test
 * with two booleans.
 */

export const CUSTOM_PAGE_PREVIEW_BANNERS = {
  /** The page has never been published. The original sentence, still true. */
  unpublished: 'ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — เฉพาะผู้ดูแลระบบ',
  /**
   * Published, and carrying edits that are not live. The important one: it must
   * say BOTH that this is unpublished work AND that the real page is unchanged,
   * because an author who reads only the first half will think they have already
   * shipped it.
   */
  draftPending: 'ตัวอย่างฉบับร่างที่ยังไม่เผยแพร่ — หน้าจริงยังแสดงเนื้อหาเดิมอยู่ กด “เผยแพร่” เพื่อให้มีผล',
  /** Published, nothing pending. This preview and the public page are the same. */
  matchesLive: 'หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้',
};

/**
 * Which banner, as a KEY rather than a string, so a caller can branch on the
 * state without matching prose. Same split as the builder's previewBannerKey.
 *
 * `published` is checked FIRST: an unpublished page carrying a draft is still
 * unpublished, and telling its author "the real page shows the old content"
 * would describe a real page that does not exist.
 */
export function customPagePreviewBannerKey({ published, hasDraft }) {
  if (!published) return 'unpublished';
  return hasDraft ? 'draftPending' : 'matchesLive';
}

/** The banner string itself. */
export function customPagePreviewBanner({ published, hasDraft }) {
  return CUSTOM_PAGE_PREVIEW_BANNERS[customPagePreviewBannerKey({ published, hasDraft })];
}
