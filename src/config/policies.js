/**
 * The legal centre: the five policy pages and their shared metadata.
 *
 * ── THE DATE IS PER PAGE. THE VERSION IS NOT. ───────────────────────────────
 * These two look like the same kind of field and are not, which is why they are
 * modelled differently.
 *
 * The date is a CLAIM ABOUT THE CONTENT: "this text was last reviewed on X".
 * A single shared date makes that claim on behalf of pages whose text nobody
 * touched. It went in as one export first, and the defect it produced was
 * immediate and specific: /privacy-policy carries wording ported unchanged from
 * a 2564 document, and a global stamp printed 11 สิงหาคม 2569 above it. That is
 * not a cosmetic drift on a legal page — it tells a visitor the privacy terms
 * were reviewed two years more recently than they were.
 *
 * So `updated` lives on each page and describes that page's copy:
 *
 *   privacy-policy   9 กันยายน 2564  — the real date of the ported text. It
 *                                      moves when someone actually reviews the
 *                                      wording, not when the site is rebuilt.
 *   the other three  11 สิงหาคม 2569 — their copy was written for this build.
 *                                      (It is also still placeholder copy; see
 *                                      each page's header.)
 *
 * The version stays global: it numbers the legal centre as a document set, not
 * any one page, and there is no equivalent per-page claim for it to get wrong.
 *
 * The Figma dated the terms page 11 มิถุนายน 2569 and the other four
 * 11 สิงหาคม 2569. That one IS a design-file inconsistency rather than two real
 * dates — terms takes สิงหาคม like its siblings.
 *
 * ── ON THE THAI IN THIS FILE ────────────────────────────────────────────────
 * สระอำ MUST be the composed form U+0E33, never the decomposed sequence
 * U+0E4D (นิคหิต) followed by U+0E32 (สระอา). The two render near-identically,
 * and the live site at 9experttraining.com/privacy-policy uses the DECOMPOSED
 * form in its company name, so copying from it silently imports a string that
 * will not match `จำกัด` in any later search, grep, or equality check.
 *
 * Note that no normalisation form fixes this — U+0E33 has no canonical
 * decomposition, so NFC/NFD/NFKC/NFKD all leave BOTH spellings untouched. The
 * only repair is an explicit replacement of the two-codepoint sequence.
 *
 * The offending codepoints are named here rather than written out, so that the
 * scan in test/fs/policyEncoding.test.mjs can stay absolute — no allowlist, no
 * "except in comments" exemption for it to be wrong about later. The company
 * name is read from siteConfig.nameFull rather than restated here, so there is
 * exactly one copy of it to get wrong.
 */

import { siteConfig } from '@/config/site';

/**
 * The date to stamp on copy written for this build.
 *
 * NOT a default and NOT "today" — it is the review date of the placeholder
 * copy on /terms and /refund-policy, and it is shared only because those two
 * pages were written together.
 *
 * NOTE: the same objection that removed the date from /privacy-policy and
 * /cookie-policy applies here — the site is not in production, so no page has
 * an honest effective date yet. These two keep theirs only because changing
 * them was outside the scope of the content rewrite. Raised for a decision.
 */
const DRAFTED_2569 = '11 สิงหาคม 2569';

/**
 * `updated: null` means "not yet in force", and it is a real state rather than
 * missing data.
 *
 * The privacy and cookie documents both arrived stamped [DD/MM/YYYY] — a
 * placeholder for a launch that has not happened. There is no honest date to
 * put there: the site is not in production, so the policy has never taken
 * effect, and inventing a date would claim it had. PolicyHero renders no stamp
 * at all when this is null rather than printing an empty label.
 *
 * WHEN THE SITE LAUNCHES, the launch date becomes the effective date for both.
 */
const NOT_YET_IN_FORCE = null;

/** Document version for the legal centre as a set. Deliberately global. */
export const POLICY_VERSION = '2.0';

/** The legal entity these policies bind. Single source: siteConfig. */
export const POLICY_ENTITY = siteConfig.nameFull;

