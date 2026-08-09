/**
 * FULL-TREE BACKFILL — the uploader. Sources bytes from a LOCAL STAGING DIR.
 *
 *   node --env-file=.env.local scripts/backfill-upload-stage.mjs                  # plan, no writes
 *   node --env-file=.env.local scripts/backfill-upload-stage.mjs --pilot 50       # plan a mixed slice
 *   node --env-file=.env.local scripts/backfill-upload-stage.mjs --pilot 50 --apply
 *   node --env-file=.env.local scripts/backfill-upload-stage.mjs --apply          # the full stage
 *
 *   --staging <dir>   default D:/workspace/projects/backfill-staging/backfill-stage1
 *   --manifest <file> default optwww-tree.txt   (the byte-count authority)
 *
 * ══ WHY THIS IS A WRAPPER AND NOT A NEW MIGRATION ═══════════════════════════
 *
 * migrate-legacy-files.mjs owns the upload+record path and every ruling baked
 * into it. It cannot be used unchanged here for one reason: it downloads from
 * LEGACY_ORIGIN over HTTP, and this backfill's whole point is that the bytes
 * come off disk instead. Everything else is deliberately identical, most
 * importantly the record shape and this rule, which is the round-1 lesson:
 *
 *   A SIZE MISMATCH WINS OVER EVERY OTHER OUTCOME, including pre-existing.
 *
 * The first version of that script recorded 'exists' without comparing bytes, so
 * six GIFs sat marked done at the wrong size and every later run SKIPPED them —
 * the record healed itself into a lie no re-run could reach. So a mismatch is
 * 'failed' here too, and `isDone()` treats a size disagreement as NOT done so a
 * stale wrong row is self-correcting rather than permanent.
 *
 * ── WHY DISK, RESTATED, BECAUSE IT IS THE POINT ─────────────────────────────
 * Round-1 pulled over HTTP and the legacy origin rate-limited. A 429 body
 * written to Cloudinary is a corrupted asset whose size check then flags it
 * 'failed'. Disk has no rate limit — but it has its OWN failure mode, a
 * truncated FileZilla pull, which is why every staged file's size is checked
 * against the manifest BEFORE it is uploaded rather than after.
 *
 * ── public_id COMES FROM ONE PLACE ──────────────────────────────────────────
 * legacyPathToPublicId(), which now carries the reviewed `#`→`sharp` rule
 * alongside `&`→`and` and the trailing-space trim. That is what keeps
 * public_id === path so the deployed rewrite resolves with no lookup, and what
 * sets publicIdSubstituted for the lossy cases so they route via the resolver.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

import LegacyFileMigration from '../src/models/LegacyFileMigration.js';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '../src/lib/legacyPublicId.js';
import { IMAGE_EXTENSIONS, RAW_EXTENSION_LIST } from '../src/lib/legacyTransforms.mjs';
import { ALLOWED_UPLOAD_EXTENSIONS } from '../src/lib/legacyUploadPolicy.mjs';

// ── argv ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const APPLY = has('--apply');
const PILOT = valueOf('--pilot') ? Number(valueOf('--pilot')) : null;
const STAGING = path.resolve(valueOf('--staging', 'D:/workspace/projects/backfill-staging/backfill-stage1'));
const MANIFEST = path.resolve(process.cwd(), valueOf('--manifest', 'optwww-tree.txt'));

/** Cloudinary per-asset ceiling on this plan. Above it → the Blob track. */
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;
const CONCURRENCY = 4;
const MB = 1024 * 1024;
const mb = (n) => (n / MB).toFixed(2);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

/* ── SECURITY, RE-APPLIED AS DEFENCE IN DEPTH ───────────────────────────────
 *
 * The Phase-0 planner already filtered. This filters AGAIN, against the staging
 * directory rather than the manifest, because the two are different artefacts
 * and only this one is what actually gets read and uploaded. A file that
 * appeared in staging without being in the plan — a stray .htaccess dragged
 * along by a recursive FTP pull, an editor backup — must not be uploadable just
 * because the earlier filter ran somewhere else.
 *
 * ALLOW-LIST, never deny: a deny-list promises you thought of every dangerous
 * extension; an allow-list only promises you thought of the safe ones.
 */
/* IMPORTED, not restated. /admin/media signs browser uploads against the same
 * policy, and a browser that accepts an extension this sweep refuses is a hole in
 * the filter rather than a convenience. Verified identical (25 extensions, no
 * difference either way) before collapsing the two copies into one. */
const ALLOWED_EXTENSIONS = new Set(ALLOWED_UPLOAD_EXTENSIONS);

/**
 * Media: legitimate CONTENT, but the delivery layer has no rule for it.
 *
 * Kept separate from the security refusals on purpose. An .mp3 is not a
 * security problem and reporting it as one buries a routing decision inside a
 * list nobody re-reads. These are DEFERRED — they need `mp3` added to
 * RAW_EXTENSION_LIST (a delivery-layer change) before an upload could be
 * fetched, and all five are over the Cloudinary ceiling anyway.
 */
