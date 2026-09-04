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

  /**
   * ── EVERY ANCHOR MUST MATCH EXACTLY ONCE IN THE SLICED BODY ──────────────
   * `indexOf` returns the FIRST match and says nothing about how many there
   * are. Each of these strings ALSO appears in `generateMetadata` earlier in the
   * file — which is why the body is sliced from the default export first — and
   * an edit that reintroduced one inside the render would silently move a
   * bracket to an arbitrary occurrence. "The first of three identical anchors"
   * is not an anchor, so each is counted, printed and required to be unique.
   *
   * ── THE ANCHORS MOVED WHEN THE ROUTE STOPPED RE-DERIVING ITS PRECEDENCE ──
   * They used to be the inlined `shouldRenderPromotionPage` guard and the
   * `resolvePromotion(segment)` call. The route now delegates to
   * `promotionDetailTarget` and resolves all three sources up front, so neither
   * brackets a branch any more — and this file went red saying so, which is the
   * exactly-once check doing its job rather than an inconvenience. Re-anchored
   * on the three `target === …` arms, which ARE the branch boundaries.
   */
  const anchorAt = (needle, what) => {
    const hits = body.split(needle).length - 1;
    assert.ok(Number.isInteger(hits), `anchor count is not an integer: ${hits}`);
    assert.equal(hits, 1,
      `the anchor ${JSON.stringify(needle)} matches ${hits} times in the render body, `
      + `not once — indexOf would bracket an arbitrary one and this test would measure `
      + `the wrong slice (${what})`);
    const at = body.indexOf(needle);
    assert.ok(at >= 0 && Number.isInteger(at), `the anchor index is not a usable offset: ${at}`);
    return at;
  };

  const at = anchorAt('if (target === "builder")', 'the builder branch is gone — file restructured');
  const customAt = anchorAt('if (target === "custom")', 'the Advanced HTML branch is gone');
  const msdbAt = anchorAt('if (!resolved) notFound();', 'the MSDB branch is gone');
  assert.ok(customAt > at && msdbAt > customAt,
    'the branches are no longer in the order this test assumes '
    + `(builder ${at}, custom ${customAt}, msdb ${msdbAt})`);

  const builder = body.slice(at, customAt);
  const custom = body.slice(customAt, msdbAt);
  // Each slice must contain the thing it is a slice OF, or it is measuring air.
  assert.match(builder, /PageBuilderView/,
    'the builder slice contains no PageBuilderView — the anchors no longer bracket the branch');
  assert.match(custom, /CustomPageView/,
    'the custom slice contains no CustomPageView — the anchors no longer bracket the branch');
  return { builder, custom, msdb: body.slice(msdbAt), whole: code };
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

/**
 * ── THE ADVANCED HTML BRANCH FOLLOWS THE BUILDER, NOT THE MSDB ────────────
 * Both page branches render onto the same route-colour surface and both are
 * reached from a card the visitor just clicked; the MSDB branch keeps its link
 * because it sits inside a contained <article> under a title/date/tags header,
 * which is a different layout with a different problem. A link this page did not
 * have at its old bare-slug URL should not appear merely because the URL moved.
 */
test('the Advanced HTML branch renders no back link either', () => {
  const { custom } = branches();
  assert.equal(custom.includes(BACK_TEXT), false,
    'the Advanced HTML promotion branch grew a back link. Round 79 removed the builder’s '
    + 'for a reason that applies here too — three other links to /promotions remain in the '
    + 'site chrome, and the browser has back.');
  assert.equal(/href="\/promotions"/.test(custom), false,
    'the custom branch links to /promotions, by href if not by that label');
});

test('CONTROL: the custom-branch check is live — it sees the label when planted', () => {
  // An absence check passes against an empty string or a slice that stopped
  // matching, so the predicate is proved against markup that DOES carry the link.
  const restored = `<Link href="/promotions">← ${BACK_TEXT}</Link>`;
  assert.equal(restored.includes(BACK_TEXT), true, 'the control string lost its label');
  assert.equal(/href="\/promotions"/.test(restored), true, 'the control string lost its href');
  const { custom } = branches();
  assert.notEqual(custom, restored, 'the real branch IS the control string');
  assert.ok(custom.length > 40, 'the custom slice is too short to be a real branch');
});
