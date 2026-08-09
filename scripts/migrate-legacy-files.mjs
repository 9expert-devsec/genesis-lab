/**
 * Legacy file mirror → Cloudinary — DRY RUN BY DEFAULT.
 *
 * Uploads NOTHING and writes NOTHING unless `--apply` is passed. Without it
 * this script reads the audit's source manifest, computes what it would do,
 * and prints.
 *
 * ── WHAT THIS PHASE DOES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
 * Does: copy in-scope legacy source files to Cloudinary under explicit,
 * deterministic public_ids, and record one row per file in
 * `legacy_file_migrations`.
 *
 * Does NOT: rewrite a single reference. Not `coverUrl`, not `articles.content`,
 * not any other field, not behind a flag. There is no `updateOne`,
 * `updateMany`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany` or
 * `$set` against any collection other than `legacy_file_migrations` anywhere in
 * this file. It also does not add the delivery rewrite to next.config.mjs and
 * does not delete anything from the legacy server.
 *
 * Copy and rewrite are separated because they fail differently. A failed copy
 * is invisible to users and re-runnable; a failed rewrite is a broken page. Do
 * the reversible half first, verify it, then decide about the other.
 *
 * ── WHY public_id IS SET EXPLICITLY, EVERY TIME ─────────────────────────────
 * `use_filename` appears NOWHERE in this script and must never be added. The
 * spike measured what it does to legacy filenames:
 *
 *   เอกสาร ทดสอบ (สำเนา).pdf  →  -_2_-_3_2.pdf
 *   ทดสอบ.pdf                 →  -.pdf   ┐ two different files,
 *   ตรวจสอบ.pdf               →  -.pdf   ┘ ONE public_id, silent overwrite
 *
 * An explicit public_id, by contrast, is stored verbatim — Thai, spaces and
 * parentheses included. So the public_id here IS the legacy path, which makes
 * the Cloudinary URL derivable by pattern and keeps delivery off the database.
 *
 * ── THE COLLISION THE PRE-FLIGHT EXISTS FOR ─────────────────────────────────
 * Images go up as `resource_type: image` so f_auto/q_auto are available at
 * delivery — bandwidth is 73.5% of this account's credit spend and serving
 * 474 MB of untransformed originals is the main cost risk in the project.
 *
 * The price of that choice: for images Cloudinary strips the extension from the
 * public_id and carries it as `format`. So `chart.png` and `chart.jpg` in one
 * directory both become `…/chart`, and the second upload would overwrite the
 * first — quietly, because both uploads "succeed".
 *
 * The pre-flight therefore runs FIRST and can ABORT the whole run. It does not
 * resolve a collision with a suffix or a hash: a rename chosen by a script
 * becomes a wrong URL forever, and there is no way to tell afterwards which
 * file a reference meant. It prints the filenames and stops.
 *
 * ── COST AND POLITENESS ─────────────────────────────────────────────────────
 * Downloads come from a production server that is being decommissioned, at the
 * same concurrency cap of 8 used by the audit. The 69 sources the audit
 * confirmed as 404 are skipped WITHOUT being probed again — they are recorded
 * as `skipped-dead` so the decision is visible rather than implicit.
 *
 * Cloudinary's Admin API on this plan allows 500 requests/hour, so this script
 * makes NO Admin API calls in the upload loop. Resumability comes from the
 * manifest collection, not from asking Cloudinary what exists.
 *
 * Usage:
 *   npm run migrate:legacy-files              # dry run — no uploads, no writes
 *   npm run migrate:legacy-files -- --apply   # uploads and writes the manifest
 *   … -- --limit 25                           # cap the plan, for a first pass
 *   … -- --manifest reports/legacy-urls/x.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

import LegacyFileMigration from '../src/models/LegacyFileMigration.js';
// THE public_id RULE LIVES THERE, NOT HERE. The delivery resolver imports the
// same module — see its header for why a second copy would be a latent bug.
import { legacyPathToPublicId, UNREVIEWED_INVALID_CHARS } from '../src/lib/legacyPublicId.js';

// ── configuration ───────────────────────────────────────────────────────────

/** Where the legacy files are fetched from. */
const LEGACY_ORIGIN = 'https://www.9experttraining.com';

/**
 * Every public_id is prefixed with this. Delivery derives the Cloudinary URL
 * by gluing this in front of the legacy path, so changing it after a run
 * invalidates every URL — treat it as permanent.
 */
const PREFIX = '9exp-genesis/legacy';

/** Same cap the audit used. The origin is being retired; do not raise it. */
const CONCURRENCY = 8;

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Characters Cloudinary rejects that this project has NOT reviewed a
 * substitution for. `&` is deliberately ABSENT — it now has a sanctioned rule
 * (`&`→`and`, src/lib/legacyPublicId.js) so it is substituted rather than
 * blocked. The rest stay here to fail loudly: none occurs in the live set, and
 * a silent transformation of a character nobody reviewed is exactly the bug
 * this list exists to prevent.
 *
 * Imported, not redeclared, so the blocker and the substituter cannot drift.
 */
const CLOUDINARY_INVALID_ID_CHARS = new Set(UNREVIEWED_INVALID_CHARS);

/** Cloudinary's documented public_id ceiling. */
const MAX_PUBLIC_ID_LENGTH = 255;

/** Uploaded as `image` — transformable at delivery. */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'avif', 'ico',
]);

/** Uploaded as `raw` — bytes through untouched. */
const RAW_EXTENSIONS = new Set([
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf', 'pbix',
]);

/**
 * HUMAN RULINGS. Files that exist and are fine, but are deliberately NOT
 * uploaded because another file supersedes them.
 *
 * This table is the ONLY sanctioned way to resolve a public_id collision, and
 * every entry is a decision somebody made and signed off — the script never
 * adds one, and never renames or suffixes a file to dodge a clash. That matters
 * because the whole delivery design rests on "the public_id IS the legacy
 * path"; a generated suffix would break that invariant for the renamed file and
 * leave no way to tell afterwards which file a reference meant.
 *
 * The superseded file's references are NOT abandoned: its row carries the
 * WINNER's public_id, so the later rewrite phase points both references at the
 * surviving asset and nothing 404s.
 */