const MEDIA_EXTENSIONS = new Set(['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'webm', 'mov', 'avi']);

/* ── HUMAN RULINGS ON public_id COLLISIONS ──────────────────────────────────
 *
 * Keyed by the colliding public_id; the value names the file that WINS. This is
 * the only sanctioned way to resolve a collision the automatic rules cannot, and
 * it follows the SUPERSEDED table in migrate-legacy-files.mjs deliberately: a
 * ruling is a decision somebody made and signed, sitting in a diff a reviewer
 * reads, not a heuristic that quietly picks.
 *
 * The loser is NOT abandoned. It gets a row with status 'superseded' carrying
 * the WINNER's publicId and its sourcePath in `supersededBy` — the semantics the
 * model already defines for exactly this case — so a later reference rewrite can
 * point both URLs at the surviving asset and nothing 404s.
 *
 * WHY THIS ONE NEEDED A HUMAN: /images/9expert-banner exists as a 500x130 PNG
 * and an 800x209 JPEG. Rule A does not apply (neither is a webp derivative),
 * Rule B does not (1.55x apart, not 10x), and Rule C's premise fails outright —
 * it is written for DUPLICATES, and measured pixel dimensions say these are two
 * different renditions. Ruling: keep the JPEG, because it is the larger
 * rendition and the delivery layer caps at w_1600 so it serves both URLs at full
 * quality. The .png URL then serves the JPEG transcoded to PNG, which is the
 * same artwork at a higher source resolution.
 */
const COLLISION_RULINGS = new Map([
  /* ── CASE-FOLD GROUPS WHOSE MEMBERS ARE GENUINELY DIFFERENT CONTENT ──────
   *
   * Rules A/B/C cannot decide these: neither member is a derivative of the other
   * and the sizes are not an order of magnitude apart, so the tie-break has to be
   * WHICH CASE THE CONTENT ACTUALLY LINKS TO. That was measured against the
   * content collections, not guessed.
   */
  [
    '9exp-genesis/legacy/sites/default/files/articles/images/access',
    {
      keep: '/sites/default/files/articles/images/access.gif',
      note: 'Case-fold collision of two DIFFERENT files: access.gif (343,650 B, animated) '
          + 'and Access.png (221,595 B). Cloudinary folds public_id case, so one asset can '
          + 'hold only one of them. Grepped the content collections: access.gif IS referenced '
          + '(1 article), Access.png is referenced NOWHERE. Ruling: keep the referenced one. '
          + 'Access.png becomes superseded → access.gif, so a later rewrite can point any '
          + 'stray reference at the surviving asset.',
    },
  ],
  [
    '9exp-genesis/legacy/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-en.pdf',
    {
      keep: '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-en.pdf',
      note: 'Case-fold collision of two different PDFs: -en.pdf (481,331 B) and -EN.pdf '
          + '(316,005 B). NEITHER is referenced by any content collection, so there is no '
          + 'usage signal to follow. Ruling: keep the LARGER, which is also the one that '
          + 'survived the transfer (NTFS cannot hold both). -EN.pdf becomes superseded.',
    },
  ],
  [
    '9exp-genesis/legacy/sites/default/files/articles/images/artwork-01_0',
    {
      keep: '/sites/default/files/articles/images/artwork-01_0.png',
      note: 'Case-fold collision: artwork-01_0.png (136,933 B) vs Artwork-01_0.png (3,168 B), '
          + 'a 43x gap. Neither is referenced. Ruling follows Rule B — the 3 KB file is a '
          + 'placeholder, keep the real one. Artwork-01_0.png becomes superseded.',
    },
  ],
  [
    '9exp-genesis/legacy/sites/default/files/articles/images/artwork-02_0',
    {
      keep: '/sites/default/files/articles/images/artwork-02_0.png',
      note: 'Case-fold collision: artwork-02_0.png (33,214 B) vs Artwork-02_0.png (8,507 B). '
          + 'A 3.9x gap, so this is BELOW Rule B\'s 10x threshold and is a human ruling '
          + 'rather than an automatic one. Neither is referenced; keep the larger, consistent '
          + 'with artwork-01_0. Artwork-02_0.png becomes superseded.',
    },
  ],
  [
    '9exp-genesis/legacy/images/9expert-banner',
    {
      keep: '/images/9expert-banner.jpg',
      note: 'Two different renditions of one banner: 500x130 as .png, 800x209 as .jpg. '
          + 'Not a duplicate (so Rule C does not apply) and not a placeholder (so Rule B '
          + 'does not). Ruling: keep the 800x209 .jpg as the higher-resolution rendition; '
          + 'delivery caps at w_1600 so both URLs serve it at full quality.',
    },
  ],
]);

const extOf = (p) => {
  const last = p.slice(p.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1).toLowerCase();
};
const directoryOf = (p) => { const c = p.lastIndexOf('/'); return c <= 0 ? '/' : p.slice(0, c); };

/** Reason this path may not be uploaded, or null. */
function refuse(publicPath) {
  const name = publicPath.slice(publicPath.lastIndexOf('/') + 1);
  if (name.startsWith('.')) return 'dotfile';
  if (/\.(php|phtml|inc|module|install|sh|sql|ya?ml|twig|env|ini|conf|htaccess|htpasswd)$/i.test(name)) return 'code/config';
  if (/\.(gz|bz2|tar|db|sqlite|log|bak|swp)$/i.test(name)) return 'server state';
  const ext = extOf(publicPath);
  if (!ext) return 'no extension';
  if (MEDIA_EXTENSIONS.has(ext)) return null;   // deferred, not refused — see below
  if (!ALLOWED_EXTENSIONS.has(ext)) return `not allow-listed .${ext}`;
  return null;
}

/**
 * Pixel dimensions, so Rule C can tell a genuine DUPLICATE from two different
 * images that merely share a basename.
 *
 * This is the measurement Rule C's premise depends on. It says "comparable
 * sizes (real dupes) → keep the canonical one" — but comparable BYTE size is
 * weak evidence of sameness, and when both files' extensions already match their
 * own sniffed format the name-based tiebreak has nothing to discriminate on.
 * Measured on the two real ties: how-power-query-work.png/.jpg are both 600x849
 * (one image, exported twice — safe to collapse) while 9expert-banner is 500x130
 * as a PNG and 800x209 as a JPEG, which is not a duplicate at all and must not
 * be collapsed by a rule written for duplicates.
 */
function imageDims(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** image vs raw, from the sets the DELIVERY layer reads. Null = unroutable. */
function classify(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (RAW_EXTENSION_LIST.includes(ext)) return 'raw';
  return null;
}

/** jpg/jpeg and tif/tiff are one format under two names — see the migration. */
const FORMAT_ALIASES = new Map([['jpeg', 'jpg'], ['tif', 'tiff']]);
const canonicalFormat = (f) => FORMAT_ALIASES.get(String(f).toLowerCase()) ?? String(f).toLowerCase();
const formatsDisagree = (stored, pathExt) =>
  (!stored || !pathExt) ? false : canonicalFormat(stored) !== canonicalFormat(pathExt);

const encodePathSegments = (p) => p.split('/').map(encodeURIComponent).join('/');
function derivedUrlFor(cloud, publicId, resourceType, ext) {
  const base = `https://res.cloudinary.com/${cloud}/${resourceType}/upload/`;
  return resourceType === 'raw'
    ? base + encodePathSegments(publicId)
    : `${base + encodePathSegments(publicId)}.${ext}`;
}

/** Real format from the first bytes — Rule C needs content, not the name. */
function sniffFormat(buf) {
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF'
    && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (/^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 200).toString('utf8'))) return 'svg';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
  return '';
}

// ── WALK STAGING ────────────────────────────────────────────────────────────
if (!fs.existsSync(STAGING)) die(`staging dir not found: ${STAGING}`);
if (!fs.existsSync(MANIFEST)) die(`manifest not found: ${MANIFEST}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

const staged = walk(STAGING).map((full) => {
  // Staged path → public legacy path: strip the staging root, normalise \ to /.
  const rel = path.relative(STAGING, full).split(path.sep).join('/');
  return { full, publicPath: `/${rel}`, diskBytes: fs.statSync(full).size };
});

// ── MANIFEST BYTES: the authority a truncated pull is checked against ───────
const manifestBytes = new Map();
for (const line of fs.readFileSync(MANIFEST, 'utf8').split('\n')) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const size = Number(line.slice(0, tab));
  const p = line.slice(tab + 1);
  if (!p.startsWith('/opt/www')) continue;
  manifestBytes.set(p.slice('/opt/www'.length), size);
}

console.log('');
console.log('══ BACKFILL STAGE 1 → CLOUDINARY ══════════════════════════════════════');
console.log('');
console.log(`  mode      : ${APPLY ? '*** APPLY — WILL UPLOAD AND WRITE ***' : 'PLAN — no uploads, no writes'}`);
console.log(`  staging   : ${STAGING}`);
console.log(`  manifest  : ${path.relative(process.cwd(), MANIFEST)} (${manifestBytes.size} entries)`);
console.log(`  staged    : ${staged.length} files, ${mb(staged.reduce((a, f) => a + f.diskBytes, 0))} MB`);
console.log(`  prefix    : ${LEGACY_PUBLIC_ID_PREFIX}   ceiling ${mb(CLOUDINARY_MAX_BYTES)} MB   concurrency ${CONCURRENCY}`);
if (PILOT) console.log(`  pilot     : mixed slice of ${PILOT}`);
console.log('');

// ── CLASSIFY ────────────────────────────────────────────────────────────────
const refused = [];
const deferredBig = [];
const deferredUnroutable = [];
const byteMismatch = [];
const notInManifest = [];
let candidates = [];

for (const f of staged) {
  const reason = refuse(f.publicPath);
  if (reason) { refused.push({ ...f, reason }); continue; }

  const ext = extOf(f.publicPath);
  const resourceType = classify(ext);
  // Unroutable BEFORE size: an .mp3 the delivery layer cannot serve is deferred
  // as a routing decision, not as a Blob decision, even though it is also big.
  if (!resourceType || MEDIA_EXTENSIONS.has(ext)) { deferredUnroutable.push({ ...f, ext }); continue; }

  // TRUNCATED-PULL GUARD. The manifest is the authority; disk is the copy.
  const expected = manifestBytes.get(f.publicPath);
  if (expected == null) { notInManifest.push(f); continue; }
  if (expected !== f.diskBytes) { byteMismatch.push({ ...f, expected }); continue; }

  if (f.diskBytes > CLOUDINARY_MAX_BYTES) { deferredBig.push({ ...f, ext }); continue; }

  let info;
  try {
    info = legacyPathToPublicId(f.publicPath, resourceType, LEGACY_PUBLIC_ID_PREFIX);
  } catch (err) {
    refused.push({ ...f, reason: `public_id: ${err.message.slice(0, 80)}` });
    continue;
  }
  candidates.push({
    ...f, ext, resourceType,
    publicId: info.publicId,
    publicIdSubstituted: info.substituted,
    substitutionRule: info.rules,
  });
}

/* ── MONGO, READ EARLY — the collision grouping needs it ───────────────────
 *
 * Opened here rather than just before the upload loop, because a collision group
 * is NOT confined to the staged set. Measured on the Stage-2 resume: both
 * failures were a staged file colliding with an asset uploaded by an EARLIER run,
 * so grouping over `candidates` alone could not see either one and both reached
 * Cloudinary, where overwrite:false refused them and the size check recorded
 * 'failed'. The record protected the data; the grouping did not prevent the
 * attempt. Recorded rows are group members too.
 */
const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI not set — pass --env-file=.env.local');
await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB_NAME, maxPoolSize: 5, serverSelectionTimeoutMS: 10_000,
});

const priorDocs = await LegacyFileMigration
  .find({}, {
    sourcePath: 1, status: 1, uploadedBytes: 1, sourceBytes: 1, sizeExceptionReason: 1, publicId: 1,
  })
  .lean();
const prior = new Map(priorDocs.map((d) => [d.sourcePath, d]));

/* ── COLLISION RESOLUTION — the decided policy, applied, not re-asked ───────
 *
 * An IMAGE public_id drops the extension, so `X.png` and `X.webp` in one
 * directory map to one id. Whichever uploads second is refused by
 * overwrite:false, and the two legacy URLs then serve ONE file's bytes. That is
 * a wrong-content bug invisible from a 200, and upload ORDER decides which file
 * wins — which is why the loser is removed from the set here rather than left to
 * the race.
 *
 *   Rule A  a webp/avif sibling of a png/jpg/SVG source in the same group is a
 *           generated DERIVATIVE → exclude it. Measured on production: its URL
 *           already 200s with bytes identical to the source's render, because
 *           Cloudinary transcodes the stored id into the requested format. So
 *           excluding it changes nothing a client can observe, while uploading
 *           it risks making a lossy raster the canonical bytes for the source's
 *           URL. `svg` counts as a source because a raster beside a vector is
 *           the same relationship one step further: the vector is the original
 *           and scales, the raster is an export of it.
 *   Rule B  ≥10× size ratio → keep the LARGER (real), drop the smaller
 *           (placeholder/thumbnail).
 *   Rule C  comparable sizes → keep the CANONICAL name: no trailing space, and
 *           an extension that matches the file's ACTUAL sniffed format. Report
 *           the loser by name and bytes. Never overwrite.
 *
 * ── THE KEY IS THE CASE-FOLDED public_id ──────────────────────────────────
 *
 * CLOUDINARY FOLDS CASE when resolving a public_id. That is measured, not
 * assumed: `…/articles/images/Access.gif` and `…/articles/images/access.gif`
 * return the identical 343,614-byte asset, and requesting `/…/Access.png`
 * returns the webp transcode of `access.gif`. So `AI.svg` and `ai.webp` are ONE
 * asset as far as the store is concerned.
 *
 * Keying on the exact id therefore under-groups: it treated those as unrelated,
 * let both into the upload set, and the second one to arrive was refused. Folding
 * the key makes the grouping agree with the storage it is protecting. 8 groups /
 * 16 files across the deliverable tree are only visible this way.
 */
const foldKey = (publicId) => String(publicId).toLowerCase();

const groups = new Map();
for (const c of candidates) {
  const k = foldKey(c.publicId);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}

/* Already-RECORDED files join the group of their case-folded id, marked so they
 * are never uploaded again — they are present only so a staged file can be
 * recognised as colliding with them. A recorded row with no publicId (a
 * skipped-dead placeholder) carries no asset and is not a group member. */
for (const d of priorDocs) {
  if (!d.publicId) continue;
  if (prior.get(d.sourcePath) && candidates.some((c) => c.publicPath === d.sourcePath)) continue;
  const k = foldKey(d.publicId);
  if (!groups.has(k)) continue;           // only interested where a staged file collides
  groups.get(k).push({
    publicPath: d.sourcePath,
    publicId: d.publicId,
    diskBytes: d.uploadedBytes ?? d.sourceBytes ?? 0,
    ext: extOf(d.sourcePath),
    __recorded: d.status,
  });
}

const excluded = {
  derivativeSibling: [], smallerDuplicate: [], nonCanonical: [], unresolved: [],
  ruled: [], ownedByExisting: [],
};

for (const [publicId, group] of groups) {
  if (group.length < 2) continue;

  // A HUMAN RULING wins over every automatic rule, and is checked first so the
  // rules cannot quietly disagree with a decision already made. Keyed on the
  // case-folded id, so a ruling covers every case-variant of the same asset.
  const ruling = COLLISION_RULINGS.get(publicId);
  if (ruling) {
    const winner = group.find((f) => f.publicPath === ruling.keep);
    if (!winner) {
      die(`ruling for ${publicId} names ${ruling.keep}, which is not in the group `
        + `(${group.map((f) => f.publicPath).join(', ')}). Refusing to guess.`);
    }
    for (const f of group) {
      if (f === winner) continue;
      // A member that is only here because it is ALREADY RECORDED was never a
      // candidate, so there is nothing to exclude from the upload set.
      if (f.__recorded) continue;
      f.__excluded = true;
      excluded.ruled.push({
        ...f, publicId, keptPath: winner.publicPath, keptBytes: winner.diskBytes,
        keptRecorded: winner.__recorded ?? null, note: ruling.note,
      });
    }
    continue;
  }

  let survivors = [...group];

  // Rule A — derivative siblings. `svg` is a SOURCE here for the same reason
  // png/jpg are: a raster beside a vector is an export of it, and the vector is
  // the thing that scales. Measured need: skills/icon holds four AI.svg/ai.webp
  // style pairs that collide only once the key is case-folded.
  const hasSource = survivors.some((f) => ['png', 'jpg', 'jpeg', 'svg'].includes(f.ext));
  if (hasSource) {
    for (const f of survivors.filter((x) => ['webp', 'avif'].includes(x.ext))) {
      if (f.__recorded) continue;
      f.__excluded = true;
      excluded.derivativeSibling.push({
        ...f, publicId,
        keptPath: survivors.find((s) => ['png', 'jpg', 'jpeg', 'svg'].includes(s.ext))?.publicPath,
      });
    }
    survivors = survivors.filter((f) => !['webp', 'avif'].includes(f.ext));
  }

  /* ── AN ALREADY-STORED ASSET OWNS THE ID ─────────────────────────────────
   *
   * If a recorded row still survives Rule A, the store already holds an asset at
   * this case-folded id. Nothing staged can be uploaded into it: overwrite:false
   * would refuse and the size check would record 'failed' — which is precisely
   * the outcome the last run produced twice.
   *
   * So the staged members are excluded HERE, with a reason, instead of being
   * discovered at the API. Rules B and C then only ever see staged files, which
   * also matters mechanically: they read bytes off disk, and a recorded member
   * has no local file.
   */
  const owner = survivors.find((f) => f.__recorded && ['uploaded', 'exists'].includes(f.__recorded));
  if (owner) {
    for (const f of survivors.filter((x) => !x.__recorded)) {
      f.__excluded = true;
      excluded.ownedByExisting.push({
        ...f, publicId, keptPath: owner.publicPath, keptBytes: owner.diskBytes, keptRecorded: owner.__recorded,
      });
    }
    continue;
  }
  // Past this point every survivor is a staged file with a local path.
  survivors = survivors.filter((f) => !f.__recorded);
  if (survivors.length < 2) continue;

  // Rule B — an order-of-magnitude size gap means placeholder vs real.
  if (survivors.length > 1) {
    const biggest = survivors.reduce((a, b) => (b.diskBytes > a.diskBytes ? b : a));
    for (const f of survivors.filter((x) => x !== biggest && biggest.diskBytes >= x.diskBytes * 10)) {
      excluded.smallerDuplicate.push({ ...f, publicId, keptBytes: biggest.diskBytes, keptPath: biggest.publicPath });
    }
    survivors = survivors.filter((f) => f === biggest || biggest.diskBytes < f.diskBytes * 10);
  }

  // Rule C — comparable sizes: the canonical name wins.
  if (survivors.length > 1) {
    const scored = survivors.map((f) => {
      const buf = fs.readFileSync(f.full, { encoding: null }).subarray(0, 256);
      const sniffed = sniffFormat(buf);
      const name = f.publicPath.slice(f.publicPath.lastIndexOf('/') + 1);
      const base = name.slice(0, name.lastIndexOf('.'));
      let score = 0;
      if (!/\s$/.test(base)) score += 2;                                     // no trailing space
      if (sniffed && canonicalFormat(sniffed) === canonicalFormat(f.ext)) score += 4; // ext matches content
      if (f.ext !== 'webp' && f.ext !== 'avif') score += 1;                   // prefer a source format
      return { f, score, sniffed };
    }).sort((a, b) => b.score - a.score || b.f.diskBytes - a.f.diskBytes);

    if (scored[0].score === scored[1].score) {
      // The name-based tiebreak found nothing to discriminate on — both files'
      // extensions already match their own content. Fall through to the only
      // evidence that separates "one image exported twice" from "two different
      // images that share a basename": the pixel dimensions.
      const dims = scored.map((s) => imageDims(fs.readFileSync(s.f.full)));
      const allSame = dims.every((d) => d && dims[0] && d.w === dims[0].w && d.h === dims[0].h);
      if (allSame) {
        // One image, two exports. Rule C's premise holds; keep the largest
        // bytes (lossless source over a re-compression) and drop the rest. The
        // dropped URL still resolves — Cloudinary transcodes the kept id.
        const kept = scored.reduce((a, b) => (b.f.diskBytes > a.f.diskBytes ? b : a));
        for (const s of scored.filter((x) => x !== kept)) {
          excluded.nonCanonical.push({
            ...s.f, publicId, sniffed: s.sniffed, score: s.score,
            keptPath: kept.f.publicPath, keptBytes: kept.f.diskBytes,
            note: `identical ${dims[0].w}x${dims[0].h} — one image exported twice`,
          });
        }
        survivors = [kept.f];
      } else {
        // NOT a duplicate. Rule C was written for dupes and must not collapse
        // these — the whole group is held back and reported, because picking
        // arbitrarily is how the wrong image ends up canonical with nothing
        // recording that a choice was made.
        for (const [i, s] of scored.entries()) {
          excluded.unresolved.push({
            ...s.f, publicId, sniffed: s.sniffed, score: s.score,
            note: dims[i] ? `${dims[i].w}x${dims[i].h}` : 'dimensions unreadable',
          });
        }
        survivors = [];
      }
    } else {
      for (const s of scored.slice(1)) {
        excluded.nonCanonical.push({
          ...s.f, publicId, sniffed: s.sniffed, score: s.score,
          keptPath: scored[0].f.publicPath, keptBytes: scored[0].f.diskBytes,
        });
      }
      survivors = [scored[0].f];
    }
  }

  const keep = new Set(survivors);
  for (const f of group) if (!keep.has(f)) f.__excluded = true;
}
candidates = candidates.filter((c) => !c.__excluded);

// ── REPORT THE SET ──────────────────────────────────────────────────────────
const sum = (xs) => xs.reduce((a, x) => a + x.diskBytes, 0);
const byRoot = {};
for (const c of candidates) {
  const r = c.publicPath.slice(1, c.publicPath.indexOf('/', 1));
  byRoot[r] ??= { n: 0, b: 0 };
  byRoot[r].n += 1; byRoot[r].b += c.diskBytes;
}

console.log('── THE UPLOAD SET ──────────────────────────────────────────────────────');
console.log('');
for (const [r, v] of Object.entries(byRoot).sort((a, b) => b[1].b - a[1].b)) {
  console.log(`  /${r.padEnd(10)} ${String(v.n).padStart(5)} files  ${mb(v.b).padStart(9)} MB`);
}
console.log(`  ${'─'.repeat(44)}`);
console.log(`  ${'TOTAL'.padEnd(11)} ${String(candidates.length).padStart(5)} files  ${mb(sum(candidates)).padStart(9)} MB`);
console.log('');

const section = (title, xs, fmt) => {
  console.log(`  ${title}: ${xs.length}${xs.length ? ` (${mb(sum(xs))} MB)` : ''}`);
  for (const x of xs.slice(0, 40)) console.log(`     ${fmt(x)}`);
  if (xs.length > 40) console.log(`     … ${xs.length - 40} more`);
  console.log('');
};

console.log('── EXCLUSIONS ──────────────────────────────────────────────────────────');
console.log('');
section('Rule A — derivative webp/avif siblings (URL already resolves via transcode)',
  excluded.derivativeSibling, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}`);
section('Rule B — smaller duplicate, ≥10x gap (placeholder)',
  excluded.smallerDuplicate, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}\n        kept: ${x.keptPath} (${x.keptBytes} B)`);
section('Rule C — non-canonical name/extension (LOSER, not uploaded)',
  excluded.nonCanonical, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}  [sniffed ${x.sniffed || '?'}]\n        kept: ${x.keptPath} (${x.keptBytes} B)`);