/**
 * The four detail pages, in the order the hub grid and the footer show them.
 *
 * `icon` is a KEY, not a component — this module is imported by server
 * components, client components and the footer alike, and importing
 * lucide-react here would pull the icon set into every one of them. The key is
 * resolved once, in PolicyIcon.
 *
 * The icon vocabulary is deliberately the same one the hub's cards establish:
 * a detail page's hero icon is the icon on the card that linked to it, so the
 * two read as the same object seen twice.
 */
export const POLICY_PAGES = [
  {
    slug: 'privacy-policy',
    href: '/privacy-policy',
    icon: 'shield',
    illustration: { src: '/policies-img/privacy-hero.png', width: 360, height: 240 },
    title: 'นโยบายคุ้มครองข้อมูลส่วนบุคคล',
    titleEn: 'Privacy Policy',
    blurb: 'อธิบายวิธีการเก็บรวบรวม ใช้ เปิดเผย และปกป้องข้อมูลส่วนบุคคลของคุณ',
    // Was 9 กันยายน 2564, the publication date of the text ported from the live
    // site. That text has since been replaced wholesale by the 14-section
    // rewrite, so the 2564 date no longer describes anything on the page — and
    // the rewrite has no date of its own yet. See NOT_YET_IN_FORCE.
    updated: NOT_YET_IN_FORCE,
  },
  {
    slug: 'cookie-policy',
    href: '/cookie-policy',
    icon: 'cookie',
    illustration: { src: '/policies-img/cookie-hero.png', width: 360, height: 240 },
    title: 'นโยบายการใช้คุกกี้',
    titleEn: 'Cookie Policy',
    blurb: 'อธิบายการใช้งานคุกกี้บนเว็บไซต์ของเรา และตัวเลือกการตั้งค่าของคุณ',
    updated: NOT_YET_IN_FORCE,
  },
  {
    slug: 'terms',
    href: '/terms',
    icon: 'terms',
    illustration: { src: '/policies-img/terms-hero.png', width: 360, height: 240 },
    title: 'ข้อกำหนดและเงื่อนไข',
    titleEn: 'Terms & Conditions',
    blurb: 'เงื่อนไขการใช้บริการเว็บไซต์ เนื้อหา และบริการของ 9EXPERT',
    updated: NOT_YET_IN_FORCE,
  },
  {
    slug: 'refund-policy',
    href: '/refund-policy',
    icon: 'refund',
    illustration: { src: '/policies-img/refund-hero.png', width: 360, height: 240 },
    title: 'นโยบายการยกเลิกและคืนเงิน',
    titleEn: 'Cancellation & Refund Policy',
    blurb: 'เงื่อนไขและขั้นตอนการยกเลิกการซื้อคอร์สเรียนและการขอคืนเงิน',
    updated: DRAFTED_2569,
  },
];

/** The hub itself — breadcrumbs on every detail page point back through it. */
export const POLICY_HUB = {
  href: '/policies',
  title: 'นโยบายและข้อกำหนด',
  titleEn: 'Policies & Legal Center',
  illustration: { src: '/policies-img/policies-hero.png', width: 240, height: 240 },
};

/**
 * ── ABOUT THE HERO ARTWORK ──────────────────────────────────────────────────
 *
 * Lives in public/policies-img/ — NOT public/policies/, which would sit at the
 * same URL as the /policies route and shadow it in a way that is very hard to
 * see. reservedPaths.js carries a matching `policies-img` entry, and the parity
 * test derived from readdir(public/) went red until it did.
 *
 * `width`/`height` are the RENDERED box, not the file's intrinsic size. The
 * sources are 1254×1254 (the hub) and 1536×1024 (the four detail pages), so
 * every one is being served far larger than it draws; next/image resizes and
 * re-encodes, which is why the box is declared here rather than the file size.
 *
 * The four 3:2 files render at 360×240 and the square hub file at 240×240, so
 * all five have the same optical height and the row of heroes reads as one set.
 *
 * The artwork is DECORATIVE. It carries no information the heading does not,
 * and PolicyHero renders it aria-hidden with an empty alt.
 */