const SUPERSEDED = new Map([
  [
    '/sites/default/files/articles/images/cloudflare-published-application-routes.jpeg',
    {
      by: '/sites/default/files/articles/images/cloudflare-published-application-routes.png',
      note: 'Duplicate embed of the same screenshot in article 6a2be2f0d53bf4d0cc094d6b '
          + '("คู่มือติดตั้ง n8n Self-Host ด้วย Docker และ Cloudflare Tunnel"). The .jpeg and .png sit '
          + '264 characters apart in the body with identical markup and the same alt text. '
          + 'Ruling: migrate the .png only; the rewrite phase points BOTH references at it.',
    },
  ],
]);

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
const rule = (n) => '-'.repeat(n);
const MB = 1024 * 1024;
const fmtBytes = (n) => (n >= MB ? `${(n / MB).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

// ── argv ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const APPLY = has('--apply');
const LIMIT = valueOf('--limit') ? Number(valueOf('--limit')) : null;
/** Front-load the hard cases instead of taking the head of the list. */
const MIXED = has('--mixed');

// ── plan construction ───────────────────────────────────────────────────────

const extensionOf = (p) => {
  const last = p.slice(p.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1);
};

const directoryOf = (p) => {
  const cut = p.lastIndexOf('/');
  return cut <= 0 ? '/' : p.slice(0, cut);
};

/** Percent-encode per segment; separators must survive. */
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/**
 * The public_id for a source path.
 *
 * image → the legacy path WITHOUT its extension (Cloudinary stores the
 *         extension as `format` and re-appends it in the delivery URL)
 * raw   → the legacy path verbatim, extension included
 *
 * Both keep the directory structure, so the id is the path and the path is
 * the id.
 */
function publicIdFor(sourcePath, resourceType) {
  return legacyPathToPublicId(sourcePath, resourceType, PREFIX).publicId;
}

/** Full result — id plus the substitution flag the manifest has to persist. */
function publicIdInfoFor(sourcePath, resourceType) {
  return legacyPathToPublicId(sourcePath, resourceType, PREFIX);
}

/** The URL delivery will construct from the legacy path, with no lookup. */
function derivedUrlFor(cloud, publicId, resourceType, ext) {
  const base = `https://res.cloudinary.com/${cloud}/${resourceType}/upload/`;
  return resourceType === 'raw'
    ? base + encodePath(publicId)
    : `${base + encodePath(publicId)}.${ext}`;
}

/**
 * Reverse the mapping. If this does not reproduce the source path exactly,
 * pattern-based delivery would request the wrong URL — so every planned file
 * is round-tripped before anything is uploaded.
 */
function legacyPathFromPublicId(publicId, resourceType, ext) {
  if (!publicId.startsWith(`${PREFIX}/`)) return null;
  const rest = publicId.slice(PREFIX.length + 1);
  return resourceType === 'raw' ? `/${rest}` : `/${rest}.${ext}`;
}

/**
 * Do the stored format and the path extension really disagree?
 *
 * jpg and jpeg are the SAME format under two names — Cloudinary always
 * reports  — so treating them as a disagreement would flag 27 perfectly
 * ordinary files and bury the 5 that matter.
 */
const FORMAT_ALIASES = new Map([['jpeg', 'jpg'], ['tif', 'tiff']]);
const canonicalFormat = (f) => FORMAT_ALIASES.get(String(f).toLowerCase()) ?? String(f).toLowerCase();
function formatsDisagree(storedFormat, pathExtension) {
  if (!storedFormat || !pathExtension) return false;
  return canonicalFormat(storedFormat) !== canonicalFormat(pathExtension);
}

function classify(sourcePath) {
  const ext = extensionOf(sourcePath).toLowerCase();
  if (!ext) return { resourceType: null, ext, reason: 'no extension' };
  if (IMAGE_EXTENSIONS.has(ext)) return { resourceType: 'image', ext };
  if (RAW_EXTENSIONS.has(ext)) return { resourceType: 'raw', ext };
  return { resourceType: null, ext, reason: `unmapped extension .${ext}` };
}

function loadManifest() {
  const explicit = valueOf('--manifest');
  const dir = path.resolve(process.cwd(), 'reports', 'legacy-urls');
  let file;
  if (explicit) {
    file = path.resolve(process.cwd(), explicit);
    if (!fs.existsSync(file)) die(`no such manifest: ${file}`);
  } else {
    if (!fs.existsSync(dir)) die('reports/legacy-urls/ does not exist — run `npm run audit:legacy-urls -- --check` first');
    const found = fs.readdirSync(dir).filter((f) => /^source-manifest-.*\.json$/.test(f)).sort();
    if (!found.length) die('no source-manifest-*.json — run `npm run audit:legacy-urls -- --check` first');
    file = path.join(dir, found[found.length - 1]);
  }
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!m.checked) {
    die(`${path.relative(process.cwd(), file)} was produced WITHOUT --check, so no source is known to be `
      + 'alive and none has a size. Re-run `npm run audit:legacy-urls -- --check`.');
  }
  return { file, manifest: m };
}

function buildPlan(manifest) {
  const inScope = manifest.sources.filter((s) => s.inScope);
  const dead = [];
  const plan = [];
  const unmapped = [];
  const superseded = [];

  for (const s of inScope) {
    const c = s.sourceCheck;
    // Confirmed 404 → recorded as a decision, never probed again.
    if (c && c.status !== null && !c.ok) { dead.push(s); continue; }

    // A human ruling — not uploaded, but recorded pointing at its replacement.
    const ruling = SUPERSEDED.get(s.sourcePath);
    if (ruling) {
      const w = classify(ruling.by);
      superseded.push({
        ...s,
        supersededBy: ruling.by,
        note: ruling.note,
        winnerPublicId: publicIdFor(ruling.by, w.resourceType),
        winnerResourceType: w.resourceType,
        winnerExt: w.ext,
      });
      continue;
    }

    const { resourceType, ext, reason } = classify(s.sourcePath);
    if (!resourceType) { unmapped.push({ ...s, reason }); continue; }

    const idInfo = publicIdInfoFor(s.sourcePath, resourceType);
    const publicId = idInfo.publicId;
    plan.push({
      sourcePath: s.sourcePath,
      directory: directoryOf(s.sourcePath),
      refCount: s.refCount,
      resourceType,
      ext,
      publicId,
      // Persisted onto the row and used by the pre-flight below. A substituted
      // id is NOT the path, so it is exempt from the round-trip identity check
      // and gets its own collision check instead.
      publicIdSubstituted: idInfo.substituted,
      substitutionRule: idInfo.rules ?? [],
      derivedUrl: derivedUrlFor(process.env.CLOUDINARY_CLOUD_NAME ?? 'CLOUD', publicId, resourceType, ext),
      sourceBytes: c?.contentLength != null && c.method === 'HEAD' ? Number(c.contentLength) : null,
      unreachableAtAudit: Boolean(c && c.status === null),
    });
  }
  return { plan, dead, unmapped, superseded };
}