section('CASE-FOLD / ID ALREADY OWNED by a stored asset (not uploaded)',
  excluded.ownedByExisting, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}\n        id owned by: ${x.keptPath} (${x.keptBytes} B, status '${x.keptRecorded}')`);
section('HUMAN RULING — loser, recorded as superseded (not uploaded)',
  excluded.ruled, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}\n        kept: ${x.keptPath} (${x.keptBytes} B${x.keptRecorded ? `, already '${x.keptRecorded}'` : ''})\n        ${x.note}`);
section('UNRESOLVED collision — held back, needs a human',
  excluded.unresolved, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}  [sniffed ${x.sniffed || '?'}, ${x.note ?? ''}]`);
section('refused by the security allow-list',
  refused, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}  — ${x.reason}`);
section('DEFERRED >10 MB → Blob track (Prompt C)',
  deferredBig, (x) => `${mb(x.diskBytes).padStart(8)} MB  ${x.publicPath}`);
section('DEFERRED unroutable extension → needs a delivery rule (Prompt C)',
  deferredUnroutable, (x) => `${mb(x.diskBytes).padStart(8)} MB  .${x.ext}  ${x.publicPath}`);
section('⚠ BYTE MISMATCH vs manifest — SKIPPED (truncated pull?)',
  byteMismatch, (x) => `disk ${String(x.diskBytes).padStart(9)} B  manifest ${String(x.expected).padStart(9)} B  ${x.publicPath}`);
