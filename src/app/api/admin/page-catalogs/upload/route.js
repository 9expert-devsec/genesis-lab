import { handleUpload } from '@vercel/blob/client';

import { requireAdmin } from '@/lib/actions/auth';
import { runPageCatalogMintFlow } from '@/lib/pageCatalogUploadFlow.mjs';
import { burnPageCatalogReceipt, readPageCatalogReceipt } from '@/lib/pageCatalogReceiptStore';
import {
  PAGE_CATALOG_CONTENT_TYPE,
  PAGE_CATALOG_MAX_BYTES,
} from '@/lib/pageCatalogPaths.mjs';

/**
 * Client-upload token issuer for PAGE CATALOGS (program / skill catalogPdf).
 *
 * The webroot route (/api/admin/webroot-documents/upload) with the catalog's
 * own guard and its own receipts — kept a SEPARATE route so each kind's checks
 * stay separate and explicit:
 *
 *   · guard: requireAdmin('page_configs') — the guard the three page-catalog
 *     actions use. NOT the media permission.
 *   · the client sends a RECEIPT, not a name: the route burns it, re-derives
 *     `page-catalogs/<kind>-<key>-catalog.pdf` from the receipt and refuses
 *     unless the pathname handleUpload hands us is identical. A valid receipt
 *     for one page cannot authorise an overwrite of another.
 *   · 64 MB, PDF only, no random suffix, overwrite allowed — the same token
 *     options and cache max-age as the webroot route.
 *
 * It does not record or audit: preparePageCatalogUpload wrote the audit row,
 * and recordPageCatalogUpload writes the record after re-checking everything.
 * onUploadCompleted stays empty because it never reaches localhost.
 */

export const runtime = 'nodejs';

export async function POST(request) {
  // FIRST statement. requireAdmin throws an Error carrying status 401/403;
  // answering with that status (rather than letting it surface as a 500) is
  // the only change from the webroot route's shape.
  let session;
  try {
    session = await requireAdmin('page_configs');
  } catch (err) {
    const status = err?.status === 403 ? 403 : 401;
    return Response.json({ error: status === 403 ? 'forbidden' : 'unauthenticated' }, { status });
  }

  const body = await request.json();

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const result = await runPageCatalogMintFlow({ pathname, clientPayload, now: Date.now() }, {
          burn: burnPageCatalogReceipt,
          diagnose: readPageCatalogReceipt,
          // REFUSALS ONLY — a refused mint is a page bug or a hand-made call.
          log: async (entry) => {
            console.warn(
              '[page-catalog-upload] token refused:', entry.status, '—', entry.detail,
              `(pathname "${entry.pathname}")`,
            );
          },
          mint: async ({ file }) => ({
            allowedContentTypes: [PAGE_CATALOG_CONTENT_TYPE],
            maximumSizeInBytes: PAGE_CATALOG_MAX_BYTES,
            addRandomSuffix: false,
            // The public URL is on the config row and printed on pages; a
            // replacement must land at the same key.
            allowOverwrite: true,
            // Re-passed on every put: a PER-PUT option (same as webroot).
            cacheControlMaxAge: 60 * 60 * 24 * 30,
            tokenPayload: JSON.stringify({
              file,
              by: session.user?.name || session.user?.id || '',
            }),
          }),
        });
        if (!result.minted) throw new Error(`upload token refused: ${result.status}`);
        return result.token;
      },
      onUploadCompleted: async () => {},
    });

    return Response.json(json);
  } catch (err) {
    return Response.json({ error: err?.message ?? 'upload token refused' }, { status: 400 });
  }
}
