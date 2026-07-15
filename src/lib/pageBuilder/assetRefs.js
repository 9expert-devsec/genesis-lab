import { slotsOf } from './containerSlots';

/**
 * The PURE reference-collection walk for the Cloudinary GC (item 5b, Parts 2+3).
 *
 * Mirrors the resolveSectionRefs.js split: this module is the pure walk (a
 * section tree → the set of Cloudinary asset references), with NO DB and NO
 * Cloudinary I/O — that lives in the thin outer script (scripts/cloudinary-gc-
 * dryrun.mjs). Split out so the collection rule is testable without a network or
 * a Mongo, which is the whole point: the reference set must be PROVEN complete
 * against real data before any delete is ever wired.
 *
 * ── Why this counts `src`, not just `publicId` (the load-bearing rule) ────────
 * Part 1 (reidSection.js #3) strips `content.publicId` on a duplicated / section-
 * copied image but KEEPS `content.src` — so a reference count reading only
 * `publicId` would see the copy's live image as referenced by nothing and mark it
 * an orphan; the eventual delete 404s a page that still renders, silently. So
 * every image ref is collected from BOTH fields.
 *
 * ── Why extraction FAILS LOUD, never silent (the hardening) ───────────────────
 * Turning a stored `src` URL into a `public_id` is the single assumption the
 * whole GC hangs on: folder scope, snapshot walk and grace period are all correct
 * only if a live asset's URL resolves to the SAME public_id the Admin API lists. A
 * *guessed* id on an unrecognised URL is the dangerous path — it matches no listed
 * asset, so the real asset it pointed at drops out of the reference set and a live
 * image looks like an orphan, with nothing telling anyone. So `classifyCloudinaryUrl`
 * NEVER guesses: a URL it does not fully understand is returned as `unparseable`
 * (surfaced in the report), and an unparseable ref is treated CONSERVATIVELY — it
 * pins (see `computeOrphans`): if we can't understand a reference, we assume it
 * could match anything and protect everything, never the reverse.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';
// Delivery types that address an OWNED, uploaded asset (one with a public_id in
// our account). `fetch`/social delivery types address remote images and are not
// our assets; a res.cloudinary.com URL carrying one is surfaced as unparseable
// rather than silently ignored (fail loud on the unexpected).
const OWNED_DELIVERY_TYPES = new Set(['upload', 'private', 'authenticated']);

/**
 * Classify a stored URL into exactly one verdict — NEVER a guess.
 *
 *   { kind: 'id', publicId }   — a KNOWN, understood pattern (below).
 *   { kind: 'unparseable', raw } — a res.cloudinary.com URL whose shape we do not
 *                                  fully understand. Surfaced, not guessed.
 *   { kind: 'external' }        — empty, non-URL, or a non-res.cloudinary.com host
 *                                  (e.g. a pasted external OG image). Not our asset.
 *
 * KNOWN patterns (→ 'id'), public_id = the path AFTER the version up to the
 * extension, FOLDERS KEPT (nested and base-folder-containing paths included):
 *   res.cloudinary.com/<cloud>/<rt>/<upload|private|authenticated>/v<digits>/<path…>/<name>.<ext>
 *     e.g. …/v1758785738/skills/icons/zsnmhvevmg6ovrvdq8f2.svg  → skills/icons/zsnmhvevmg6ovrvdq8f2
 *          …/v1778228610/9exp-genesis/atmosphere-photos/e4b….jpg → 9exp-genesis/atmosphere-photos/e4b…
 *          …/v1778832018/fb-logo_zzvc5o.png                      → fb-logo_zzvc5o
 *   res.cloudinary.com/<cloud>/<rt>/<upload|…>/<path…>/<name>.<ext>   (no version)
 *     — the SDK's secure_url ALWAYS carries a version; this covers a hand-stored
 *       URL. Accepted only when no segment carries a ',' (a transform marker).
 *
 * DECLARED unparseable (→ 'unparseable'), deliberately not parsed:
 *   - a transform segment BEFORE the version (…/upload/w_200,c_fill/v123/…). The
 *     repo has ZERO transformed stored URLs, so we do not parse a case we can't
 *     test against real data — a mis-stripped transform yields a wrong id, the
 *     exact silent drop this hardening removes. Parse it deliberately later, WITH
 *     real examples, if they ever appear.
 *   - an unrecognised delivery type (fetch/social) or any other shape.
 *
 * BOUNDARY (documented, not handled): a custom Cloudinary CNAME host lands in
 * 'external' and is ignored. The SDK secure_url always uses res.cloudinary.com,
 * so OWNED uploads never take a CNAME — but if the account switches to one, this
 * must be revisited before a delete trusts the diff.
 */