section('not in the manifest — SKIPPED',
  notInManifest, (x) => `${String(x.diskBytes).padStart(9)} B  ${x.publicPath}`);

// ── RESUME STATE ────────────────────────────────────────────────────────────
// Mongo was already opened and `prior` already read, further up — the collision
// grouping needs recorded rows to see a staged file colliding with an asset an
// earlier run uploaded.

/** Identical definition to the migration's, including the byte check. */
const isDone = (d) => ['uploaded', 'exists'].includes(d?.status)
  && !(d.sourceBytes != null && d.uploadedBytes != null
       && d.sourceBytes !== d.uploadedBytes && !d.sizeExceptionReason);

const alreadyDone = candidates.filter((c) => {
  const d = prior.get(c.publicPath);
  return isDone(d) && d.sourceBytes === c.diskBytes;
});
const doneSet = new Set(alreadyDone);
let todo = candidates.filter((c) => !doneSet.has(c));

console.log('── RESUME STATE ────────────────────────────────────────────────────────');
console.log('');
console.log(`  collection rows            ${priorDocs.length}`);
console.log(`  already 'uploaded', bytes match → SKIP   ${alreadyDone.length}  ${mb(sum(alreadyDone))} MB`);
console.log(`  TO UPLOAD                                ${todo.length}  ${mb(sum(todo))} MB`);
console.log('');