/** Look up one policy page by slug. Returns undefined if unknown. */
export function findPolicy(slug) {
  return POLICY_PAGES.find((p) => p.slug === slug);
}

/**
 * The hub's "ทางลัดที่เกี่ยวข้อง" row.
 *
 * The Figma had three tiles. The third — ดาวน์โหลดเอกสาร PDF — is dropped:
 * no such files exist, and a tile that 404s on a legal page is worse than one
 * fewer tile.
 *
 * The cookie-settings tile points at the cookie policy's browser-settings
 * SECTION, not at a consent manager. This repo has no cookie-consent manager;
 * a control that looks like it opens one and does not is a promise the page
 * cannot keep.
 */
export const POLICY_SHORTCUTS = [
  {
    // Anchors into the cookie policy's "วิธีจัดการคุกกี้" section. Renaming
    // that section's id silently breaks this tile — it was `#browser-settings`
    // until the page was rebuilt from the source document.
    icon: 'settings',
    href: '/cookie-policy#manage',
    title: 'จัดการการตั้งค่าคุกกี้',
    blurb: 'ดูวิธีปรับแต่งคุกกี้ผ่านเบราว์เซอร์ของคุณ',
  },
  {
    icon: 'dpo',
    href: '/contact-us',
    title: 'ติดต่อเจ้าหน้าที่คุ้มครองข้อมูล (DPO)',
    blurb: 'ส่งคำถามหรือขอใช้สิทธิ์ของคุณ',
  },
];

/**
 * The hub's summary panel — the four promises the privacy policy makes,
 * in plain language. These paraphrase §4 and §7 of the real privacy content;
 * they are a summary OF that page, not independent commitments.
 */
export const POLICY_SUMMARY = {
  heading: 'รายละเอียดโดยสรุป',
  subject: 'นโยบายคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)',
  bullets: [
    'เราเก็บรวบรวมข้อมูลที่จำเป็น เพื่อการให้บริการและพัฒนาประสบการณ์ของคุณ',
    'เราใช้ข้อมูลอย่างโปร่งใส ภายใต้วัตถุประสงค์ที่ชัดเจน และไม่เกินความจำเป็น',
    'เราให้สิทธิ์คุณในการเข้าถึง แก้ไข ลบ หรือขอรับข้อมูลของคุณ',
    'เรามีมาตรการรักษาความปลอดภัย ตามมาตรฐานสากล เพื่อปกป้องข้อมูลของคุณ',
  ],
  cta: 'อ่านนโยบายคุ้มครองข้อมูลส่วนบุคคล',
};

/**
 * The hub's FAQ panel.
 *
 * Each answer points at the page that actually holds the detail rather than
 * restating it, so an answer here cannot fall out of step with the policy it
 * summarises.
 */
export const POLICY_FAQ = [
  {
    q: 'ข้อมูลส่วนบุคคลของฉันจะถูกเก็บไว้นานแค่ไหน?',
    a: 'เราเก็บข้อมูลไว้เท่าที่จำเป็นตามวัตถุประสงค์ที่แจ้งไว้ และตามระยะเวลาที่กฎหมายกำหนด รายละเอียดอยู่ในนโยบายคุ้มครองข้อมูลส่วนบุคคล',
  },
  {
    q: 'ฉันสามารถปฏิเสธคุกกี้ได้หรือไม่?',
    a: 'ได้ คุณสามารถตั้งค่าปฏิเสธคุกกี้ผ่านเบราว์เซอร์ของคุณ แต่อาจส่งผลต่อการใช้งานบางฟังก์ชันบนเว็บไซต์ ดูวิธีตั้งค่าได้ในนโยบายการใช้คุกกี้',
  },
  {
    q: 'หากมีการเปลี่ยนแปลงนโยบาย จะแจ้งให้ทราบอย่างไร?',
    a: 'เราจะปรับปรุงวันที่และเวอร์ชันบนหน้านโยบายทุกครั้งที่มีการแก้ไข และจะแจ้งให้ทราบผ่านเว็บไซต์เมื่อเป็นการเปลี่ยนแปลงในสาระสำคัญ',
  },
];
