/**
 * Stub for `@/lib/actions/banners` in the render tier.
 *
 * BannerForm imports `createBanner`/`updateBanner` for its submit handler and
 * AdminBannerList imports `deleteBanner` for its row button. The real module is
 * `'use server'` and its import chain reaches next-auth → next/headers AND
 * mongoose, neither of which resolves outside a Next runtime — the same
 * reasoning as the article, registration and course action stubs already in the
 * loader.
 *
 * The render tests assert STRUCTURE: which controls each of the four banner
 * types puts in the DOM, and — the point of the slice — which ones it does not.
 * None of them submits, so nothing here is called; these exist so the module
 * graph resolves. Throwing rather than returning a benign value, matching the
 * other stubs: a render test that reaches a save is a test that has stopped
 * measuring what it claims to.
 *
 * The DOCUMENT a save would write is proven elsewhere and against the real
 * code, not against this file — `parseBannerFormData` and `bannerSchema` are
 * both pure and are called directly by test/pure/bannerFormPayload, and the
 * whole action is driven by the S6a round-trip probe with the model's write
 * methods replaced by loggers.
 *
 * Export set is EQUAL to the real module's, not a subset — see
 * test/fs/stubExportParity for why the extra direction is the one that matters.
 */

export async function getBanners() {
  throw new Error('stub-banner-actions: getBanners must not be called in a render test');
}
export async function getActiveBanners() {
  throw new Error('stub-banner-actions: getActiveBanners must not be called in a render test');
}
export async function buildBannerDocument() {
  throw new Error('stub-banner-actions: buildBannerDocument must not be called in a render test');
}
export async function createBanner() {
  throw new Error('stub-banner-actions: createBanner must not be called in a render test');
}
export async function updateBanner() {
  throw new Error('stub-banner-actions: updateBanner must not be called in a render test');
}
export async function deleteBanner() {
  throw new Error('stub-banner-actions: deleteBanner must not be called in a render test');
}