/* ── PILOT: a deliberately MIXED slice ─────────────────────────────────────
 * The head of a sorted list is the easiest 50 files in the set — same
 * directory, ASCII names, one extension. A pilot has to front-load whatever
 * could break: the characters, the sizes and the types that are actually hard.
 */
function mixedSlice(all, n) {
  const picked = [];
  const seen = new Set();
  const take = (label, pred, k) => {
    let got = 0;
    for (const f of all) {
      if (got >= k) break;
      if (seen.has(f) || !pred(f)) continue;
      seen.add(f); picked.push({ ...f, why: label }); got += 1;
    }
  };
  take('thai', (f) => /[\u0e00-\u0e7f]/.test(f.publicPath), 6);
  take('parens', (f) => /\(/.test(f.publicPath), 4);
  take('at-sign', (f) => /@/.test(f.publicPath), 2);
  take('spaces', (f) => / /.test(f.publicPath), 4);
  // RESOLVER-ROUTED FIRST, and this ordering is the point of the whole slice.
  //
  // `publicIdSubstituted` covers three rules with two very different delivery
  // consequences: a trailing-space name is trimmed and then served STATICALLY
  // (Cloudinary trims a trailing space when resolving an id, so the derived URL
  // already hits the right asset), while `&` and `#` are LOSSY and must travel
  // through the /legacy-file resolver.
  //
  // Taking `publicIdSubstituted` generically filled all six slots with
  // trailing-space files \u2014 measured on this tree, where they sort first \u2014 so the
  // pilot exercised the resolver ZERO times while appearing to cover
  // "substituted". The resolver path carries the newest logic and the only
  // lossy, non-invertible mapping, so it gets its own take, first.
  // `#` gets its OWN take ahead of `&`: it is the newest reviewed substitution
  // (3f3c5f6) and the only one whose reachable spelling is percent-encoded,
  // because a literal `#` is the URL fragment delimiter and never reaches the
  // server. Folding it in with `&` filled every slot with ampersand files, which
  // sort first — so the case with the least evidence behind it got none.
  take('HASH → sharp (newest rule)', (f) => f.publicPath.includes('#'), 3);
  take('RESOLVER-routed (&)', (f) => f.publicPath.includes('&'), 4);
  take('trailing-space (static)', (f) => f.publicIdSubstituted, 3);
  take('pdf', (f) => f.ext === 'pdf', 5);
  take('near-ceiling', (f) => f.diskBytes > 8 * MB, 4);
  take('raw doc', (f) => f.resourceType === 'raw', 4);
  take('svg', (f) => f.ext === 'svg', 3);
  take('gif', (f) => f.ext === 'gif', 2);
  take('uppercase ext', (f) => /\.[A-Z]+$/.test(f.publicPath), 3);
  take('deep path', (f) => f.publicPath.split('/').length >= 5, 3);
  take('fill', () => true, n);
  return picked.slice(0, n);
}

if (PILOT) {
  todo = mixedSlice(todo, PILOT);
  console.log(`── PILOT SLICE (${todo.length}) ─────────────────────────────────────────────`);
  console.log('');
  for (const f of todo) {
    console.log(`  ${(f.why ?? '').padEnd(22)} ${mb(f.diskBytes).padStart(8)} MB  ${f.publicPath}`);
  }
  console.log('');
}

if (!APPLY) {
  console.log('══ PLAN ONLY. Nothing uploaded, nothing written. Re-run with --apply. ══');
  console.log('');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

// ── UPLOAD ──────────────────────────────────────────────────────────────────
for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  if (!process.env[k]) die(`${k} not set`);
}
const cloud = process.env.CLOUDINARY_CLOUD_NAME;
cloudinary.config({
  cloud_name: cloud,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function uploadBuffer(buf, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, res) => (err ? reject(err) : resolve(res)));
    stream.end(buf);
  });
}

