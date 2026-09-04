import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * The three public routes an Advanced HTML promotion touches, and the ONE gate
 * that is easy to get subtly right and catastrophically wrong.
 *
 * ── WHY SOURCE AND NOT RENDER ──────────────────────────────────────────────
 * All three are async RSCs that await the data layer before they branch, so
 * rendering them in this tier would mean stubbing every loader — and the stub,
 * not the route, would decide which branch runs. The DECISIONS these routes make
 * are tested for real as pure functions in test/pure/promotionMode
 * (promotionDetailTarget, the union sort) and as executed actions in
 * test/fs/customPageDraftActions. What is left, and what is asserted here, is
 * the WIRING: that the routes call those decisions rather than re-deriving them,
 * and that the gates sit where they must.
 *
 * Every claim below is paired with a control asserting the probe comes out the
 * other way on the shape it rejects.
 */

const CATCHALL = 'src/app/(public)/[...slug]/page.jsx';
const DETAIL = 'src/app/(public)/promotions/[slug]/page.jsx';
const GRID = 'src/app/(public)/promotions/page.jsx';
const LOADER = 'src/lib/promotions/getPromotions.js';
const SITEMAP = 'src/app/sitemap.js';

// ── 1. THE REDIRECT, AND THE PREVIEW GATE ON IT ─────────────────────────────

/**
 * THE CASE THIS FILE EXISTS FOR.
 *
 * The CustomPage preview IS the catch-all: an author previews an Advanced HTML
 * page by hitting the BARE SLUG with `?preview=<token>`. An ungated redirect
 * would carry that request to /promotions/<slug>, a route with no CustomPage
 * preview handling — so the preview of every promotion page would either 404 or,
 * worse, silently serve the PUBLISHED page while the author believed they were
 * looking at their pending edits.
 *
 * The builder does not have this problem: it previews on its own /preview/[slug]
 * and its redirect arm needs no such gate. So this is not a copy of that arm.
 */
