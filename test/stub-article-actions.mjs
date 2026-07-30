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
export async function applyArticlePositionPlan() { return { ok: false, error: 'stubbed' }; }
export async function deleteArticle()            { return { ok: false, error: 'stubbed' }; }
export async function toggleArticleActive()      { return { ok: false, error: 'stubbed' }; }
export async function toggleArticleFeaturedOnLanding() { return { ok: false, error: 'stubbed' }; }
export async function updateArticlePinOrder()    { return { ok: false, error: 'stubbed' }; }
export async function repositionArticle()        { return { ok: false, error: 'stubbed' }; }
export async function getArticles()              { return { items: [], total: 0, page: 1, limit: 0 }; }
export async function getArticleById()           { return null; }
export async function getArticlesByIds()         { return []; }
export async function searchArticles()           { return []; }
export async function createArticle()            { return { ok: false, error: 'stubbed' }; }
export async function updateArticle()            { return { ok: false, error: 'stubbed' }; }
export async function toggleArticlePinnedOnArticlePage() { return { ok: false, error: 'stubbed' }; }
export async function getFeaturedArticlesForLanding() { return []; }