/* ── RULED LOSERS THAT ARE NOT IN STAGING ──────────────────────────────────
 *
 * Three case-fold losers never reached the staging tree at all: NTFS cannot hold
 * two names differing only by case, so the tar extraction dropped whichever
 * arrived second. They therefore form no collision group here and no rule can
 * see them — but the DECISION about them still has to be recorded, for two
 * reasons. It documents why they were not migrated, and without a row a future
 * delta would list them again, pull them again, and fail them again at Cloudinary
 * against the id their case-variant already owns.
 *
 * Bytes come from the manifest, since there is no local file to measure.
 */
const ABSENT_RULED_LOSERS = [
  {
    loser: '/sites/default/files/articles/images/Artwork-01_0.png',
    winner: '/sites/default/files/articles/images/artwork-01_0.png',
    note: 'Case-fold collision, 43x size gap (3,168 B vs 136,933 B). Neither referenced. '
        + 'Rule B logic: the small one is a placeholder. Dropped by NTFS during extraction, '
        + 'so recorded from the manifest rather than uploaded.',
  },
  {
    loser: '/sites/default/files/articles/images/Artwork-02_0.png',
    winner: '/sites/default/files/articles/images/artwork-02_0.png',
    note: 'Case-fold collision, 3.9x gap (8,507 B vs 33,214 B) — BELOW Rule B\'s 10x '
        + 'threshold, so a human ruling: keep the larger, consistent with artwork-01_0. '
        + 'Neither referenced. Dropped by NTFS during extraction.',
  },
  {
    loser: '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-EN.pdf',
    winner: '/sites/default/files/course/outline/ai-agents-with-microsoft-copilot-studio-course-outline-en.pdf',
    note: 'Case-fold collision of two different PDFs (316,005 B vs 481,331 B). Neither '
        + 'referenced, so no usage signal; keep the larger. Dropped by NTFS during extraction.',
  },
];

