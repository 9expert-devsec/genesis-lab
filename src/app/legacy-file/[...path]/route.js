import { dbConnect } from '@/lib/db/connect';
import LegacyFileMigration from '@/models/LegacyFileMigration';
import {
  CLOUDINARY_BASE,
  RAW_EXTENSIONS,
  documentContentType,
  encodePath,
  extensionOf,
  proxyUpstream,
} from '@/lib/legacyDelivery';
// The transformation is NOT written here. It comes from the same module the
// rewrites read, so the resolver and the static path can never deliver the
// same image two different ways — which is exactly what happened while this
// file carried its own copy of `f_auto,q_auto`.
import { deliveryUrl, transformForExtension } from '@/lib/legacyTransforms.mjs';

/**
 * FALLBACK resolver for legacy files whose Cloudinary public_id is NOT their
 * path.
 *
 * ══ THIS IS A FALLBACK, NOT A FRONT DOOR. ══════════════════════════════════
 *
 * The static rewrite in next.config.mjs serves 1610 of the 1616 migrated
 * files, and it MUST keep doing so. Those requests never reach this file, never
 * open a database connection and never invoke a function: Vercel's edge proxies
 * them to Cloudinary and caches the result, which is the only reason a
 * 25-credit Cloudinary quota survives becoming the main site's asset host.
 *
 * If you are about to route more traffic through here — "it would be tidier to
 * resolve everything in one place" — that is the change that puts Mongo in the
 * hot path for every image on every article page, converts a cached edge hit
 * into a function invocation plus a database round trip plus a Cloudinary
 * fetch, and does it for 1600 files to serve 6. Do not.
 *
 * ── WHAT ACTUALLY REACHES THIS ─────────────────────────────────────────────
 * Six files whose name contains `&`. Cloudinary refuses `&` in a public_id, so
 * the migration substituted it with `and` — and that transformation is NOT
 * invertible: `Build and Manage` is an ordinary filename indistinguishable
 * from the substituted form of `Build & Manage`. A static rule therefore
 * cannot express the mapping, and re-deriving it at read time would be
 * guessing. Measured before this existed: the derived URL returned HTTP 400.
 *
 * Everything else the pattern "cannot" express turned out to work by
 * measurement and is deliberately NOT routed here:
 *   · the 6 trailing-whitespace files — Cloudinary trims the trailing space
 *     when resolving an id, so the derived URL already hits the right asset;
 *   · the 1 superseded file — its `.jpeg` path resolves to the surviving
 *     `.png` asset's id and Cloudinary transcodes it.
 *
 * ── HOW THE LOOKUP WORKS ───────────────────────────────────────────────────
 * By STORED SOURCE PATH against the indexed `publicIdSubstituted` flag. The
 * substitution is never recomputed here: the migration recorded what it
 * actually did, and that record is the only authority. Re-deriving would
 * reintroduce exactly the drift the single-implementation rule in
 * src/lib/legacyPublicId.js exists to prevent.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? 'ddva7xvdt';

async function handle(request, ctx, method) {
  const { path: segments } = await ctx.params;
  if (!segments?.length) return new Response('legacy-file: no path', { status: 400 });

  // Segments arrive decoded; the stored sourcePath is the decoded legacy path.
  const sourcePath = `/${segments.join('/')}`;

  let row;
  try {
    await dbConnect();
    row = await LegacyFileMigration
      .findOne(
        { sourcePath, publicIdSubstituted: true },
        { publicId: 1, resourceType: 1, format: 1, status: 1, sourcePath: 1 },
      )
      .lean();
  } catch (err) {
    // A database problem must not masquerade as a missing file: 404 would send
    // somebody hunting for an asset that is present and fine.
    return new Response(`legacy-file: lookup failed — ${err?.message ?? err}`, {
      status: 503,
      headers: { 'x-legacy-delivery': 'resolver-db-error' },
    });
  }

  if (!row || !row.publicId) {
    return new Response(`legacy-file: no substituted record for ${sourcePath}`, {
      status: 404,
      headers: { 'x-legacy-delivery': 'resolver-miss' },
    });
  }

  const ext = extensionOf(sourcePath);
  const isRaw = row.resourceType === 'raw' || RAW_EXTENSIONS.has(ext);

  // Rebuild the delivery URL from the RECORD, never from the request path.
  // For an image the format suffix comes back on the end; for raw the stored
  // id already carries the extension.
  //
  // svg and gif are delivered untransformed here for the same reasons the
  // rewrite does it — transforming an SVG rasterises it, and a large animated
  // GIF exceeds Cloudinary's 50 Mpx frame cap and is refused outright. The
  // decision comes from the shared helper so this route and the static rewrite
  // cannot drift, which is exactly what happened when this file carried its own
  // copy of `f_auto,q_auto`.
  const transform = transformForExtension(ext);
  const upstream = isRaw
    ? `${CLOUDINARY_BASE(CLOUD)}/raw/upload/${encodePath(row.publicId)}`
    : deliveryUrl(
      CLOUDINARY_BASE(CLOUD),
      transform,
      `${encodePath(row.publicId)}.${row.format || ext}`,
    );

  return proxyUpstream(request, upstream, {
    fileName: sourcePath.slice(sourcePath.lastIndexOf('/') + 1),
    forceContentType: isRaw ? documentContentType(ext) : null,
    method,
    tag: 'resolver',
  });
}

export async function GET(request, ctx) { return handle(request, ctx, 'GET'); }
export async function HEAD(request, ctx) { return handle(request, ctx, 'HEAD'); }
