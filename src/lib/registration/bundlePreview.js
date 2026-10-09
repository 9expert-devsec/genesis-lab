/**
 * BUNDLE REGISTRATION IN PREVIEW MODE — the flag, the words, and the rule that
 * the flag is never the authority.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 * `/preview/<slug>` renders a page's DRAFT behind a password. A bundle on that
 * page could be looked at but not exercised: its register button leads to a
 * wizard that resolves the PUBLISHED document, so an author previewing an
 * unpublished promotion could not see what a customer would actually be asked.
 *
 * Preview mode closes that: the same wizard, reading the same draft the preview
 * page rendered, validating exactly as a real submit would — and writing
 * nothing.
 *
 * ── THE FLAG IS A ROUTING HINT, THE COOKIE IS THE AUTHORISATION ────────────
 * `?preview=1` says WHICH document to read. It grants nothing. Every surface
 * that honours it must first verify the preview cookie for that page's own
 * slug, exactly as `/preview/[slug]` does — same signature, same expiry, same
 * enabled/passwordHash gates. A request carrying the flag and no valid cookie
 * is refused; it never falls through to the live path, because falling through
 * would turn an unauthorised preview into a REAL registration.
 *
 * The flag is needed even though the cookie alone could imply it. The common
 * case is a page that IS published and has a draft on top: the id resolves as
 * published either way, so nothing but an explicit flag can say which of the
 * two versions the author means.
 */

/** The query parameter, in one place so the link and the reader agree. */
export const PREVIEW_PARAM = 'preview';
const PREVIEW_ON = '1';

/**
 * Does this request ASK for preview mode? A question about intent only — the
 * caller must still authorise it. Written as a separate predicate from the
 * authorisation precisely so neither can be mistaken for the other.
 */
export function wantsBundlePreview(params) {
  const raw = params?.[PREVIEW_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === PREVIEW_ON;
}

/**
 * The wizard link for a bundle, with the preview flag when the page that drew
 * the button was itself a preview.
 *
 * `pageId` and `sectionId` are BOTH required — a link missing half its key
 * would resolve to a different bundle on a duplicated page, which is why the
 * card draws nothing rather than a half key.
 */
export function bundleRegisterHref({ pageId, sectionId, preview = false }) {
  if (!pageId || !sectionId) return null;
  const base = `/registration/bundle?page=${encodeURIComponent(pageId)}&section=${encodeURIComponent(sectionId)}`;
  return preview ? `${base}&${PREVIEW_PARAM}=${PREVIEW_ON}` : base;
}

/**
 * THE BANNER, carried on every step so the mode cannot be forgotten halfway
 * through. It states the CONSEQUENCE rather than the mode alone, because
 * "preview" is a word an author may read as "preview of the page" and walk
 * straight past on their way to filling in a form.
 */
export const BUNDLE_PREVIEW_BANNER = 'โหมดพรีวิว — การสมัครนี้จะไม่ถูกบันทึก';

/**
 * THE SUBMIT LABEL. `ตรวจสอบ` rather than `ยืนยัน`, with the consequence in
 * the button itself: the last step is the one place a dry run and a real
 * submission look alike, and the button is the last thing read before an act
 * that otherwise looks irreversible.
 */
export const BUNDLE_PREVIEW_SUBMIT = 'ตรวจสอบ (ไม่บันทึก)';

/** The success screen's title, where a real submit says the request arrived. */
export const BUNDLE_PREVIEW_SUCCESS_TITLE = 'ตรวจสอบเรียบร้อย — ไม่ได้บันทึกคำขอ';

/**
 * …and its body. It names all three things that did NOT happen, because an
 * author who has just filled in a real-looking form needs to know there is
 * nothing to cancel, nothing to find, and no mail on its way to anyone.
 */
export const BUNDLE_PREVIEW_SUCCESS_BODY =
  'นี่คือโหมดพรีวิว ระบบตรวจสอบข้อมูลครบถ้วนแล้วแต่ไม่ได้บันทึกคำขอ ไม่ได้สร้างเลขอ้างอิง และไม่ได้ส่งอีเมล';

/** What a request carrying the flag without a valid preview cookie is told. */
export const BUNDLE_PREVIEW_FORBIDDEN = 'ไม่มีสิทธิ์ดูตัวอย่างแพ็กเกจนี้';

/**
 * …and why, without hinting at which of the four gates refused. A page that
 * distinguishes "no such page" from "wrong cookie" from "expired" hands an
 * unauthorised caller a probe for which unpublished pages exist.
 */
export const BUNDLE_PREVIEW_FORBIDDEN_BODY =
  'ลิงก์นี้ต้องเปิดจากหน้าตัวอย่างที่ปลดล็อกแล้ว กรุณาเปิด /preview ของหน้านั้นและใส่รหัสผ่านอีกครั้ง';