export function classifyCloudinaryUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return { kind: 'external' };
  let u;
  try { u = new URL(s); } catch { return { kind: 'external' }; }
  if (u.hostname !== CLOUDINARY_HOST) return { kind: 'external' };

  const segs = u.pathname.split('/').filter(Boolean);
  const dIdx = segs.findIndex((seg) => OWNED_DELIVERY_TYPES.has(seg));
  if (dIdx < 0) return { kind: 'unparseable', raw: s }; // cloudinary host, no owned delivery type
  const rest = segs.slice(dIdx + 1);
  if (!rest.length) return { kind: 'unparseable', raw: s };

  const vIdx = rest.findIndex((seg) => /^v\d+$/.test(seg));
  let idSegs;
  if (vIdx === 0) {
    idSegs = rest.slice(1);                              // clean versioned URL
  } else if (vIdx > 0) {
    return { kind: 'unparseable', raw: s };              // transform segment(s) before the version
  } else {
    if (rest.some((seg) => seg.includes(','))) return { kind: 'unparseable', raw: s }; // transform, no version
    idSegs = rest;                                       // no-version fallback
  }
  if (!idSegs.length) return { kind: 'unparseable', raw: s };
  const publicId = idSegs.join('/').replace(/\.[^/.]+$/, ''); // strip a single trailing extension, keep folders
  if (!publicId) return { kind: 'unparseable', raw: s };
  return { kind: 'id', publicId };
}

/**
 * A reference accumulator: resolved public_ids (`refs`) and the raw URLs we could
 * not parse (`unparseable`). Two sets so the report can print unparseable
 * separately and the diff can treat them conservatively.
 */
export function makeRefAcc() {
  return { refs: new Set(), unparseable: new Set() };
}

function addUrl(acc, url) {
  const r = classifyCloudinaryUrl(url);
  if (r.kind === 'id') acc.refs.add(r.publicId);
  else if (r.kind === 'unparseable') acc.unparseable.add(r.raw);
  // 'external' → not our asset; ignore, never surface.
}

/**
 * Walk a section tree (recursing containers via the shared `slotsOf`, never a
 * second hand-rolled walk) into `acc`. `content.publicId` is a stored public_id
 * (already canonical) → straight to refs; `content.src` is a URL → classified, so
 * a Part-1 stripped copy (src only) is still counted and a weird URL surfaces as
 * unparseable rather than dropping its asset. Returns the same acc. Pure.
 */
export function collectSectionAssetRefs(sections, acc = makeRefAcc()) {
  for (const s of Array.isArray(sections) ? sections : []) {
    if (!s || typeof s !== 'object') continue;
    const c = s.content ?? {};
    if (s.type === 'image') {
      if (c.publicId) acc.refs.add(String(c.publicId));
      addUrl(acc, c.src);
    }
    const slots = slotsOf(s.type);
    if (slots) for (const slot of slots) collectSectionAssetRefs(c[slot], acc);
  }
  return acc;
}

/**
 * Every asset reference reachable from one page document OR one snapshot's
 * `snapshot` (both the same full-page shape): its sections PLUS the page-level SEO
 * OG image (`seo.ogImage` URL and `seo.ogImagePublicId`). Returns the same acc. Pure.
 *
 * NOTE (uncounted, by decision — the report states these so it is not mistaken for
 * a completeness guarantee):
 *   - rich_text can hold a pasted <img> whose URL lives inside the Tiptap doc's
 *     HTML/JSON (status doc item 13). NOT extracted here — flagged in the report.
 *   - background:'image' has no source field yet (status doc item 11), so it pins
 *     nothing today; whoever adds that field must extend this walk.
 */
export function collectPageAssetRefs(page, acc = makeRefAcc()) {
  if (!page || typeof page !== 'object') return acc;
  collectSectionAssetRefs(page.sections, acc);
  const seo = page.seo ?? {};
  if (seo.ogImagePublicId) acc.refs.add(String(seo.ogImagePublicId));
  addUrl(acc, seo.ogImage);
  return acc;
}

/**
 * The conservative orphan diff: listed assets MINUS the reference set — but an
 * unparseable ref could point at ANY listed asset (we can't know which), so if
 * ANY exist, NOTHING is safely an orphan. Protect everything; never orphan an
 * asset because we failed to parse a URL. The report shows the raw candidates
 * separately (for inspection) but this is the only set a delete could ever trust.
 * Pure.
 */
export function computeOrphans(listedPublicIds, acc) {
  const ids = Array.isArray(listedPublicIds) ? listedPublicIds : [];
  if (acc?.unparseable?.size > 0) return [];
  const refs = acc?.refs ?? new Set();
  return ids.filter((id) => !refs.has(id));
}
