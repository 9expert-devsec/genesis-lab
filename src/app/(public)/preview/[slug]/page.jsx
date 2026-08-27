import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPageBuilderPageBySlugAny } from '@/lib/actions/pageBuilder';
import { PageBuilderView } from '@/components/pageBuilder/PageBuilderView';
import { previewCookieName, verifyPreviewCookie } from '@/lib/pageBuilder/previewSession';
import { composeWorkingView, hasUnpublishedDraft, stripDraft } from '@/lib/pageBuilder/draftState';
import { PreviewGate } from './_components/PreviewGate';
// ADDED beside the statements above rather than folded into them — the standing
// rule in this repo.
import {
  resolvePreviewMode, previewBanner, hasPublishedVersion, versionRowMatchesLive,
} from '@/lib/pageBuilder/previewMode';
import { versionName } from '@/lib/pageBuilder/versionLabel';
import { getPublishedVersionMeta } from '@/lib/pages/publishedVersion';

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
function PreviewBanner({ mode, pending }) {
  return (
    <div
      data-testid="preview-banner"
      className="sticky top-0 z-[9999] border-b border-9e-lime bg-9e-lime px-4 py-2 text-center text-sm font-bold text-9e-navy"
    >
      {previewBanner({ mode, pending })}
    </div>
  );
}

/**
 * Who published what is on screen, and when. Published mode only.
 *
 * Rendered OUTSIDE PageBuilderView for the banner's reason: no section's scoped
 * customCss can target it (every scoped selector is prefixed with #<sectionId>
 * and this is not a descendant of any section) and customHtml cannot inject a
 * <style> to hide it (the shared sanitizer drops <style> entirely). A strip
 * that a page's own authored CSS could remove would be worse than no strip.
 *
 * EVERY FIELD OMITS ITSELF RATHER THAN PLACEHOLDING, which is round 35's rule
 * for an unnumbered version and round 26's for an actor that cannot be read.
 * On a database where round 35's backfill has not run, the number is absent and
 * this strip simply carries the date.
 */
function PublishedMeta({ versionLabel, publisher, publishedAt }) {
  const when = publishedAt ? new Date(publishedAt) : null;
  const stamp = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  if (!versionLabel && !stamp && !publisher) return null;
  return (
    <div
      data-testid="published-meta"
      className="border-b border-[var(--surface-border)] bg-[var(--surface)] px-4 py-1.5 text-center text-xs text-9e-slate-dp-50"
    >
      {versionLabel && <span data-testid="published-meta-version" className="font-bold text-9e-navy dark:text-white">{versionLabel}</span>}
      {versionLabel && stamp ? ' · ' : ''}
      {stamp && <span data-testid="published-meta-time">{`เผยแพร่เมื่อ ${stamp}`}</span>}
      {(versionLabel || stamp) && publisher ? ' · ' : ''}
      {publisher && <span data-testid="published-meta-publisher">{`โดย ${publisher}`}</span>}
    </div>
  );
}

export default async function PreviewPage({ params, searchParams }) {
  const { slug } = await params;
  // Resolved BEFORE the read purely so the value is in scope below; it gates
  // nothing and reaches nothing until every terminal check has passed.
  const mode = resolvePreviewMode(await searchParams);
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

  if (mode === 'published') {
    /**
     * ── THE PUBLISHED VERSION IS THE LIVE DOCUMENT, NOT THE NEWEST SNAPSHOT ──
     * The banner's claim is "ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้" — a statement
     * about what visitors are reading RIGHT NOW, which is by definition the live
     * document. A snapshot is a record of a past moment, and the two can drift:
     * updatePageIdentity (round 3) writes slug/pageType/promotionId live WITHOUT
     * publishing, so after a rename the newest snapshot carries the old
     * identity. Rendering it would make the banner's claim false about a page
     * the public is reading under a different one.
     *
     * The NUMBER comes from the live document too — publishedVersion, which
     * round 35 $inc-s inside the very same atomic write that sets the live
     * content. So the number and the content it names can never disagree, and
     * neither depends on the history collection still holding the row.
     *
     * The version ROW supplies only what the live document does not store:
     * who published, and when. (There is no publishedBy/publishedAt on the page
     * — round 33 measured updatedBy frozen at creation, and it is not used here
     * for that reason.)
     *
     * This read happens AFTER the three gates and the cookie check, never
     * before: an unauthenticated request must still cost nothing beyond the
     * page lookup, and must still contain nothing but the gate.
     */
    const meta = await getPublishedVersionMeta(page._id);
    if (!hasPublishedVersion({ publishedVersion: page.publishedVersion, hasVersionRow: Boolean(meta) })) {
      return <PreviewGate slug={slug} state="unpublished" />;
    }
    // A row whose number disagrees with the live counter belongs to an EARLIER
    // publish — its snapshot write was lost — so naming its actor would credit
    // the wrong person. Silence beats a confident wrong name.
    const trusted = meta && versionRowMatchesLive({
      publishedVersion: page.publishedVersion,
      rowVersionNumber: meta.versionNumber,
    });
    return (
      <>
        <PreviewBanner mode={mode} pending={pending} />
        <PublishedMeta
          versionLabel={versionName({ versionNumber: page.publishedVersion })}
          publisher={trusted ? meta.publisher : ''}
          publishedAt={trusted ? meta.publishedAt : null}
        />
        <PageBuilderView page={stripDraft(page)} />
      </>
    );
  }

  return (
    <>
      <PreviewBanner mode={mode} pending={pending} />
      <PageBuilderView page={composeWorkingView(page)} />
    </>
  );
}
