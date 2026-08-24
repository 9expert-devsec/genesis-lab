import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPageBuilderPageBySlugAny } from '@/lib/actions/pageBuilder';
import { PageBuilderView } from '@/components/pageBuilder/PageBuilderView';
import { previewCookieName, verifyPreviewCookie } from '@/lib/pageBuilder/previewSession';
import { composeWorkingView, hasUnpublishedDraft } from '@/lib/pageBuilder/draftState';
import { PreviewGate } from './_components/PreviewGate';

/**
 * /preview/[slug] — password-protected preview of a DRAFT builder page (§13).
 *
 * SECURITY
 *   - noindex + nofollow (below). We deliberately do NOT add a robots.txt
 *     Disallow: that would stop crawlers fetching the page and therefore stop
 *     them seeing this noindex, leaving a linked URL indexable as a bare link.
 *     noindex + crawlable is the stronger guarantee. The route is also
 *     structurally absent from sitemap.js (which enumerates a static list plus
 *     Article/CustomPage only — it has no route walker).
 *   - force-dynamic + revalidate 0: never cached, never shared between users.
 *   - The unauthenticated response contains ONLY the gate — the page doc is
 *     never passed to PreviewGate, so a draft cannot leak in the form response.
 *   - No password or token in the URL; the session is a signed, slug-scoped,
 *     HttpOnly cookie (see lib/pageBuilder/previewSession.js). Revoking or
 *     rotating the password invalidates outstanding cookies immediately,
 *     because the signature covers the password material.
 *   - Timing: the bcrypt compare + the lockout live in verifyPreviewPassword;
 *     this route only checks an HMAC, with a constant-time compare.
 *
 * RENDERING
 *   The draft renders through the SAME PageBuilderView → SectionRenderer as a
 *   published page. There is no second render path, so the CSS scoper and the
 *   HTML sanitizer cannot be bypassed here: an unpublished page is still
 *   untrusted content. It renders exactly what would publish (disabled and
 *   hidden sections stay skipped) — a preview of the page, not of the editor.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'ตัวอย่างหน้า (พรีวิว)',
  robots: { index: false, follow: false, nocache: true },
};

// Rendered OUTSIDE PageBuilderView, so no section's scoped customCss can
// target it (every scoped selector is prefixed with #<sectionId>, and this
// banner is not a descendant of any section), and customHtml cannot inject a
// <style> to hide it (the shared sanitizer drops <style> entirely).
function PreviewBanner({ pending }) {
  return (
    <div className="sticky top-0 z-[9999] border-b border-9e-lime bg-9e-lime px-4 py-2 text-center text-sm font-bold text-9e-navy">
      {pending
        ? 'ตัวอย่างหน้าฉบับร่าง (ยังไม่เผยแพร่) — ห้ามแชร์ลิงก์นี้ต่อ'
        : 'หน้านี้ไม่มีฉบับร่างที่รอเผยแพร่ — ตัวอย่างนี้ตรงกับหน้าที่เผยแพร่อยู่ในขณะนี้'}
    </div>
  );
}

export default async function PreviewPage({ params }) {
  const { slug } = await params;
  const page = await getPageBuilderPageBySlugAny(slug);
  if (!page) notFound();

  const pv = page.preview ?? {};
  const now = Date.now();

  // Terminal states first — no form, and no content either way.
  if (!pv.enabled || !pv.passwordHash) return <PreviewGate slug={slug} state="disabled" />;
  const expireAt = pv.expireDate ? new Date(pv.expireDate).getTime() : null;
  if (expireAt !== null && !Number.isNaN(expireAt) && expireAt < now) {
    return <PreviewGate slug={slug} state="expired" />;
  }

  const jar = await cookies();
  const cookie = jar.get(previewCookieName(slug))?.value;
  if (!cookie || !verifyPreviewCookie(cookie, slug, pv, now)) {
    return <PreviewGate slug={slug} state="locked" />;
  }

  // AFTER the three gates above, never before: the composed view is built
  // only once the cookie has been verified, so an unauthenticated response
  // still contains nothing but the gate.
  //
  // composeWorkingView is the SAME function the editor seeds its state from
  // (lib/pageBuilder/draftState.js), which is the whole point of this route:
  // it must show what an author is working on, not what is currently public.
  // Rendering the raw document made this page a duplicate of the live URL the
  // moment the draft/published split landed — it would have shown the
  // published content while the editor showed something else, under a banner
  // claiming it was the draft.
  const pending = hasUnpublishedDraft(page);
  return (
    <>
      <PreviewBanner pending={pending} />
      <PageBuilderView page={composeWorkingView(page)} />
    </>
  );
}