test('the bare-slug redirect is GATED on !cp.isPreview', () => {
  const { code } = readSource(CATCHALL);
  // The gate and the redirect in ONE expression, so an ungated redirect cannot
  // satisfy this by having the two facts merely present in the file.
  assert.match(
    code,
    /if \(!cp\.isPreview && isPromotionPage\(customPage\)\) \{\s*permanentRedirect\(`\/promotions\/\$\{customPage\.slug\}`\);/,
    'the promotion redirect is missing, or is not gated on the preview flag — a tokened '
    + 'preview would be carried to a route that cannot render a CustomPage draft'
  );
});

test('CONTROL: the gate probe REJECTS the ungated shape', () => {
  const probe = /if \(!cp\.isPreview && isPromotionPage\(customPage\)\) \{\s*permanentRedirect\(`\/promotions\/\$\{customPage\.slug\}`\);/;
  // The exact shape this round could have shipped by mistake: same redirect,
  // same predicate, no preview gate. Not a formatting variant — a behaviour one.
  const ungated = 'if (isPromotionPage(customPage)) {\n  permanentRedirect(`/promotions/${customPage.slug}`);\n}';
  assert.equal(probe.test(ungated), false,
    'the probe accepts a redirect that fires on a preview request');
  // …and it DOES accept the gated shape, so it is not simply rejecting everything.
  const gated = 'if (!cp.isPreview && isPromotionPage(customPage)) {\n  permanentRedirect(`/promotions/${customPage.slug}`);\n}';
  assert.equal(probe.test(gated), true,
    'the probe rejects the shape it is supposed to require');
});

test('the reason for the gate travels with it, not only with this test', () => {
  // A gate whose reason lives only in a test file is a gate the next person
  // deletes while tidying, then discovers in production.
  const { raw } = readSource(CATCHALL);
  assert.match(raw, /THE CUSTOMPAGE PREVIEW \*IS\* THIS ROUTE/,
    'nothing at the redirect explains why it is gated on the preview flag');
});

test('the redirect sits INSIDE the resolved-page branch, after the builder arm', () => {
  /**
   * Ordering matters: it must not fire for a slug that resolves to a course, a
   * program or a builder page. Anchored on the two arms rather than on line
   * numbers.
   */
  const { code } = readSource(CATCHALL);
  const builderArm = code.indexOf('if (isPromotionPage(builderPage)) {');
  const customArm = code.indexOf('if (!cp.isPreview && isPromotionPage(customPage))');
  assert.notEqual(builderArm, -1, 'the builder redirect arm is gone — file restructured');
  assert.notEqual(customArm, -1, 'the custom redirect arm is gone — file restructured');
  assert.ok(customArm > builderArm,
    'the custom promotion redirect now runs before the builder resolver');
});

test('the bare-slug CANONICAL points at the promotion home, overriding an authored one', () => {
  const { code } = readSource(CATCHALL);
  assert.match(code, /isPromotionPage\(customPage\)\s*\?\s*`\$\{base\}\/promotions\/\$\{segment\}`\s*:\s*\(customPage\.canonicalUrl \|\| `\$\{base\}\/\$\{segment\}`\)/,
    'a promotion CustomPage still canonicalises to its bare slug, or an authored '
    + 'canonicalUrl still wins — either points search engines at a URL that 308s');
});

test('CONTROL: the canonical probe rejects the pre-change expression', () => {
  const probe = /isPromotionPage\(customPage\)\s*\?\s*`\$\{base\}\/promotions\/\$\{segment\}`/;
  const before = 'const canonical = customPage.canonicalUrl || `${base}/${segment}`;';
  assert.equal(probe.test(before), false, 'the probe passes on the pre-change shape');
});

// ── 2. THE DETAIL ROUTE ─────────────────────────────────────────────────────

test('the detail route DELEGATES precedence — it does not re-derive it', () => {
  /**
   * It used to inline `shouldRenderPromotionPage` in generateMetadata and again
   * in the render, with promotionDetailTarget exported, documented, tested and
   * called by nothing. Three sources would have made that three places to keep
   * in step.
   */
  const { code, withImports } = readSource(DETAIL);
  assert.match(withImports, /import \{ promotionDetailTarget \} from "@\/lib\/pages\/promotionMode"/,
    'the route does not import the shared precedence decision');
  assert.equal(countCallSites(code, 'promotionDetailTarget'), 2,
    'the precedence is decided a different number of times — it belongs once in '
    + 'generateMetadata and once in the render, and nowhere else');
  assert.equal(/shouldRenderPromotionPage\(/.test(code), false,
    'the route still inlines the visibility predicate, so the precedence lives in two places');
});

test('CONTROL: the delegation probe WOULD see an inlined predicate', () => {
  const planted = 'if (shouldRenderPromotionPage(builderPage)) { return null; }';
  assert.equal(/shouldRenderPromotionPage\(/.test(planted), true,
    'the probe cannot see an inlined predicate, so the assertion above is vacuous');
  assert.equal(countCallSites(planted, 'promotionDetailTarget'), 0);
});

test('the custom branch reads the PUBLISHED-only action and takes no second strip', () => {
  /**
   * getCustomPageBySlug filters status and strips inside the action — verdict
   * `stripped` in the CUSTOM_PAGE_READS register. A second stripDraft() here
   * would contradict that register; a call to the any-status reader would be a
   * draft on a public route.
   */
  const { code, withImports } = readSource(DETAIL);
  assert.match(withImports, /import \{ getCustomPageBySlug \} from "@\/lib\/actions\/customPages"/,
    'the detail route does not use the published-only CustomPage read');
  assert.equal(/getCustomPageBySlugAny/.test(code), false,
    'the detail route reads any-status CustomPages — that reader backs ?preview= and '
    + 'may carry an unpublished draft onto a public URL');
  assert.equal(countCallSites(code, 'stripDraft'), 2,
    'stripDraft is called a different number of times — it belongs on the two BUILDER '
    + 'reads only, because that reader is shared with the preview route');
});

test('CONTROL: the any-status probe fires on the reader it forbids', () => {
  const planted = 'const p = await getCustomPageBySlugAny(segment);';
  assert.equal(/getCustomPageBySlugAny/.test(planted), true,
    'the probe cannot see the forbidden reader even when it is plainly there');
});

test('the custom branch forces its canonical, ignoring the authored one', () => {
  const { code } = readSource(DETAIL);
  const at = code.indexOf('if (target === "custom")');
  assert.notEqual(at, -1, 'the custom metadata branch is gone');
  const branch = code.slice(at, at + 1400);
  assert.match(branch, /const canonical = `\$\{base\}\/promotions\/\$\{segment\}`/,
    'the custom branch does not force its canonical to the promotion home');
  assert.equal(/customPage\.canonicalUrl/.test(branch), false,
    'the custom branch honours an authored canonicalUrl — an author who typed one for '
    + 'the old bare-slug home would point search engines at a URL that now redirects');
});

// ── 3. THE GRID: ONE SORTED BLOCK, NOT TWO ──────────────────────────────────

test('the grid sorts the UNION of both collections in one call', () => {
  const { code } = readSource(GRID);
  assert.equal(countCallSites(code, 'selectVisiblePromotionPages'), 1,
    'the gate+sort runs a different number of times — two calls means two blocks, '
    + 'which is the shape the round rejects');
  assert.match(code, /const genesisPages = \[\s*\.\.\.builderPromotions\.map\([\s\S]{0,120}?'builder'[\s\S]{0,120}?\.\.\.customPromotions\.map\([\s\S]{0,120}?'custom'/,
    'the two loaders are not unioned before the sort');
  assert.match(code, /selectVisiblePromotionPages\(genesisPages\)\s*\.map\(\(p\) => promotionPageToCard\(p, p\.promotionSource\)\)/,
    'the union is not sorted-then-mapped with each page carrying its own source');
});

test('CONTROL: the one-call probe WOULD catch the two-block shape', () => {
  const planted = `
    const a = selectVisiblePromotionPages(builders).map((p) => promotionPageToCard(p, 'builder'));
    const b = selectVisiblePromotionPages(customs).map((p) => promotionPageToCard(p, 'custom'));
  `;
  assert.equal(countCallSites(planted, 'selectVisiblePromotionPages'), 2,
    'the counter cannot distinguish one call from two, so the assertion above proves nothing');
});

test('orderedPromotionCards still takes exactly two arguments — Genesis, then MSDB', () => {
  // The ruling: no third card block. MSDB follows the Genesis block; the two
  // scales are not reconciled and nothing here invents an ordering.
  const { code } = readSource(GRID);
  assert.match(code, /orderedPromotionCards\(\s*selectVisiblePromotionPages[\s\S]{0,200}?,\s*promotions\.map\(\(p\) => cardFromMsdb\(p, slugMap\)\),\s*\)/,
    'the grid no longer calls orderedPromotionCards with exactly the Genesis cards and '
    + 'the MSDB cards');
});

// ── 4. THE LOADER: SAFE BY PROJECTION ───────────────────────────────────────

test('the custom loader mirrors the builder one, and its projection excludes the draft', () => {
  const { code } = readSource(LOADER);
  const at = code.indexOf('export async function getActiveCustomPagePromotions');
  assert.notEqual(at, -1, 'the Advanced HTML grid loader is gone');
  const body = code.slice(at);
  assert.match(body, /pageType: 'promotion'/, 'the loader does not filter on promotion pages');
  assert.match(body, /status: 'published'/, 'the loader does not filter on published pages');
  assert.match(body, /selectVisiblePromotionPages\(docs\)/,
    'the loader does not run the SHARED gate — the two halves would be selected by '
    + 'two different rules');
  const select = body.match(/\.select\((['"])([^'"]*)\1\)/);
  assert.ok(select, 'the loader has no projection, so it ships whole documents including the draft');
  assert.equal(/\bdraft\b/.test(select[2]), false,
    `the loader's projection names the draft: ${select[2]}`);
  assert.match(select[2], /\bpromotionCover\b/,
    'the projection omits promotionCover, so every card would render the placeholder');
});

test('CONTROL: the projection probe would catch a widened select', () => {
  const widened = ".select('slug title draft')";
  const m = widened.match(/\.select\((['"])([^'"]*)\1\)/);
  assert.ok(m, 'the projection reader cannot parse a select it is meant to inspect');
  assert.equal(/\bdraft\b/.test(m[2]), true,
    'the draft detector does not fire on a projection that plainly names it');
});

// ── 5. THE SITEMAP ──────────────────────────────────────────────────────────

test('the sitemap excludes promotion pages BY FILTER, leaving the projection alone', () => {
  /**
   * A promotion page's bare slug 308s, so listing it publishes redirects to
   * crawlers. Excluded with a filter clause — NOT by widening the select, whose
   * two fields are the entire reason that read is safe without a stripDraft.
   */
  const { code } = readSource(SITEMAP);
  assert.match(code, /pageType: \{ \$ne: 'promotion' \}/,
    'the sitemap still lists promotion pages at their bare slugs, which now redirect');
  assert.match(code, /\.select\('slug updatedAt'\)/,
    'the sitemap projection changed — it is the only thing keeping the draft out of a '
    + 'public sitemap, and this round must not have widened it');
});

test('CONTROL: the sitemap probes are two DIFFERENT claims, and each can fail alone', () => {
  const filterOnly = "CustomPage.find({ pageType: { $ne: 'promotion' } }).select('slug updatedAt body')";
  assert.equal(/pageType: \{ \$ne: 'promotion' \}/.test(filterOnly), true);
  assert.equal(/\.select\('slug updatedAt'\)/.test(filterOnly), false,
    'the projection probe passes on a widened select, so it guards nothing');
});
