import { handleUpload } from '@vercel/blob/client';

import { requirePageAction } from '@/lib/rbac/guard';
import { runMintFlow } from '@/lib/webroot/receiptFlow.mjs';
import { burnWebrootReceipt, readWebrootReceipt } from '@/lib/webroot/receiptStore';
import {
  WEBROOT_CONTENT_TYPE,
  WEBROOT_MAX_BYTES,
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
 * ══ THE CLIENT SENDS A RECEIPT. IT DOES NOT SEND A NAME OR A PATH. ══════════
 *
 * `handleUpload` hands us the pathname the CLIENT asked for, and that is
 * exactly the value that must not be trusted: it decides which object in the
 * store gets overwritten. clientPayload is no better — it is the same request
 * body. So neither of them names the file.
 *
 * Instead the server action archives the previous bytes, verifies the copy, and
 * issues a single-use receipt. This route burns that receipt, reads the filename
 * OUT OF IT, re-derives the pathname through webrootUploadTarget(), and refuses
 * unless the derived pathname and the requested one are identical.
 *
 * The comparison is not redundant with the derivation. Deriving proves what we
 * intended; comparing proves the token we are about to sign authorises that and
 * nothing else. Without it a valid receipt for the company profile could be
 * replayed to authorise an overwrite of the catalog — and the token would be
 * signed by us.
 *
 * ══ WHY THE RECEIPT, AND NOT JUST THE FROZEN LIST ═══════════════════════════
 *
 * Deriving from the frozen three bounds the blast radius to those three, which
 * is not nothing. But R3's rule is that an overwrite cannot happen WITHOUT A
 * BACKUP, and the archive is taken by the action, not here. A caller who skipped
 * the action still got a token — an overwrite of a real document with no archive
 * behind it. Holding a receipt IS the proof the archive was made and verified.
 *
 * The decision lives in src/lib/webroot/receiptFlow.mjs with its dependencies
 * injected, so a test can assert the mint spy was never called. "It refuses" is
 * a claim about a message; a call count of zero is evidence no token exists.
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
        const result = await runMintFlow({ pathname, clientPayload, now: Date.now() }, {
          burn: burnWebrootReceipt,
          diagnose: readWebrootReceipt,

          // REFUSALS ONLY. A refused mint is either a bug in the admin page or
          // somebody calling this route by hand, and neither leaves a trace
          // anywhere else. A SUCCESSFUL mint is already covered twice over — the
          // prepare wrote an audit row, the completion writes a replacement
          // record — so logging it here would be a third copy of one fact.
          log: async (entry) => {
            console.warn(
              '[webroot-upload] token refused:', entry.status, '—', entry.detail,
              `(pathname "${entry.pathname}")`,
            );
          },

          mint: async ({ target }) => ({
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
          }),
        });

        // The refusal REASON is logged above, server-side. What goes back to the
        // caller is the short status and nothing more: the detail names which
        // receipts exist and when they expired, and a caller who is poking at
        // this route is precisely who must not be told that.
        if (!result.minted) throw new Error(`upload token refused: ${result.status}`);
        return result.token;
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
