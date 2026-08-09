import { handleUpload } from '@vercel/blob/client';

import { requirePageAction } from '@/lib/rbac/guard';
import {
  WEBROOT_CONTENT_TYPE,
  WEBROOT_MAX_BYTES,
  webrootUploadTarget,
} from '@/lib/webrootDocuments.mjs';

/**
 * Client-upload token issuer for the three site-root PDFs. REPLACE-ONLY.
 *
 * ══ WHY A CLIENT UPLOAD AND NOT A SERVER ONE ════════════════════════════════
 *
 * The catalog is 42.6 MiB. Routing that through a serverless function means
 * holding it in function memory and paying the request-body limit; the browser
 * can put it straight into the store instead. So this route never sees the
 * bytes — it issues a scoped token and is told, afterwards, what landed.
 *
 * ══ THE CLIENT SENDS A NAME. IT DOES NOT SEND A PATH. ═══════════════════════
 *
 * `handleUpload` hands us the pathname the CLIENT asked for, and that is
 * exactly the value that must not be trusted: it decides which object in the
 * store gets overwritten. So the flow is:
 *
 *   1. read the intended filename out of clientPayload
 *   2. DERIVE the pathname from it, through webrootUploadTarget(), which
 *      matches against a frozen list of three rather than sanitising a shape
 *   3. REFUSE unless the derived pathname and the requested one are identical
 *
 * Step 3 is not redundant with step 2. Deriving proves what we intended; the
 * comparison proves the token we are about to sign authorises that and nothing
 * else. A token minted for the wrong pathname is a token that overwrites the
 * wrong document, and it would be signed by us.
 *
 * ══ THE CEILING IS DELIBERATE, AND IT IS NOT THE MEDIA ONE ══════════════════
 *
 * legacyUploadPolicy's RAW_MAX_BYTES (10 MB) is CLOUDINARY's per-asset limit.
 * These three live on Blob precisely because they exceed it. Applying that cap
 * here would refuse the catalog this route exists to replace, so the limit is
 * WEBROOT_MAX_BYTES and the reason is written down in that module. Do not
 * "restore" the media cap for consistency.
 *
 * ══ WHAT THIS ROUTE DOES NOT DO ═════════════════════════════════════════════
 *
 * It does not archive, record or audit. Those happen in the server action that
 * drives it, because the archive copy must complete BEFORE the overwrite is
 * allowed to start — see the action. A token issued here is permission to
 * overwrite, and permission is only granted after the previous bytes are safe.
 */

export const runtime = 'nodejs';

export async function POST(request) {
  // FIRST statement. An unauthenticated caller must not reach token issuance.
  const session = await requirePageAction('media');

  const body = await request.json();

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let intended = null;
        try {
          intended = JSON.parse(String(clientPayload ?? '{}'))?.filename ?? null;
        } catch {
          throw new Error('clientPayload must be JSON carrying { filename }');
        }

        const target = webrootUploadTarget(intended);
        if (!target.ok) throw new Error(target.reason);

        // THE COMPARISON. The token is scoped to the pathname the client asked
        // for, so that pathname must equal the one we derived — not merely
        // resemble it.
        if (pathname !== target.blobPathname) {
          throw new Error(
            `pathname "${pathname}" does not match the derived target `
            + `"${target.blobPathname}" for ${target.filename}`,
          );
        }

        return {
          allowedContentTypes: [WEBROOT_CONTENT_TYPE],
          maximumSizeInBytes: WEBROOT_MAX_BYTES,
          addRandomSuffix: false,
          // The public URL is printed on things; a replacement must land at the
          // same key or every rewrite destination goes stale.
          allowOverwrite: true,
          // Re-passed on every put: cacheControlMaxAge is a PER-PUT option, so
          // an overwrite that omits it silently drops back to the default.
          cacheControlMaxAge: 60 * 60 * 24 * 30,
          tokenPayload: JSON.stringify({
            filename: target.filename,
            by: session.user?.name || session.user?.id || '',
          }),
        };
      },

      // Recording lives in the action, which knows the archive key. This hook
      // fires from Vercel's side and cannot be relied on in local development
      // (there is no public URL to call back to), so nothing load-bearing may
      // depend on it.
      onUploadCompleted: async () => {},
    });

    return Response.json(json);
  } catch (err) {
    return Response.json({ error: err?.message ?? 'upload token refused' }, { status: 400 });
  }
}