if (APPLY) {
  for (const r of ABSENT_RULED_LOSERS) {
    const winnerRow = prior.get(r.winner);
    if (!winnerRow || !['uploaded', 'exists'].includes(winnerRow.status)) {
      console.log(`  ⚠ skipping absent-loser record for ${r.loser}: winner ${r.winner} is not stored yet`);
      continue;
    }
    const existing = prior.get(r.loser);
    if (existing?.status === 'superseded') continue;
    await LegacyFileMigration.updateOne(
      { sourcePath: r.loser },
      {
        $set: {
          publicId: winnerRow.publicId,      // the WINNER's id
          resourceType: extOf(r.loser) === 'pdf' ? 'raw' : 'image',
          pathExtension: extOf(r.loser),
          sourceBytes: manifestBytes.get(r.loser) ?? null,
          status: 'superseded',
          supersededBy: r.winner,
          note: r.note,
          refCount: 0,
          directory: directoryOf(r.loser),
          attemptedAt: new Date(),
        },
        $setOnInsert: { sourcePath: r.loser },
      },
      { upsert: true },
    );
    console.log(`  case-fold loser recorded: ${r.loser} → superseded by ${r.winner}`);
  }
  console.log('');
}

/* RULED LOSERS are recorded before anything uploads, using the model's existing
 * 'superseded' semantics: the row carries the WINNER's publicId and the winner's
 * path in `supersededBy`, so a later reference rewrite can point both URLs at
 * the surviving asset. Nothing is renamed or suffixed — the winner keeps
 * "public_id is the path". */
for (const loser of excluded.ruled) {
  await LegacyFileMigration.updateOne(
    { sourcePath: loser.publicPath },
    {
      $set: {
        publicId: loser.publicId,          // the WINNER's id
        resourceType: loser.resourceType,
        pathExtension: loser.ext,
        sourceBytes: loser.diskBytes,
        status: 'superseded',
        supersededBy: loser.keptPath,
        note: loser.note,
        refCount: 0,
        directory: directoryOf(loser.publicPath),
        attemptedAt: new Date(),
      },
      $setOnInsert: { sourcePath: loser.publicPath },
    },
    { upsert: true },
  );
  console.log(`  ruling recorded: ${loser.publicPath} → superseded by ${loser.keptPath}`);
}
if (excluded.ruled.length) console.log('');

/* ── A FILE WE HAVE DECIDED NOT TO UPLOAD MUST NOT STAY 'failed' ────────────
 *
 * An earlier run attempted two files that the collision policy now excludes, so
 * Cloudinary refused them and they were recorded 'failed'. That status means "a
 * retryable error happened", and re-running would keep retrying them forever
 * against an id another asset owns.
 *
 * Now that a rule has DECIDED about them, the honest status is 'superseded': the
 * model defines it as "the file is fine, but a human decided another file
 * replaces it", and it carries the winner's id so a later reference rewrite can
 * point any stray reference at the surviving asset. Rule A/B/C losers with no
 * prior row still get none — there is nothing to correct.
 */
const decidedLosers = [
  ...excluded.derivativeSibling.map((x) => ({ ...x, why: 'Rule A: raster/webp sibling of a source asset' })),
  ...excluded.smallerDuplicate.map((x) => ({ ...x, why: 'Rule B: smaller duplicate (placeholder)' })),
  ...excluded.nonCanonical.map((x) => ({ ...x, why: 'Rule C: non-canonical name/extension' })),
  ...excluded.ownedByExisting.map((x) => ({ ...x, why: 'case-fold: id already owned by a stored asset' })),
];
let corrected = 0;
for (const l of decidedLosers) {
  const row = prior.get(l.publicPath);
  if (row?.status !== 'failed') continue;
  const winnerRow = l.keptPath ? prior.get(l.keptPath) : null;
  await LegacyFileMigration.updateOne(
    { sourcePath: l.publicPath },
    {
      $set: {
        publicId: winnerRow?.publicId ?? l.publicId,
        status: 'superseded',
        supersededBy: l.keptPath ?? '',
        error: '',
        note: `${l.why}. Previously recorded 'failed' because an earlier run attempted the `
            + `upload before the collision policy could see the conflict: Cloudinary folds `
            + `public_id case and overwrite:false refused it. Not a retryable error — a decision.`,
        attemptedAt: new Date(),
      },
    },
  );
  corrected += 1;
  console.log(`  failed → superseded: ${l.publicPath}  (kept ${l.keptPath ?? '—'})`);
}
if (corrected) console.log('');