/**
 * Deterministic slice that deliberately front-loads the HARD cases.
 *
 * A plain `--limit N` takes whatever the manifest happens to list first, which
 * on this data is a run of ordinary ASCII PNGs in one directory — it would
 * prove that easy files work and nothing else. The first pass has to exercise
 * the things that could actually break: Thai script, spaces, parentheses, an
 * uppercase extension, an SVG, a raw PDF, and the largest file in the set.
 *
 * Quotas are filled in order, deduplicated, and the remainder is an even spread
 * across everything else so the sample is not confined to one directory.
 */
function mixedSlice(plan, n) {
  const nameOf = (p) => p.sourcePath.slice(p.sourcePath.lastIndexOf('/') + 1);
  const bySizeDesc = [...plan].sort((a, b) => (b.sourceBytes ?? 0) - (a.sourceBytes ?? 0));

  const groups = [
    ['largest file', bySizeDesc.slice(0, 2)],
    ['thai script', plan.filter((p) => /[฀-๿]/.test(p.sourcePath)).slice(0, 6)],
    ['spaces', plan.filter((p) => nameOf(p).includes(' ')).slice(0, 5)],
    ['parentheses', plan.filter((p) => /[()]/.test(nameOf(p))).slice(0, 3)],
    ['uppercase ext', plan.filter((p) => /\.[A-Z]{2,5}$/.test(p.sourcePath)).slice(0, 3)],
    ['svg', plan.filter((p) => p.ext === 'svg').slice(0, 4)],
    ['raw pdf', plan.filter((p) => p.ext === 'pdf').slice(0, 3)],
    ['raw pbix', plan.filter((p) => p.ext === 'pbix').slice(0, 2)],
    ['raw xlsx', plan.filter((p) => p.ext === 'xlsx').slice(0, 2)],
    ['ampersand / @', plan.filter((p) => /[&@]/.test(nameOf(p))).slice(0, 2)],
  ];

  const picked = new Map();
  const why = new Map();
  for (const [label, files] of groups) {
    for (const f of files) {
      if (picked.size >= n) break;
      if (picked.has(f.sourcePath)) continue;
      picked.set(f.sourcePath, f);
      why.set(f.sourcePath, label);
    }
  }

  // Fill the rest with an even stride over what is left — not the head of the
  // list, so more than one directory is represented.
  const rest = plan.filter((p) => !picked.has(p.sourcePath));
  const need = n - picked.size;
  if (need > 0 && rest.length) {
    const stride = Math.max(1, Math.floor(rest.length / need));
    for (let i = 0; i < rest.length && picked.size < n; i += stride) {
      picked.set(rest[i].sourcePath, rest[i]);
      why.set(rest[i].sourcePath, 'spread');
    }
  }

  return { files: [...picked.values()], why, groups: groups.map(([l]) => l) };
}

// ── STEP 1: pre-flight ──────────────────────────────────────────────────────

/**
 * Returns `{ collisions, empties, caseDupes, tooLong, roundTripFailures }`.
 * A non-empty `collisions` aborts the run.
 */
function preflight(plan, unmapped) {
  const byId = new Map();
  for (const p of plan) {
    if (!byId.has(p.publicId)) byId.set(p.publicId, []);
    byId.get(p.publicId).push(p);
  }
  // Same resource type + same public_id = the second upload overwrites the
  // first. Different resource types live in different namespaces and cannot
  // collide, so they are not reported as one.
  const collisions = [...byId.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.reduce((acc, p) => {
      (acc[p.resourceType] ||= []).push(p);
      return acc;
    }, {}))
    .flatMap((byType) => Object.entries(byType).filter(([, g]) => g.length > 1).map(([rt, g]) => ({ resourceType: rt, files: g })));

  const empties = plan.filter((p) => {
    const tail = p.publicId.slice(PREFIX.length + 1);
    return !tail || !tail.trim();
  });

  // Not fatal, but worth knowing: some stacks and filesystems fold case, and
  // two ids differing only in case would be one file there.
  const byLower = new Map();
  for (const p of plan) {
    const k = `${p.resourceType}\u0000${p.publicId.toLowerCase()}`;
    if (!byLower.has(k)) byLower.set(k, []);
    byLower.get(k).push(p);
  }
  const caseDupes = [...byLower.values()]
    .filter((g) => g.length > 1 && new Set(g.map((p) => p.publicId)).size > 1);

  const tooLong = plan.filter((p) => p.publicId.length > MAX_PUBLIC_ID_LENGTH);

  // Characters Cloudinary refuses in a public_id. MEASURED, not assumed: the
  // first Stage 1 pass uploaded 48/50 and the two failures were both `&`, with
  // `public_id (…) is invalid` from the API. `@`, spaces, parentheses and Thai
  // all succeeded in the same batch, so the set below is deliberately narrow —
  // the documented invalid list, minus everything this data proved fine.
  //
  // These are EXCLUDED from the plan rather than aborting it: they need a
  // human ruling (the id cannot be the path for them, so the invariant breaks
  // either way), but holding 1600 working files hostage to 6 would be the
  // wrong trade. They are listed in full every run until someone decides.
  const invalidChars = plan
    .map((p) => ({ p, bad: [...new Set([...p.publicId].filter((ch) => CLOUDINARY_INVALID_ID_CHARS.has(ch)))] }))
    .filter(({ bad }) => bad.length > 0);

  // ── SUBSTITUTED-ID COLLISIONS ────────────────────────────────────────────
  // `&`→`and` could land a file on top of one that genuinely contains "and",
  // or on top of another substituted file. Either would be a silent overwrite,
  // so it is checked against the WHOLE plan — not just against the other
  // substituted files — and it is FATAL, exactly like the original collision.
  // A script must not resolve it.
  const substituted = plan.filter((p) => p.publicIdSubstituted);
  const byIdAll = new Map();
  for (const p of plan) {
    const k = `${p.resourceType} ${p.publicId}`;
    if (!byIdAll.has(k)) byIdAll.set(k, []);
    byIdAll.get(k).push(p);
  }
  const substitutionCollisions = substituted
    .map((p) => ({ p, group: byIdAll.get(`${p.resourceType} ${p.publicId}`) ?? [] }))
    .filter(({ group }) => group.length > 1);

  // Round-trip, with the extension compared CASE-INSENSITIVELY.
  //
  // Cloudinary lowercases `format`, so a source of `foo.PNG` produces a derived
  // URL of `foo.png`. That looked like a round-trip failure and is not one:
  // measured against this account, `.png`, `.PNG` and `.Png` all return 200
  // with identical bytes — the extension in a delivery URL is a FORMAT
  // REQUEST, not part of the identifier, and it is case-insensitive.
  //
  // The public_id itself is case-SENSITIVE and is still compared exactly, which
  // is what `caseDupes` above is about. Only the extension is folded.
  const splitExt = (p) => {
    const dot = p.lastIndexOf('.');
    return dot <= p.lastIndexOf('/') ? [p, ''] : [p.slice(0, dot), p.slice(dot + 1)];
  };
  // Substituted ids are EXEMPT: `&`→`and` is lossy by construction and cannot
  // be inverted, which is the whole reason the row carries a queryable flag.
  // Including them here would report six permanent "failures" every run and
  // train a reader to skim the section that exists to be read.
  const roundTrip = plan
    .filter((p) => !p.publicIdSubstituted)
    .map((p) => ({ p, back: legacyPathFromPublicId(p.publicId, p.resourceType, p.ext) }));
  const roundTripFailures = roundTrip.filter(({ p, back }) => {
    if (back === p.sourcePath) return false;
    const [aStem, aExt] = splitExt(p.sourcePath);
    const [bStem, bExt] = splitExt(back ?? '');
    return !(aStem === bStem && aExt.toLowerCase() === bExt.toLowerCase());
  });
  // Not failures — but the delivery URL will differ in case from the legacy
  // path, so anything doing an exact string comparison downstream should know.
  const caseFoldedExt = roundTrip.filter(({ p, back }) => back !== p.sourcePath
    && !roundTripFailures.some((f) => f.p === p));

  return { collisions, empties, caseDupes, tooLong, roundTripFailures, caseFoldedExt, unmapped, invalidChars, substituted, substitutionCollisions };
}

