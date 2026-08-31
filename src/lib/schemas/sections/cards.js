import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.3 CARD sections (MVP — 5). Cards either reference upstream data by id
 * (course_card, instructor_card) or carry their own display fields
 * (price_card, stat_card, icon_card). Icons are Lucide names (strings), not
 * markup. Card visual style comes from the envelope's `style.cardStyle`.
 */

export const CARD_TYPES = ['course_card', 'price_card', 'stat_card', 'icon_card', 'instructor_card'];

// References a public course by its human course_id (e.g. "MSE-AI"), matching
// how promotions/links join elsewhere. Rendered from upstream data in Phase 2.
//
// ── `showPrice` DEFAULTS TO TRUE, AND THAT IS THE WHOLE DESIGN (round 50) ────
// Every course_card stored before this field existed shows the course's price,
// so `false` as the default would delete the price from every published page
// the moment this deploys, with no author having touched anything. A page
// nobody edits must not change. Turning the price OFF is a deliberate act, per
// card.
//
// The renderer must NOT read this as a plain truthiness check, and the reason
// is recorded next door in round 39's article work: `.lean()` does not apply
// Mongoose defaults and JSON serialisation drops `undefined` keys, so a
// document stored before this commit reads the key back ABSENT rather than
// `true`. `content.showPrice !== false` is what makes absent mean ON; see
// sections/course_card.jsx, which is the only reader.
const courseCardContent = z.object({
  courseId:  z.string().default(''),
  showPrice: z.boolean().default(true),
}).passthrough();

/**
 * ── ROUND 57: THE PROMOTION FIELDS, AND WHY THEY ALL DEFAULT TO '' ────────
 * docs/promotion-page-coverage.md §B measured both live promotion pages using
 * this card as a PROMOTION PRICE PANEL rather than the pricing tier it was
 * built as. Seven of that survey's fourteen field gaps are on this one type: a
 * BEFORE price, a SAVING, FINE PRINT and a corner RIBBON.
 *
 * ── THE DEFAULT RULE HERE IS INVERTED FROM ROUND 50's ─────────────────────
 * Round 50's `showPrice` above defaults to TRUE and is read `!== false`,
 * because it can REMOVE something every stored card already shows — absent had
 * to mean ON or every published card would have lost its price.
 *
 * These four are the other kind. They ADD something no page has ever shown, so
 * absent must render NOTHING, and `''` is what does that: the renderer already
 * guards every optional surface with `.trim()`, so an absent key and an empty
 * string produce the same markup as a card that predates the field. Reading any
 * of these `!== ''` — or copying round 50's `!== false` shape — would put a
 * stray element on every card in production.
 */
const priceCardContent = z.object({
  title:         z.string().default(''),
  price:         z.string().default(''), // string: may carry "฿12,900" / "สอบถาม"
  period:        z.string().default(''),
  features:      z.array(z.string()).default([]),
  buttonLabel:   z.string().default(''),
  buttonHref:    z.string().default(''),
  highlighted:   z.boolean().default(false),
  // Round 57 — all four ADD, so all four are absent-renders-nothing (§H).
  originalPrice: z.string().default(''), // struck through, above the price
  discountBadge: z.string().default(''), // the "ลด 20%" chip
  footnote:      z.string().default(''), // the VAT line — NOT a feature (§B #10)
  ribbon:        z.string().default(''), // corner text, e.g. "Early Bird ลด 20%"
}).passthrough();

const statCardContent = z.object({
  value: z.string().default(''),
  label: z.string().default(''),
  icon:  z.string().default(''), // Lucide icon name
}).passthrough();

/**
 * ── ROUND 69: `icon_card` GAINS AN IMAGE SOURCE (§G step 4, §H) ──────────
 * docs/promotion-page-coverage.md §C read both live promotion pages' “สิ่งที่
 * ได้รับ” strip: four cards, each a 512×512 raster ILLUSTRATION above a label.
 * `icon` is a Lucide NAME, so an uploaded picture had no way in, and §C
 * measured and rejected the alternative (`image` inside `card_grid` renders at
 * width 1600 with `h-auto w-full`, turning the illustration into a full-cell
 * tile with a figcaption and no card surface).
 *
 * ── IT IS THE *ADDS* KIND OF FIELD, SO IT DEFAULTS OFF (§H) ──────────────
 * Round 50's `showPrice` above is the other kind — it can REMOVE something
 * every stored card already shows, so it defaults TRUE and is read
 * `!== false`. This one ADDS something no page has ever drawn, so absent must
 * render exactly what a card that predates the field renders. `''` is what
 * does that, and the renderer branches on `imageSrc.trim()`: empty or absent
 * FALLS THROUGH to the unchanged Lucide branch. Copying the `!== false` shape
 * here would put a broken <img> on every icon_card in production.
 *
 * The value is a URL, uploaded through the same `/api/admin/upload` endpoint
 * every other image surface in this editor uses. No `publicId` is stored
 * beside it — the same choice `promotionCover` makes, and the reason its
 * folder is a sibling of `page-builder/` rather than inside it.
 */
const iconCardContent = z.object({
  icon:        z.string().default(''), // Lucide icon name
  title:       z.string().default(''),
  description: z.string().default(''),
  imageSrc:    z.string().default(''), // round 69 — set: the illustration; empty/absent: the icon
}).passthrough();

const instructorCardContent = z.object({
  instructorId: z.string().default(''),
}).passthrough();

export const cardSectionSchemas = [
  defineSection('course_card',     courseCardContent),
  defineSection('price_card',      priceCardContent),
  defineSection('stat_card',       statCardContent),
  defineSection('icon_card',       iconCardContent),
  defineSection('instructor_card', instructorCardContent),
];