const runStartedAt = Date.now();
const stats = { uploaded: 0, failed: 0, exists: 0, bytes: 0 };
const failures = [];
let done = 0;
let next = 0;

const worker = async () => {
  for (;;) {
    const i = next; next += 1;
    if (i >= todo.length) return;
    const p = todo[i];
    let record;

    try {
      const buf = fs.readFileSync(p.full);
      // Re-check at read time. The stat happened during planning; a file can
      // change underneath a long run, and the bytes being uploaded are the only
      // ones whose size is worth asserting.
      if (buf.length !== p.diskBytes) throw new Error(`file changed during run: ${buf.length} B, planned ${p.diskBytes} B`);
      const expected = manifestBytes.get(p.publicPath);
      if (expected != null && buf.length !== expected) throw new Error(`SIZE vs manifest: disk ${buf.length} B, manifest ${expected} B`);

      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

      const res = await uploadBuffer(buf, {
        public_id: p.publicId,
        resource_type: p.resourceType,
        // NEVER use_filename. overwrite:false is the backstop that stops upload
        // ORDER from making a derivative canonical — see the collision policy.
        overwrite: false,
        unique_filename: false,
        invalidate: false,
      });

      const preExisting = res.created_at && new Date(res.created_at).getTime() < runStartedAt - 60_000;

      // Ruling 2, carried over verbatim: a GIF may come back SMALLER because
      // Cloudinary strips metadata. Verified on round-1 to be metadata only —
      // frame count, canvas and total delay identical. The tolerance stays
      // ONE-SIDED and format-scoped; anything else is a real mismatch.
      const exact = res.bytes === buf.length;
      const gifShrink = !exact && p.ext === 'gif' && res.bytes < buf.length;
      const sizeOk = exact || gifShrink;

      record = {
        publicId: res.public_id,
        publicIdSubstituted: p.publicIdSubstituted,
        // FLAT array of rule names. Rows written by round-1 hold a NESTED array
        // ([["ampersand-to-and"]]) because that run wrote through the raw
        // driver, which does no casting — so the documented query in the model
        // header matches zero of them. Writing through the model here casts to
        // the declared [String]; nothing is retro-fixed by this script.
        substitutionRule: [...p.substitutionRule],
        sizeExceptionReason: gifShrink
          ? `GIF metadata stripped on upload: ${buf.length} B → ${res.bytes} B (-${buf.length - res.bytes} B).`
          : '',
        storedFormat: res.format ?? '',
        pathExtension: p.ext,
        formatDisagrees: formatsDisagree(res.format, p.ext),
        resourceType: p.resourceType,
        format: res.format ?? p.ext,
        secureUrl: res.secure_url,
        derivedUrl: derivedUrlFor(cloud, p.publicId, p.resourceType, p.ext),
        sourceBytes: buf.length,
        uploadedBytes: res.bytes,
        sha256,
        etag: res.etag ?? '',
        // These files are in NO document — that is why the reference-driven
        // migration never saw them. 0 is the measured truth, not a default.
        refCount: 0,
        directory: directoryOf(p.publicPath),
        attemptedAt: new Date(),
        status: sizeOk ? (preExisting ? 'exists' : 'uploaded') : 'failed',
        error: !sizeOk
          ? `SIZE MISMATCH: source ${buf.length} B, Cloudinary reported ${res.bytes} B`
            + (preExisting ? ' (asset already existed; overwrite:false left it untouched)' : '')
          : (preExisting ? 'public_id already existed; overwrite:false left it untouched' : ''),
      };
      if (record.status === 'uploaded') { stats.uploaded += 1; stats.bytes += buf.length; }
      else if (record.status === 'exists') stats.exists += 1;
      else { stats.failed += 1; failures.push({ path: p.publicPath, error: record.error }); }
    } catch (err) {
      stats.failed += 1;
      const msg = (err?.message ?? String(err)).slice(0, 500);
      failures.push({ path: p.publicPath, error: msg });
      record = {
        publicId: p.publicId,
        publicIdSubstituted: p.publicIdSubstituted,
        substitutionRule: [...p.substitutionRule],
        resourceType: p.resourceType,
        derivedUrl: derivedUrlFor(cloud, p.publicId, p.resourceType, p.ext),
        sourceBytes: p.diskBytes,
        refCount: 0,
        directory: directoryOf(p.publicPath),
        attemptedAt: new Date(),
        status: 'failed',
        error: msg,
      };
    }

    await LegacyFileMigration.updateOne(
      { sourcePath: p.publicPath },
      { $set: record, $setOnInsert: { sourcePath: p.publicPath } },
      { upsert: true },
    );

    done += 1;
    if (done % 10 === 0 || done === todo.length) {
      const secs = (Date.now() - runStartedAt) / 1000;
      process.stdout.write(
        `\r  ${done}/${todo.length}  ok=${stats.uploaded} exists=${stats.exists} fail=${stats.failed}  `
        + `${mb(stats.bytes)} MB  ${secs.toFixed(0)}s   `,
      );
    }
  }
};

console.log('── UPLOADING ───────────────────────────────────────────────────────────');
console.log('');
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, worker));
console.log('');
console.log('');

const elapsed = (Date.now() - runStartedAt) / 1000;
console.log('══ SUMMARY ═════════════════════════════════════════════════════════════');
console.log('');
console.log(`  uploaded       : ${stats.uploaded}`);
console.log(`  already there  : ${stats.exists}`);
console.log(`  FAILED         : ${stats.failed}`);
console.log(`  skipped (done) : ${alreadyDone.length}`);
console.log(`  bytes copied   : ${mb(stats.bytes)} MB`);
console.log(`  elapsed        : ${elapsed.toFixed(0)}s`);
console.log('');
if (failures.length) {
  console.log(`  ${failures.length} failure(s) — re-running this script retries them:`);
  for (const f of failures.slice(0, 40)) console.log(`    ${f.path}\n      ${f.error}`);
  if (failures.length > 40) console.log(`    … ${failures.length - 40} more in legacy_file_migrations.`);
  console.log('');
}

await mongoose.disconnect().catch(() => {});
process.exit(failures.length ? 1 : 0);
