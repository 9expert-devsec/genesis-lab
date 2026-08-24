import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 79 — the builder branch of the promotion route renders NO back link.
 *
 * The link sat in a contained strip above `PageBuilderView`, while the
 * sections below it run full-bleed. Measured on the live page before removal:
 * an 80px band with 56px padding-top whose only child was the link. Once the
 * first section carries a light custom background, that strip reads as a
 * detached band of route colour between the navbar and the page.
 *
 * ── WHY THIS IS A SOURCE TEST AND NOT A RENDER TEST ──────────────────────
 * The route component is an async RSC that awaits `getPageBuilderPageBySlugAny`
 * and `resolvePromotion`; rendering it in this tier would mean stubbing the
 * data layer, and the stub — not the route — would decide which branch runs.
 * The question here is narrow and textual: does the BUILDER branch contain a
 * link back to /promotions? That is answerable from the source, and the
 * branch boundaries are unambiguous.
 *
 * ── THE MSDB BRANCH KEEPS ITS OWN, AND THAT IS PINNED TOO ────────────────
 * Removing one and not the other is the decision, so both halves are asserted.
 * A later sweep that "finishes the job" has to come through this test.
 */

const SRC = 'src/app/(public)/promotions/[slug]/page.jsx';

/**
 * The two branches, split on the guard that separates them. `code` is the
 * comment-stripped read — round 79's own explanatory comment names the link
 * and the URL, and a raw read would match the prose rather than the markup.
 */
function branches() {
  const { code } = readSource(SRC);
  /**
   * THE SLICE STARTS AT THE COMPONENT, NOT AT THE GUARD.
   *
   * `generateMetadata` earlier in this file branches on the SAME guard and
   * calls `resolvePromotion(segment)` too, so `indexOf` from the top of the
   * file captured the metadata function instead of the render — a slice with
   * no JSX in it, which made an absence check pass for the wrong reason and a
   * presence check fail for the wrong reason. Anchored on the default export.
   */
  const fnAt = code.indexOf('export default async function PromotionDetailPage');
  assert.notEqual(fnAt, -1, 'the page component was renamed — this test cannot locate the render');
  const body = code.slice(fnAt);

  const at = body.indexOf('shouldRenderBuilderPromotion');
  assert.notEqual(at, -1, 'the builder-branch guard is gone from the render — file restructured');
  const msdbAt = body.indexOf('resolvePromotion(segment)');
  assert.notEqual(msdbAt, -1, 'the MSDB branch is gone from the render — file restructured');
  assert.ok(msdbAt > at, 'the branches are no longer in the order this test assumes');

  const builder = body.slice(at, msdbAt);
  // The slice must contain the thing it is a slice OF, or it is measuring air.
  assert.match(builder, /PageBuilderView/,
    'the builder slice contains no PageBuilderView — the anchors no longer bracket the branch');
  return { builder, msdb: body.slice(msdbAt), whole: code };
}

const BACK_TEXT = 'กลับไปหน้าโปรโมชัน';

test('the builder branch renders no link back to /promotions', () => {
  const { builder } = branches();
  assert.equal(builder.includes(BACK_TEXT), false,
    'the back link is back on the builder branch. It sat in an 80px contained strip above a '
    + 'full-bleed PageBuilderView and read as a detached band once a section carried a light '
    + 'custom background. Round 79 removed it; the navbar and the browser both already go back.');
  assert.equal(/href="\/promotions"/.test(builder), false,
    'the builder branch links to /promotions again, by href if not by that label');
});

test('the band that held it went with it', () => {
  /**
   * The band existed only for the link — measured on the live page,
   * `onlyChildIsTheLink` was true — so leaving an empty padded strip would
   * keep the gap the removal was for.
   */
  const { builder } = branches();
  assert.equal(/pt-10\s+lg:pt-14/.test(builder), false,
    'the contained strip is still there with its 40/56px top padding, so the first section still '
    + 'does not begin under the navbar');
});

test('CONTROL: the check names the link when it is put back', () => {
  /**
   * Both assertions above are absence checks, and an absence check passes
   * against an empty string, a renamed file, or a slice that stopped matching.
   * This feeds the pre-round-79 markup through the same predicates and
   * requires each to fail.
   */
  const restored = '<div className="mx-auto max-w-[1200px] px-4 pt-10 lg:pt-14">'
    + '<Link href="/promotions" className="inline-flex items-center gap-1 text-sm">'
    + '<span aria-hidden="true">←</span> ' + BACK_TEXT + '</Link></div>';
  assert.ok(restored.includes(BACK_TEXT), 'the control string lost the label it is controlling for');
  assert.ok(/href="\/promotions"/.test(restored), 'the control string lost the href');
  assert.ok(/pt-10\s+lg:pt-14/.test(restored), 'the control string lost the band padding');

  // …and the real branch is not the control string, so the checks are live.
  const { builder } = branches();
  assert.notEqual(builder, restored);
});

test('the MSDB branch KEEPS its back link — the removal was scoped on purpose', () => {
  /**
   * That link sits inside a contained <article> above a title/date/tags
   * header, not over a full-bleed authored hero, so the defect round 79
   * removed does not arise there. Pinned so a later sweep has to argue rather
   * than tidy.
   */
  const { msdb } = branches();
  assert.ok(msdb.includes(BACK_TEXT),
    'the MSDB promotion branch lost its back link too. That layout is contained and shows a '
    + 'title header — round 79 scoped the removal to the full-bleed builder branch deliberately.');
});
