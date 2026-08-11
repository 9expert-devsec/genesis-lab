// Inert stand-in for @/lib/actions/articles in the render tier.
//
// Same rationale as test/stub-nav-course-preview.mjs: the real module is a
// 'use server' file whose import chain reaches @/lib/rbac/guard → next-auth →
// next/headers, which does not resolve outside a Next runtime. So merely
// importing ArticlesAdminClient — a client component that imports these actions
// for its click handlers — would throw before a single assertion ran.
//
// Every export here is called from an onClick/useTransition handler, never
// during the server render the render tier exercises. Faithful behaviour is not
// needed; existing, being async, and reporting failure is. They return
// `{ ok: false }` rather than `{ ok: true }` deliberately: if a future render
// test somehow does reach one, an optimistic state update that quietly
// "succeeded" against a stub would be a false green, whereas a refusal is
// visible.
// This list must MIRROR the real module's exports. A stub that keeps offering a
// retired action is a fixture that lies: the component under test would import
// it happily, and the render tier would go on proving that a deleted code path
// works. test/fs/articlePinOrderWrites.test.mjs pins stub ⊆ real.
export async function deleteArticle()            { return { ok: false, error: 'stubbed' }; }
export async function toggleArticleActive()      { return { ok: false, error: 'stubbed' }; }
export async function toggleArticleFeaturedOnLanding() { return { ok: false, error: 'stubbed' }; }
export async function moveArticleOneStep()       { return { ok: false, error: 'stubbed' }; }
export async function moveArticleToBlockTop()    { return { ok: false, error: 'stubbed' }; }
export async function moveArticleToRank()        { return { ok: false, error: 'stubbed' }; }
export async function setArticlePinned()         { return { ok: false, error: 'stubbed' }; }
export async function setArticlePinBadge()       { return { ok: false, error: 'stubbed' }; }
export async function getArticles()              { return { items: [], total: 0, page: 1, limit: 0 }; }
export async function getArticleById()           { return null; }
export async function getArticlesByIds()         { return []; }
export async function searchArticles()           { return []; }
export async function createArticle()            { return { ok: false, error: 'stubbed' }; }
export async function updateArticle()            { return { ok: false, error: 'stubbed' }; }
export async function getFeaturedArticlesForLanding() { return []; }

/**
 * Added when test/fs/stubExportParity started asserting set equality against
 * the real module. LATENT gaps, not live ones: nothing in the render tier
 * imports these today, so nothing was failing — but the first component that
 * did would have failed to LINK, taking its whole file to zero tests.
 */
export async function listUsedArticleSkillIds() { return []; }
export async function getArticleBySlug()        { return null; }
export async function getPinCapacity()          { return null; }
