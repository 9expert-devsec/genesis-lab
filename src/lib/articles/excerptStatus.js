import { ARTICLE_EXCERPT_MAX } from '@/lib/schemas/article';
import { META_DESCRIPTION_MAX } from '@/lib/seo/metaDescription';

/**
 * What the excerpt field should be telling the admin, right now.
 *
 * ── WHY THIS IS A MODULE AND NOT THREE TERNARIES IN THE FORM ───────────────
 * The rule it encodes is the whole point of the change — WARN at the length
 * where something gets truncated, BLOCK only at the length the server will
 * actually reject — and a rule expressed as JSX conditions cannot be tested.
 * The form is a client component full of `useState`; the render tier drives
 * components with renderToStaticMarkup and has no interaction, so nothing can
 * type 1,200 characters into a textarea and read the result back. Here the same
 * rule is a function anyone can call with a string.
 *
 * ── THE FAILURE THIS REPLACES ──────────────────────────────────────────────
 * The excerpt textarea had no maxLength, no counter and no client check. A
 * 1,200-character paste was accepted in silence and the first signal arrived at
 * SAVE, as `excerpt: String must contain at most 500 character(s)` in a banner
 * at the top of the page, after the whole form was filled in. That is why this
 * read as "articles cannot be created" rather than "this field is too long".
 *
 * ── WHY NO maxLength ATTRIBUTE, WHICH WOULD BE THE ONE-LINE FIX ────────────
 * `maxLength` truncates a paste SILENTLY. The admin pastes 1,200 characters,
 * the browser keeps 2,000 (or 500, as it was), and nothing says the rest was
 * discarded — the text is simply gone, and it is gone from the clipboard too by
 * the time anyone notices. A counter that says "2,340 / 2,000, over by 340" is
 * worse-looking and strictly better: nothing is destroyed, and the admin can
 * see exactly how much to cut.
 *
 * ── THE TWO THRESHOLDS, AND WHY THE WARN ONE IS CONDITIONAL ────────────────
 * BLOCK is ARTICLE_EXCERPT_MAX, because that is the number the server enforces.
 * The form must not refuse text the server would accept, so this is imported
 * from the schema rather than restated.
 *
 * WARN is META_DESCRIPTION_MAX, and only when `seoDescription` is empty —
 * because that is the only condition under which the excerpt becomes the page's
 * meta description and gets truncated by lib/seo/metaDescription.js. Warning
 * unconditionally was considered and rejected: the median stored excerpt is 186
 * characters, so an unconditional 160 warning fires on most articles, and a
 * warning that is usually on is a warning nobody reads. Conditional, it fires
 * exactly when it is true and names something the admin can act on — fill the
 * SEO field, or accept the cut.
 *
 * Note what is deliberately NOT warned about: every listing surface clamps by
 * LINES (line-clamp-2, line-clamp-3) and the article-page lead does not clamp
 * at all. There is no character count at which those change behaviour, so
 * there is nothing truthful to say about them here.
 */

export const EXCERPT_WARN_AT = META_DESCRIPTION_MAX;
export const EXCERPT_BLOCK_AT = ARTICLE_EXCERPT_MAX;

/**
 * @param {string} excerpt current field value, untrimmed — the admin sees the
 *   characters they typed, including trailing ones
 * @param {object} [opts]
 * @param {string} [opts.seoDescription] the sibling field; when it is non-empty
 *   the excerpt never becomes the meta description
 * @returns {{length:number, over:number, level:'ok'|'warn'|'block', blocked:boolean, message:string|null}}
 */
export function excerptStatus(excerpt, { seoDescription = '' } = {}) {
  // `.trim()` to match the schema, which trims BEFORE it measures. Counting
  // untrimmed here would block a save the server would have accepted, on
  // whitespace the admin cannot see.
  const length = String(excerpt ?? '').trim().length;
  const over = Math.max(0, length - EXCERPT_BLOCK_AT);

  if (over > 0) {
    return {
      length,
      over,
      level: 'block',
      blocked: true,
      message: `ยาวเกินขีดจำกัด ${over.toLocaleString('en-US')} ตัวอักษร — ตัดออกก่อนบันทึก`,
    };
  }

  const seoFilled = String(seoDescription ?? '').trim().length > 0;
  if (!seoFilled && length > EXCERPT_WARN_AT) {
    return {
      length,
      over: 0,
      level: 'warn',
      blocked: false,
      message:
        `ยาวเกิน ${EXCERPT_WARN_AT} ตัวอักษร และยังไม่ได้กรอก SEO Description — ` +
        'meta description จะถูกตัดให้สั้นลงอัตโนมัติ',
    };
  }

  return { length, over: 0, level: 'ok', blocked: false, message: null };
}

/**
 * Split a server action's error into the field it belongs to and its message.
 *
 * `firstZodMessage` (actions/articles.js:170-175) formats every rejection as
 * `${path}: ${message}` — so `excerpt: String must contain at most 2000
 * character(s)`. The form rendered that whole string in a banner at the TOP of
 * a scrolling page, which names the field and then puts the message as far as
 * possible from it. Splitting it lets the message land ON the field.
 *
 * Returns `field: null` for anything that is not in that shape (a thrown
 * Error's message, a plain Thai string like 'ไม่พบบทความ'), so the caller keeps
 * showing those in the banner rather than attaching them to a guessed field.
 *
 * @param {string|null|undefined} error
 * @returns {{field: string|null, message: string}}
 */
export function fieldFromActionError(error) {
  const text = String(error ?? '').trim();
  if (!text) return { field: null, message: '' };

  // Deliberately narrow: a leading identifier (optionally dotted, as zod joins
  // nested paths with '.') followed by ': '. A Thai message has no ASCII
  // identifier before its colon, and a message that merely CONTAINS a colon —
  // a URL, a time — does not start with one.
  const m = text.match(/^([A-Za-z][A-Za-z0-9_.]*):\s+(.*)$/s);
  if (!m) return { field: null, message: text };
  return { field: m[1], message: m[2] };
}
