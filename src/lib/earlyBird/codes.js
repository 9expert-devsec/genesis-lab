/**
 * THE EARLY BIRD REFUSAL CODES. One vocabulary, three readers.
 *
 * ══ WHY THEY ARE NOT IN course-promos.js ANY MORE ══════════════════════════
 *
 * They were `export const` in `src/lib/actions/course-promos.js`, which opens
 * with `'use server'` — and **every export of a `'use server'` module must be
 * an async function**. A non-async export there is not a lint preference, it is
 * a BUILD ERROR:
 *
 *     × Only async functions are allowed to be exported in a "use server" file.
 *       ╭─[src/lib/actions/course-promos.js:230:1]
 *
 * and it takes the WHOLE APP down — every route 500s, not just the Early Bird
 * screens. It shipped and survived because the verification suite has no
 * bundler: `npm test` was green at 9398 passing while `/`, `/promotions` and
 * every other route returned 500. That is the entire reason
 * `test/fs/useServerExportsAsync.test.mjs` now sweeps the directory.
 *
 * So the codes live in a PLAIN module. No `'use server'`, no directive of any
 * kind, no imports — nothing that could make it a server boundary. A file that
 * holds two strings must not be able to acquire one.
 *
 * ── DO NOT RE-EXPORT THESE FROM course-promos.js ──────────────────────────
 * The obvious tidy-up — keeping the old import path working with
 * `export { EB_CLAIMED } from '@/lib/earlyBird/codes'` — reintroduces the exact
 * build error, because a re-exported const is still a non-async export of a
 * `'use server'` file. Import them from here.
 *
 * ══ WHY THE CLIENTS IMPORT THEM RATHER THAN RETYPING THEM ══════════════════
 *
 * `EarlyBirdTab` and `PromotionEarlyBirdClient` each compared
 * `result?.code === 'EB_NEEDS_ADOPTION'` as a hand-written literal. Two copies
 * of a vocabulary the server owns is a drift waiting to happen: rename the code
 * on the server and both comparisons keep compiling, keep passing every test,
 * and silently stop matching — so the adoption confirm never appears and the
 * save reports a bare refusal instead. Nothing would report it.
 *
 * That is the same move `lib/registrations/statuses.js` already makes for the
 * registration statuses, and `lib/pages/draftState.js` for the draft helpers:
 * the vocabulary is a module, and the screens read it.
 *
 * ── THE SHAPE IS A STRING, DELIBERATELY ──────────────────────────────────
 * These cross a server-action boundary inside a plain result object, so they
 * are serialised. A `Symbol` would not survive it and an enum object would add
 * a shape for no reader.
 */

/**
 * The course is held by ANOTHER promotion. A hard refusal: the save is
 * rejected and the holder is named.
 *
 * Read by: `writeEarlyBird`'s `claimedRefusal` (the writer), and — as the code
 * on the returned object — by any caller distinguishing this from adoption.
 */
export const EB_CLAIMED = 'EB_CLAIMED';

/**
 * The row exists and belongs to NO promotion. Not a refusal — a request for
 * confirmation: adopting it moves the row under the selected promotion, and the
 * writer will not do that silently.
 *
 * Read by: `writeEarlyBird` (returns it), `EarlyBirdTab` and
 * `PromotionEarlyBirdClient` (both re-submit with `adopt: true` once the author
 * agrees). Those two are why this module exists rather than a local constant.
 */
export const EB_NEEDS_ADOPTION = 'EB_NEEDS_ADOPTION';

/**
 * The course is held by a GENESIS PAGE — another promotion page owns this row
 * through `owner_page_id`. A hard refusal, like EB_CLAIMED, and separate from it
 * on purpose.
 *
 * ── WHY IT IS NOT JUST EB_CLAIMED ─────────────────────────────────────────
 * The two refusals have DIFFERENT WAYS OUT, and a code that cannot tell them
 * apart forces every screen to guess which one it is showing:
 *
 *   EB_CLAIMED        an MSDB promotion holds it → release it from that
 *                     promotion's Early Bird screen
 *   EB_PAGE_CLAIMED   a Genesis page holds it → clear the binding in THAT
 *                     page's settings, or edit the Early Bird there
 *
 * The holder is named on the refusal either way (`claim.promotion_id` /
 * `claim.owner_page_id`), so a screen can link straight to the place the author
 * has to go rather than telling them a course is taken and stopping.
 *
 * Read by: `writeEarlyBird` (returns it). No client reads it yet — the page-side
 * settings UI that will is the next round's work, and this code exists now so
 * that UI reads a vocabulary the server already owns rather than inventing one.
 */
export const EB_PAGE_CLAIMED = 'EB_PAGE_CLAIMED';
