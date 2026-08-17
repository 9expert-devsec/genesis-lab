import { dbConnect } from '@/lib/db/connect';
import RootDocument from '@/models/RootDocument';
import { serveRootFile } from '@/lib/rootFileDelivery';

/**
 * Serve a file published at the SITE ROOT from the RootDocument registry.
 *
 * ══ NOTHING REACHES THIS ROUTE YET, AND THAT IS NOT A BUG ═══════════════════
 *
 * NO BYTE HAS EVER BEEN SERVED FROM A REAL REGISTRY ROW. There is no rewrite
 * rule pointing here (next.config.mjs is deliberately untouched), no publish
 * UI, and not one row in `root_documents`. The decision logic is proved
 * against injected fakes in test/pure/rootFileDelivery.test.mjs — which
 * establishes the ORDER and the REFUSALS and NOTHING about Blob answering a
 * real Range request for a real published file.
 *
 * The end-to-end proof needs a row; a row needs the publish UI; the UI is a
 * later round. So the first real byte gets served when a human clicks. It must
 * not be faked with a seed row, a temp row, or a row someone means to delete
 * afterwards — a registry that has been written to by a test is no longer
 * evidence about the registry.
 *
 * ══ SHAPE ═══════════════════════════════════════════════════════════════════
 *
 * Mirrors src/app/legacy-file/[...path]/route.js: this file is WIRING, and the
 * decision lives in an injectable module so it can be tested without writing to
 * Mongo. Streaming, Range forwarding and status passthrough all come from the
 * shared `proxyUpstream` — the same helper the legacy route uses, renamed off
 * `proxyFromCloudinary` precisely so a second storage backend could use it
 * rather than grow a second copy.
 *
 * ══ CACHING IS NOT SET HERE ═════════════════════════════════════════════════
 *
 * `no-store` for these paths comes from the `headers()` rule in next.config.mjs
 * keyed on NO_STORE_DOCUMENT_EXTENSIONS, matched by request path. See the
 * header of src/lib/rootFileDelivery.js for why a second claim here would be
 * worse than none.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DECLARED, never inherited. What Vercel's default maxDuration is on this plan
 * is NOT ESTABLISHED, and an unstated ceiling is one nobody can reason about
 * when a download starts timing out.
 *
 * ══ A LITERAL, AND NOT BY CHOICE — MEASURED ═════════════════════════════════
 *
 * Written first as `export const maxDuration = ROOT_FILE_MAX_DURATION_SECONDS`,
 * imported from src/lib/rootDocuments.mjs so the two could not drift. `npm run
 * build` REFUSED IT, exit 1:
 *
 *   ⨯ Next.js can't recognize the exported `config` field in route
 *     "/root-file/[...path]/route":
 *     Unknown identifier "ROOT_FILE_MAX_DURATION_SECONDS" at "maxDuration".
 *
 * Compilation itself succeeded; it is the route-segment-config validation that
 * rejects it. Next reads this field statically, before any module graph exists,
 * so it must be a literal.
 *
 * So the drift the import was meant to prevent is prevented by a test instead:
 * test/fs/rootFileRouteConfig.test.mjs asserts this literal equals
 * ROOT_FILE_MAX_DURATION_SECONDS. Do not "tidy" this back into an import — the
 * build will reject it again, and the reason is above.
 */
export const maxDuration = 30;

/** The registry read. Read-only: this route never writes a row. */
async function lookupPublished(pathKey) {
  await dbConnect();
  return RootDocument
    .findOne(
      { pathKey },
      { publicPath: 1, blobPathname: 1, contentType: 1, status: 1, bytes: 1 },
    )
    .lean();
}

async function handle(request, ctx, method) {
  const { path: segments } = await ctx.params;
  const requestPath = `/${(segments ?? []).join('/')}`;

  const { response } = await serveRootFile(request, { requestPath, method }, {
    lookup: lookupPublished,
    blobBase: process.env.BLOB_PUBLIC_BASE,
  });
  return response;
}

export async function GET(request, ctx) { return handle(request, ctx, 'GET'); }
export async function HEAD(request, ctx) { return handle(request, ctx, 'HEAD'); }