function printPreflight(pf) {
  console.log('── STEP 1. PRE-FLIGHT ──────────────────────────────────────────────────');
  console.log('');

  console.log(`  public_id collisions (SAME resource type)     : ${pf.collisions.length}`);
  console.log(`  empty / whitespace-only public_id             : ${pf.empties.length}`);
  console.log(`  extension not mapped to image or raw          : ${pf.unmapped.length}`);
  console.log(`  public_id over ${MAX_PUBLIC_ID_LENGTH} characters              : ${pf.tooLong.length}`);
  console.log(`  public_id has a character Cloudinary refuses  : ${pf.invalidChars.length}`);
  console.log(`  NON-IDENTITY ids (rules applied)              : ${pf.substituted.length}`);
  console.log(`  non-identity id collisions                    : ${pf.substitutionCollisions.length}`);
  console.log(`  round-trip failures (id → legacy path)        : ${pf.roundTripFailures.length}`);
  console.log(`  ids differing only by CASE (advisory)         : ${pf.caseDupes.length}`);
  console.log('');

  if (pf.collisions.length) {
    console.log('  ⚠ COLLISIONS — these files would overwrite each other. The run ABORTS.');
    console.log('    Not resolved automatically: a suffix or hash chosen by a script becomes');
    console.log('    a wrong URL forever, and afterwards nothing can tell which file a');
    console.log('    reference meant. Decide by hand, then re-run.');
    console.log('');
    for (const c of pf.collisions) {
      console.log(`    public_id : ${c.files[0].publicId}   (${c.resourceType})`);
      for (const f of c.files) {
        console.log(`      ← ${f.sourcePath}   ${f.sourceBytes != null ? fmtBytes(f.sourceBytes) : '(size unknown)'}, ${f.refCount} ref(s)`);
      }
      console.log('');
    }
  }

  if (pf.empties.length) {
    console.log('  ⚠ EMPTY public_id — cannot be uploaded:');
    for (const p of pf.empties) console.log(`    ${p.sourcePath}`);
    console.log('');
  }

  if (pf.unmapped.length) {
    console.log('  ⚠ UNMAPPED EXTENSION — EXCLUDED from the plan, not uploaded:');
    for (const u of pf.unmapped) console.log(`    ${u.sourcePath}   (${u.reason}, ${u.refCount} ref(s))`);
    console.log('');
    console.log('    Add the extension to IMAGE_EXTENSIONS or RAW_EXTENSIONS to include them.');
    console.log('');
  }

  if (pf.tooLong.length) {
    console.log(`  ⚠ public_id LONGER THAN ${MAX_PUBLIC_ID_LENGTH} — Cloudinary will refuse these:`);
    for (const p of pf.tooLong) console.log(`    ${p.publicId.length} chars  ${p.sourcePath}`);
    console.log('');
  }

  if (pf.roundTripFailures.length) {
    console.log('  ⚠ ROUND-TRIP FAILURES — the public_id does not map back to the legacy');
    console.log('    path, so pattern-based delivery would request the wrong URL:');
    for (const { p, back } of pf.roundTripFailures) {
      console.log(`    source : ${p.sourcePath}`);
      console.log(`    id     : ${p.publicId}`);
      console.log(`    back   : ${back}`);
    }
    console.log('');
  }

  if (pf.substituted.length) {
    console.log(`  NON-IDENTITY public_ids — ${pf.substituted.length} file(s). Internal spaces are never`);
    console.log('  touched by the ampersand rule; the trim rule removes only TRAILING whitespace.');
    console.log('  Each is flagged publicIdSubstituted:true with its rule list, so the resolver');
    console.log('  can find them by query rather than trying to invert a lossy rule.');
    console.log('');
    for (const p of pf.substituted) {
      console.log(`    ${p.sourcePath}`);
      console.log(`      → ${p.publicId}`);
    }
    console.log('');
  }

  if (pf.substitutionCollisions.length) {
    console.log('  ⚠ SUBSTITUTED ID COLLIDES — the run ABORTS. A substituted id landed on another');
    console.log('    file, so uploading would silently overwrite it. Not resolved here, same rule');
    console.log('    as every other collision: decide by hand.');
    console.log('');
    for (const { p, group } of pf.substitutionCollisions) {
      console.log(`    id: ${p.publicId}`);
      for (const g of group) console.log(`      ← ${g.sourcePath}${g.publicIdSubstituted ? '   (substituted)' : ''}`);
    }
    console.log('');
  }

  if (pf.invalidChars.length) {
    console.log(`  ⚠ INVALID public_id CHARACTER — ${pf.invalidChars.length} file(s) EXCLUDED from the plan.`);
    console.log('    Cloudinary refuses these ids outright. They need a ruling: the public_id');
    console.log('    CANNOT be the legacy path for them, so the invariant breaks either way and');
    console.log('    a script must not pick the replacement. Not aborting the whole run for 6.');
    console.log('');
    for (const { p, bad } of pf.invalidChars) {
      console.log(`    ${p.sourcePath}`);
      console.log(`      offending character(s): ${bad.map((c) => JSON.stringify(c)).join(' ')}   ${p.refCount} ref(s)`);
    }
    console.log('');
  }

  if (pf.caseFoldedExt.length) {
    console.log(`  NOTE — ${pf.caseFoldedExt.length} source(s) have an UPPERCASE extension. Cloudinary lowercases`);
    console.log('  `format`, so the delivery URL differs from the legacy path in the extension');
    console.log('  only. Measured on this account, .png / .PNG / .Png all return 200 with');
    console.log('  identical bytes — the extension is a format request, not an identifier — so');
    console.log('  this is NOT a delivery problem. It matters only to exact string comparisons.');
    console.log('');
    for (const { p, back } of pf.caseFoldedExt.slice(0, 12)) {
      console.log(`    ${p.sourcePath}`);
      console.log(`      delivered as …${back.slice(back.lastIndexOf('/'))}`);
    }
    if (pf.caseFoldedExt.length > 12) console.log(`    … ${pf.caseFoldedExt.length - 12} more.`);
    console.log('');
  }

  if (pf.caseDupes.length) {
    console.log('  NOTE — ids that differ only by letter case. Cloudinary keeps these apart,');
    console.log('  so they are NOT a collision here, but anything case-folding downstream');
    console.log('  would merge them:');
    for (const g of pf.caseDupes) {
      for (const p of g) console.log(`    ${p.publicId}`);
      console.log('');
    }
  }

  const fatal = pf.collisions.length > 0 || pf.substitutionCollisions.length > 0 || pf.empties.length > 0 || pf.tooLong.length > 0
    || pf.roundTripFailures.length > 0;
  if (!fatal) {
    console.log('  ✓ CLEAR — no collision, no empty id, every id round-trips to its legacy');
    console.log('    path, and every id is within the length limit.');
    console.log('');
  }
  return fatal;
}

