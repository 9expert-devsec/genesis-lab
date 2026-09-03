/**
 * Stub for `@/lib/actions/redirects` in the render tier.
 *
 * Same reason as the other action stubs: RedirectsAdminClient imports these for
 * its click handlers, the real module is `'use server'` and its import chain
 * reaches next-auth → next/headers and mongoose at import time.
 *
 * Throwing rather than resolving: no static render clicks anything, so none of
 * these is reached, and one that somehow was should fail loudly instead of
 * passing against a stub that agrees with everything.
 *
 * The BEHAVIOUR they stand in for is driven for real in
 * test/redirectsPanel.case.mjs, which mounts the component with a React root
 * and injects its own action functions — a static render cannot press a button.
 */
export async function listRedirectRules() {
  throw new Error('stub-redirect-actions: listRedirectRules must not be called in a render test');
}
export async function saveRedirectRule() {
  throw new Error('stub-redirect-actions: saveRedirectRule must not be called in a render test');
}
export async function deleteRedirectRule() {
  throw new Error('stub-redirect-actions: deleteRedirectRule must not be called in a render test');
}
export async function listNotFoundHits() {
  throw new Error('stub-redirect-actions: listNotFoundHits must not be called in a render test');
}
export async function createRuleFromHit() {
  throw new Error('stub-redirect-actions: createRuleFromHit must not be called in a render test');
}
export async function reopenNotFoundHit() {
  throw new Error('stub-redirect-actions: reopenNotFoundHit must not be called in a render test');
}
export async function checkPathIsLive() {
  throw new Error('stub-redirect-actions: checkPathIsLive must not be called in a render test');
}