// ── upload helpers (only reached under --apply) ─────────────────────────────

async function download(sourcePath) {
  const url = LEGACY_ORIGIN + encodePath(sourcePath);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': '9exp-legacy-file-mirror/1.0' },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('download returned 0 bytes');
  return buf;
}

function uploadBuffer(buf, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, res) => (err ? reject(err) : resolve(res)));
    stream.end(buf);
  });
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { file, manifest } = loadManifest();
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;

  console.log('');
  console.log('══ legacy file mirror → Cloudinary ═════════════════════════════════════');
  console.log(`   mode      : ${APPLY ? '*** APPLY — WILL UPLOAD AND WRITE ***' : 'DRY RUN — no uploads, no writes'}`);
  console.log(`   manifest  : ${path.relative(process.cwd(), file)}`);
  console.log(`   cloud     : ${cloud ?? '(CLOUDINARY_CLOUD_NAME not set)'}`);
  console.log(`   prefix    : ${PREFIX}`);
  console.log(`   origin    : ${LEGACY_ORIGIN}   concurrency ${CONCURRENCY}`);
  console.log('');
  console.log('   This phase copies files and records them. It rewrites NO document field.');
  console.log('');

  const { plan: fullPlan, dead, unmapped, superseded } = buildPlan(manifest);

  if (superseded.length) {
    console.log('── HUMAN RULINGS — superseded files, NOT uploaded ──────────────────────');
    console.log('');
    for (const s of superseded) {
      console.log(`  ${s.sourcePath}`);
      console.log(`    superseded by : ${s.supersededBy}`);
      console.log(`    recorded id   : ${s.winnerPublicId}`);
      console.log(`    ${s.note}`);
    }
    console.log('');
    console.log('  Nothing is renamed or suffixed. The row carries the WINNER\'s public_id so');
    console.log('  the rewrite phase can point both references at the surviving file.');
    console.log('');
  }

  // ── step 1 ───────────────────────────────────────────────────────────────
  const pf = preflight(fullPlan, unmapped);
  const fatal = printPreflight(pf);

  // A fatal pre-flight ALWAYS blocks --apply. In dry run it does not stop the
  // report: a dry run uploads nothing, so there is no risk to abort away from,
  // and the totals are exactly what a human needs in order to make the decision
  // the abort is asking them for. The blocked files are excluded from the plan
  // and counted separately rather than silently dropped.
  if (fatal && APPLY) {
    console.log('══ ABORTED by pre-flight. Nothing was uploaded and nothing was written. ══');
    console.log('');
    await mongoose.disconnect().catch(() => {});
    process.exit(2);
  }

  const blocked = new Set([
    ...pf.collisions.flatMap((c) => c.files.map((f) => f.sourcePath)),
    ...pf.substitutionCollisions.flatMap(({ group }) => group.map((g) => g.sourcePath)),
    ...pf.empties.map((p) => p.sourcePath),
    ...pf.tooLong.map((p) => p.sourcePath),
    ...pf.roundTripFailures.map(({ p }) => p.sourcePath),
    // Excluded but NOT fatal — see the pre-flight note.
    ...pf.invalidChars.map(({ p }) => p.sourcePath),
  ]);
  if (fatal) {
    console.log(`  ⚠ --apply WOULD ABORT. ${blocked.size} file(s) are excluded from the plan below so`);
    console.log('    the rest of the dry-run totals are still readable. Resolve those by hand,');
    console.log('    then re-run; nothing will upload until the pre-flight comes back clear.');
    console.log('');
  }

  const planned = fullPlan.filter((p) => !blocked.has(p.sourcePath));
  let plan = planned;
  let mixInfo = null;
  if (LIMIT) {
    if (MIXED) {
      mixInfo = mixedSlice(planned, LIMIT);
      plan = mixInfo.files;
    } else {
      plan = planned.slice(0, LIMIT);
    }
  }

  // ── resume state ─────────────────────────────────────────────────────────
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME, maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });

  // Read-only in dry run. `autoIndex:false` on the schema means merely touching
  // the model does not create an index, so a dry run leaves the database
  // byte-identical.
  const priorDocs = await LegacyFileMigration
    .find({}, { sourcePath: 1, status: 1, uploadedBytes: 1, sourceBytes: 1 })
    .lean();
  const prior = new Map(priorDocs.map((d) => [d.sourcePath, d]));

  /**
   * "Done" means recorded as present AND the right size.
   *
   * The byte check is part of the definition on purpose, not an extra: an
   * earlier version of this script wrote 'exists' without comparing sizes, so
   * six GIFs whose stored bytes differ from source were marked done and then
   * SKIPPED on every subsequent run — the record healed itself into a lie that
   * no re-run could reach. Treating a size mismatch as not-done makes a stale
   * wrong row self-correcting instead of permanent.
   */
  const isDone = (d) => ['uploaded', 'exists'].includes(d?.status)
    // A byte difference that was EXAMINED and accepted (ruling 2) carries a
    // reason; without one, a mismatch still means not-done.
    && !(d.sourceBytes != null && d.uploadedBytes != null
         && d.sourceBytes !== d.uploadedBytes && !d.sizeExceptionReason);

  const alreadyDone = plan.filter((p) => isDone(prior.get(p.sourcePath)));
  const todo = plan.filter((p) => !isDone(prior.get(p.sourcePath)));

  // ── plan report ──────────────────────────────────────────────────────────
  const byType = { image: plan.filter((p) => p.resourceType === 'image'), raw: plan.filter((p) => p.resourceType === 'raw') };
  const totalBytes = plan.reduce((n, p) => n + (p.sourceBytes ?? 0), 0);
  const todoBytes = todo.reduce((n, p) => n + (p.sourceBytes ?? 0), 0);

  console.log('── STEP 3. THE PLAN ────────────────────────────────────────────────────');
  console.log('');
  console.log(`  in-scope sources in manifest : ${manifest.sources.filter((s) => s.inScope).length}`);
  console.log(`  confirmed dead (skipped)     : ${dead.length}   ← recorded as skipped-dead, never re-probed`);
  console.log(`  unmapped extension (excluded): ${unmapped.length}`);
  console.log(`  superseded by ruling         : ${superseded.length}`);
  console.log(`  blocked by pre-flight        : ${blocked.size}`);
  console.log(`  PLANNED                      : ${planned.length}${LIMIT ? `  (--limit ${LIMIT} → ${plan.length})` : ''}`);
  console.log(`    as image : ${padL(byType.image.length, 5)}   ${fmtBytes(byType.image.reduce((n, p) => n + (p.sourceBytes ?? 0), 0))}`);
  console.log(`    as raw   : ${padL(byType.raw.length, 5)}   ${fmtBytes(byType.raw.reduce((n, p) => n + (p.sourceBytes ?? 0), 0))}`);
  console.log(`  total bytes                  : ${fmtBytes(totalBytes)}`);
  console.log('');
  console.log(`  already recorded as done     : ${alreadyDone.length}   (skipped on this run)`);
  console.log(`  TO UPLOAD                    : ${todo.length}   ${fmtBytes(todoBytes)}`);
  console.log('');

  if (mixInfo) {
    // A slice is only useful if it actually contains the hard cases. Printing
    // the composition means "the sample covered Thai and SVG" is something a
    // reader can check rather than take on trust.
    const counts = new Map();
    for (const p of plan) {
      const k = mixInfo.why.get(p.sourcePath) ?? 'spread';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    console.log('  MIXED SLICE COMPOSITION — hard cases first, then an even spread:');
    console.log('');
    for (const label of [...mixInfo.groups, 'spread']) {
      const n = counts.get(label) ?? 0;
      const example = plan.find((p) => mixInfo.why.get(p.sourcePath) === label);
      const flag = n === 0 && label !== 'spread' ? '  ⚠ NOT REPRESENTED' : '';
      console.log(`    ${pad(label, 16)} ${padL(n, 3)}${flag}`);
      if (example) console.log(`      e.g. ${example.sourcePath}`);
    }
    console.log('');
  }

  const unreachable = plan.filter((p) => p.unreachableAtAudit);
  if (unreachable.length) {
    console.log(`  ${unreachable.length} planned file(s) TIMED OUT during the audit rather than 404ing. They are`);
    console.log('  included — a timeout is not evidence of absence — but expect some to fail.');
    console.log('');
  }

  // A readable sample rather than 1600 lines.
  const SAMPLE = 12;
  console.log(`  first ${Math.min(SAMPLE, todo.length)} of ${todo.length}:`);
  console.log('');
  for (const p of todo.slice(0, SAMPLE)) {
    console.log(`  ${p.sourcePath}`);
    console.log(`    → ${p.resourceType.padEnd(5)} ${p.publicId}`);
    console.log(`      ${p.derivedUrl}`);
    console.log(`      ${p.sourceBytes != null ? fmtBytes(p.sourceBytes) : '(size unknown)'}, ${p.refCount} ref(s)`);
  }
  if (todo.length > SAMPLE) console.log(`  … ${todo.length - SAMPLE} more.`);
  console.log('');

  if (!APPLY) {
    console.log('══ DRY RUN COMPLETE. No file was uploaded. No document was written. ═════');
    console.log('');
    console.log('  Re-run with --apply to perform the copy. Nothing in this phase rewrites');
    console.log('  a reference — that is a separate, separately-reviewed change.');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  // ══ from here on: --apply only ═════════════════════════════════════════════
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (!process.env[k]) die(`${k} not set — pass --env-file=.env.local`);
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  // Indexes are built here, under --apply, and nowhere else — see the schema.
  await LegacyFileMigration.createIndexes();

  // ── ONE-TIME SHAPE MIGRATION: substitutionRule string → array ─────────────
  // Rows written before the trailing-whitespace ruling hold a scalar. Leaving
  // both shapes in one collection means every future reader has to handle two,
  // and the one that forgets is the one that breaks — so it is converted here,
  // in the same run that starts writing the new shape, rather than tolerated.
  const legacyShape = await LegacyFileMigration.collection.countDocuments({
    substitutionRule: { $type: 'string' },
  });
  if (legacyShape > 0) {
    const res = await LegacyFileMigration.collection.updateMany(
      { substitutionRule: { $type: 'string' } },
      [{
        $set: {
          substitutionRule: {
            $cond: [{ $in: ['$substitutionRule', ['', null]] }, [], ['$substitutionRule']],
          },
        },
      }],
    );
    console.log(`  migrated ${res.modifiedCount} row(s) from scalar substitutionRule to the array shape.`);
    console.log('');
  }

  // ── BACKFILL: storedFormat / pathExtension on rows written before ruling 3 ─
  // Both are derivable from data already on the row — `format` came back with
  // the upload, and the extension is in `sourcePath` — so this costs NO
  // Cloudinary Admin API calls, which matters on a 500/hour quota with 1600
  // rows. Without it the format disagreement stays invisible to a query on
  // every row uploaded before the field existed.
  const needBackfill = await LegacyFileMigration.collection
    .find({ status: { $in: ['uploaded', 'exists'] }, $or: [{ storedFormat: '' }, { storedFormat: { $exists: false } }, { formatDisagrees: { $exists: false } }] },
      { projection: { sourcePath: 1, format: 1 } })
    .toArray();
  if (needBackfill.length) {
    const ops = needBackfill.map((d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            storedFormat: d.format ?? '',
            pathExtension: extensionOf(d.sourcePath).toLowerCase(),
            formatDisagrees: formatsDisagree(d.format, extensionOf(d.sourcePath).toLowerCase()),
          },
        },
      },
    }));
    const r = await LegacyFileMigration.collection.bulkWrite(ops, { ordered: false });
    console.log(`  backfilled storedFormat/pathExtension on ${r.modifiedCount} row(s).`);
    console.log('');
  }

  // Human rulings recorded first, pointing at their replacement.
  for (const s of superseded) {
    await LegacyFileMigration.updateOne(
      { sourcePath: s.sourcePath },
      {
        $set: {
          // The WINNER's id and URL — this file is not uploaded, but its
          // references have somewhere to go.
          publicId: s.winnerPublicId,
          resourceType: s.winnerResourceType,
          derivedUrl: derivedUrlFor(process.env.CLOUDINARY_CLOUD_NAME, s.winnerPublicId, s.winnerResourceType, s.winnerExt),
          supersededBy: s.supersededBy,
          note: s.note,
          status: 'superseded',
          refCount: s.refCount,
          directory: directoryOf(s.sourcePath),
          sourceBytes: s.sourceCheck?.contentLength != null ? Number(s.sourceCheck.contentLength) : null,
        },
        $setOnInsert: { sourcePath: s.sourcePath },
      },
      { upsert: true },
    );
  }

  // The confirmed-dead set is recorded once so the decision is in the data.
  for (const s of dead) {
    await LegacyFileMigration.updateOne(
      { sourcePath: s.sourcePath },
      {
        $setOnInsert: {
          sourcePath: s.sourcePath,
          resourceType: classify(s.sourcePath).resourceType ?? 'raw',
          status: 'skipped-dead',
          error: `source returned ${s.sourceCheck?.status} at audit time`,
          refCount: s.refCount,
          directory: directoryOf(s.sourcePath),
        },
      },
      { upsert: true },
    );
  }

  const runStartedAt = Date.now();
  const stats = { uploaded: 0, failed: 0, exists: 0, bytes: 0 };
  let done = 0;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= todo.length) return;
      const p = todo[i];
      let record;

      try {
        const buf = await download(p.sourcePath);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

        const res = await uploadBuffer(buf, {
          public_id: p.publicId,
          resource_type: p.resourceType,
          // NEVER use_filename — see the header.
          overwrite: false,
          unique_filename: false,
          invalidate: false,
        });

        // overwrite:false returns the EXISTING asset rather than erroring, so
        // "already there" is detected by its age, not by an exception.
        const preExisting = res.created_at && new Date(res.created_at).getTime() < runStartedAt - 60_000;

        // ── RULING 2: GIFs may come back SMALLER ────────────────────────────
        // Cloudinary strips metadata from a GIF on upload. That was verified
        // to be metadata only, not a re-encode: all seven GIFs were decoded on
        // both sides and frame count, canvas dimensions AND total frame delay
        // are identical (209, 168, 165, 83, 57, 30 and 2 frames — these are
        // real animations, so a flatten would have been unmistakable). The
        // deltas are 25-45 bytes.
        //
        // The tolerance is deliberately ONE-SIDED and format-scoped: only a
        // GIF, and only SMALLER. A larger file, or any other format, still
        // fails — an unexplained size change is the one signal that
        // distinguishes "stripped a comment block" from "we uploaded the wrong
        // bytes", and widening this would throw that signal away.
        const exact = res.bytes === buf.length;
        const gifShrink = !exact && p.ext === 'gif' && res.bytes < buf.length;
        const sizeOk = exact || gifShrink;
        const sizeExceptionReason = gifShrink
          ? `GIF metadata stripped on upload: ${buf.length} B → ${res.bytes} B `
            + `(-${buf.length - res.bytes} B). Frame count, dimensions and total delay verified identical.`
          : '';

        record = {
          publicId: res.public_id,
          publicIdSubstituted: p.publicIdSubstituted,
          substitutionRule: p.substitutionRule,
          sizeExceptionReason,
          // RULING 3 — recorded on every row, so the disagreement is queryable
          // rather than something delivery has to work out again.
          storedFormat: res.format ?? '',
          pathExtension: p.ext,
          formatDisagrees: formatsDisagree(res.format, p.ext),
          resourceType: p.resourceType,
          format: res.format ?? p.ext,
          secureUrl: res.secure_url,
          derivedUrl: p.derivedUrl,
          sourceBytes: buf.length,
          uploadedBytes: res.bytes,
          sha256,
          etag: res.etag ?? '',
          refCount: p.refCount,
          directory: p.directory,
          attemptedAt: new Date(),
          // A SIZE MISMATCH WINS OVER EVERY OTHER OUTCOME, including
          // pre-existing. The first version returned 'exists' without checking
          // the bytes, which meant a retry silently upgraded six GIFs from
          // 'failed' to 'exists' while they were still the wrong size — the
          // record started claiming the migration was fine for files it was
          // not fine for. Whether the asset was written this run or a previous
          // one is irrelevant to whether it matches the source.
          status: sizeOk ? (preExisting ? 'exists' : 'uploaded') : 'failed',
          error: !sizeOk
            ? `SIZE MISMATCH: source ${buf.length} B, Cloudinary reported ${res.bytes} B`
              + (preExisting ? ' (asset already existed; overwrite:false left it untouched)' : '')
            : (preExisting ? 'public_id already existed; overwrite:false left it untouched' : ''),
        };
        if (record.status === 'uploaded') { stats.uploaded += 1; stats.bytes += buf.length; }
        else if (record.status === 'exists') stats.exists += 1;
        else stats.failed += 1;
      } catch (err) {
        stats.failed += 1;
        record = {
          publicId: p.publicId,
          publicIdSubstituted: p.publicIdSubstituted,
          substitutionRule: p.substitutionRule,
          resourceType: p.resourceType,
          derivedUrl: p.derivedUrl,
          sourceBytes: p.sourceBytes,
          refCount: p.refCount,
          directory: p.directory,
          attemptedAt: new Date(),
          status: 'failed',
          error: (err?.message ?? String(err)).slice(0, 500),
        };
      }

      await LegacyFileMigration.updateOne(
        { sourcePath: p.sourcePath },
        { $set: record, $setOnInsert: { sourcePath: p.sourcePath } },
        { upsert: true },
      );

      done += 1;
      if (done % 10 === 0 || done === todo.length) {
        const secs = (Date.now() - runStartedAt) / 1000;
        process.stdout.write(
          `\r  ${done}/${todo.length}  ok=${stats.uploaded} fail=${stats.failed} exists=${stats.exists}  `
          + `${fmtBytes(stats.bytes)}  ${secs.toFixed(0)}s   `,
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
  console.log(`  uploaded      : ${stats.uploaded}`);
  console.log(`  already there : ${stats.exists}`);
  console.log(`  failed        : ${stats.failed}`);
  console.log(`  skipped (done): ${alreadyDone.length}`);
  console.log(`  skipped (dead): ${dead.length}`);
  console.log(`  bytes copied  : ${fmtBytes(stats.bytes)}`);
  console.log(`  elapsed       : ${elapsed.toFixed(0)}s`);
  console.log('');
  if (stats.failed) {
    const failures = await LegacyFileMigration.find({ status: 'failed' }, { sourcePath: 1, error: 1 }).lean();
    console.log(`  ${failures.length} failure(s) — re-running this script retries them:`);
    for (const f of failures.slice(0, 40)) console.log(`    ${f.sourcePath}\n      ${f.error}`);
    if (failures.length > 40) console.log(`    … ${failures.length - 40} more in legacy_file_migrations.`);
    console.log('');
  }
  // ── DELIVERY VERIFICATION ────────────────────────────────────────────────
  //
  // A 200 from the UPLOAD API is not evidence that the DELIVERY URL resolves.
  // They are different systems: upload writes to Cloudinary's store, delivery
  // is a separate CDN edge that has to resolve the public_id, the resource
  // type and the format. The entire migration design rests on the second one,
  // so every file uploaded in this run is fetched back and compared byte for
  // byte against the source. Nothing here trusts the upload response.
  console.log('── VERIFYING DELIVERY URLs (fetched, not assumed) ──────────────────────');
  console.log('');

  const toVerify = await LegacyFileMigration
    .find({ sourcePath: { $in: plan.map((p) => p.sourcePath) }, status: { $in: ['uploaded', 'exists'] } },
      { sourcePath: 1, derivedUrl: 1, sourceBytes: 1, uploadedBytes: 1, storedFormat: 1, pathExtension: 1, formatDisagrees: 1, sizeExceptionReason: 1 })
    .lean();

  const verified = [];
  let vNext = 0;
  const vWorker = async () => {
    for (;;) {
      const i = vNext; vNext += 1;
      if (i >= toVerify.length) return;
      const row = toVerify[i];
      const started = Date.now();
      try {
        const res = await fetch(row.derivedUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
        const body = await res.arrayBuffer();
        verified.push({
          sourcePath: row.sourcePath,
          url: row.derivedUrl,
          status: res.status,
          contentType: res.headers.get('content-type'),
          bytes: body.byteLength,
          sourceBytes: row.sourceBytes,
          storedBytes: row.uploadedBytes,
          // What delivery MUST reproduce is what Cloudinary STORES, not what
          // the legacy server held. The two differ only where a ruling already
          // examined and accepted the difference, and comparing against source
          // here would re-report those every run — eleven permanent "failures"
          // that train a reader to skim the section that exists to be read.
          match: body.byteLength === row.uploadedBytes,
          // Ruling 3: the path says .jpg, Cloudinary stores png, so the
          // delivery URL asks for a transcode. Expected, not a fault.
          transcoded: Boolean(row.formatDisagrees),
          storedFormat: row.storedFormat,
          pathExtension: row.pathExtension,
          sizeExceptionReason: row.sizeExceptionReason ?? '',
          ms: Date.now() - started,
        });
      } catch (err) {
        verified.push({
          sourcePath: row.sourcePath,
          url: row.derivedUrl,
          status: null,
          contentType: null,
          bytes: null,
          sourceBytes: row.sourceBytes,
          match: false,
          ms: Date.now() - started,
          error: err?.message ?? String(err),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toVerify.length || 1) }, vWorker));
  verified.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

  console.log(`  ${pad('source file', 52)} ${padL('HTTP', 5)} ${pad('content-type', 20)} ${padL('bytes', 9)} ${padL('source', 9)} ${pad('match', 6)}`);
  console.log(`  ${rule(52)} ${rule(5)} ${rule(20)} ${rule(9)} ${rule(9)} ${rule(6)}`);
  // A 1600-row table is not read. Print it in full when it is reviewable,
  // otherwise a sample — every FAILURE is listed in full below regardless.
  const VERIFY_TABLE_LIMIT = 60;
  const shown = verified.length <= VERIFY_TABLE_LIMIT ? verified : verified.slice(0, VERIFY_TABLE_LIMIT);
  for (const v of shown) {
    const short = v.sourcePath.length > 52 ? `…${v.sourcePath.slice(-51)}` : v.sourcePath;
    console.log(
      `  ${pad(short, 52)} ${padL(v.status ?? 'ERR', 5)} ${pad((v.contentType ?? '-').split(';')[0], 20)} `
      + `${padL(v.bytes ?? '-', 9)} ${padL(v.sourceBytes ?? '-', 9)} ${pad(v.match ? 'yes' : 'NO', 6)}`,
    );
  }
  if (shown.length < verified.length) console.log(`  … ${verified.length - shown.length} more row(s) not printed; every failure is listed below.`);
  console.log('');

  const vOk = verified.filter((v) => v.status === 200 && v.match);
  // Delivered bytes differ from stored ONLY because the URL asked for a
  // different format than Cloudinary holds — ruling 3, deliberate, listed
  // by name rather than counted as a pass or hidden as a failure.
  const vTranscoded = verified.filter((v) => v.status === 200 && !v.match && v.transcoded);
  const vBad = verified.filter((v) => !(v.status === 200 && (v.match || v.transcoded)));
  console.log(`  delivered 200, byte-identical to STORED : ${vOk.length} / ${verified.length}`);
  if (vTranscoded.length) {
    console.log(`  delivered 200, TRANSCODED by design    : ${vTranscoded.length}  (ruling 3 — see below)`);
  }
  const withException = verified.filter((v) => v.sizeExceptionReason);
  if (withException.length) {
    console.log(`  stored smaller than source, ACCEPTED   : ${withException.length}  (ruling 2 — GIF metadata)`);
  }
  if (vTranscoded.length) {
    console.log('');
    console.log('  DELIBERATELY NOT BYTE-VERIFIED (format transcode at delivery):');
    for (const v of vTranscoded) {
      console.log(`    ${v.sourcePath}`);
      console.log(`      path says .${v.pathExtension}, Cloudinary stores ${v.storedFormat}; delivered ${v.bytes} B vs stored ${v.storedBytes} B`);
    }
  }
  if (vBad.length) {
    console.log('');
    console.log(`  ⚠ ${vBad.length} FAILED VERIFICATION — uploaded but not correctly deliverable:`);
    for (const v of vBad) {
      console.log(`    ${v.sourcePath}`);
      console.log(`      ${v.url}`);
      console.log(`      status=${v.status ?? 'ERR'} bytes=${v.bytes ?? '-'} vs source ${v.sourceBytes ?? '-'}${v.error ? ` — ${v.error}` : ''}`);
    }
  }
  console.log('');

  console.log('  No document field was rewritten. Delivery still points at the legacy host.');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
