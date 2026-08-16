/**
 * Legacy delivery layer — END-TO-END VERIFICATION against a deployed origin.
 * READ-ONLY: one Mongo read to build the probe set, then HTTP GETs. Writes nothing.
 *
 *   node --env-file=.env.local scripts/verify-legacy-delivery.mjs
 *   node --env-file=.env.local scripts/verify-legacy-delivery.mjs --origin=https://…
 *   … --json=path/to/out.json      also dump every measurement
 *
 * ══ WHY THIS SCRIPT EXISTS RATHER THAN A CHECKLIST ══════════════════════════
 *
 * Every pass criterion here is a failure that ALREADY LOOKED LIKE SUCCESS at
 * least once during this migration. It is not a list of things that could
 * conceivably go wrong; it is a list of things that did, and that a human
 * eyeballing a page would not have caught:
 *
 *   · A 200 that is an ERROR PAGE. Cloudinary answers 4xx as a body, and a
 *     proxy hop can turn that into a 200 with HTML in it. Status alone is not
 *     evidence, so every response is checked against the MAGIC BYTES its
 *     extension implies.
 *   · x-legacy-delivery PRESENT on a static image. Bytes correct, image
 *     renders, page looks perfect — and every request is now a function
 *     invocation plus a Cloudinary fetch that the edge should have absorbed.
 *     A silent bandwidth regression on a plan where bandwidth is 67.8% of
 *     spend. Its presence on a static path is a FAIL, not a note.
 *   · A Range request answered 200 instead of 206, with a correct
 *     Content-Range and a correct PARTIAL body. A client that checks the
 *     status renders a truncated PDF. This is what the no-store header on
 *     documents exists to prevent; the assertion here is what proves it still
 *     does.
 *   · A 429 read as a dead file. Cloudinary rate-limits, and a 429 counted as
 *     a 404 turns a throttle into a phantom migration failure. Retried, then
 *     reported as INFRA — never as FAIL.
 *   · An SVG silently RASTERISED. f_auto renders copy.svg as a 24×24 PNG of
 *     187 B. It is a valid image, it is a 200, and it is blurred on every
 *     retina display. Checked by content-type AND by decoded byte equality
 *     with the source.
 *
 * ── WHY THE PROBE SET COMES FROM MONGO AND NOT FROM A LIST IN THIS FILE ─────
 * The repo's audit JSON mixes real references with test fixtures (/files/x.pdf,
 * a/b.jpg) that were never uploaded. Hardcoding paths from it produces
 * confident FAILs against files that do not exist. Every path probed here is
 * drawn from a legacy_file_migrations row with status 'uploaded', so a 404 is
 * always a delivery defect and never a bad probe.
 *
 * The selection is TRAIT-BASED, not first-N: Thai script, spaces, parentheses,
 * an uppercase extension, a dotted filename, a trailing-space name, an @, a
 * format disagreement, an animated GIF, each legacy root. First-N would draw
 * 12 lookalike files from one directory and prove almost nothing.
 *
 * ── ONE DATA QUIRK THIS SCRIPT WORKS AROUND, DELIBERATELY ───────────────────
 * `substitutionRule` is documented as [String] and is stored as [[String]] —
 * the migration wrote it through the raw driver, which does no casting. So the
 * query in the model's own header, { substitutionRule: 'ampersand-to-and' },
 * matches ZERO rows: Mongo descends one array level, not two. The resolver does
 * not care (it queries the indexed `publicIdSubstituted` boolean), so nothing
 * is broken in delivery — but a verification that used the documented query
 * would silently probe 0 of the 6 resolver files and report a clean pass.
 * Hence the flatten below, and hence the assertion that the count is EXACTLY 6.
 */

import { MongoClient } from 'mongodb';
import { writeFileSync } from 'node:fs';
import {
  DELIVERY_VARIANTS,
  VARIANT_PREFIX,
  NO_STORE_DOCUMENT_EXTENSIONS,
} from '../src/lib/legacyTransforms.mjs';
// The SAME list next.config.mjs builds its rewrite rules from. Hardcoding it
// here a second time is how this harness could go green over a document the
// rewrite had stopped serving.
import { WEBROOT_DOCUMENTS } from '../src/lib/webrootDocuments.mjs';

const args = process.argv.slice(2);
const argOf = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=').slice(1).join('=');
const ORIGIN = argOf('origin', 'https://genesis-lab.9expert.app').replace(/\/$/, '');
const JSON_OUT = argOf('json', '');

const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

/* ── ENCODING ───────────────────────────────────────────────────────────────
 * Per SEGMENT, so the separators survive. encodeURIComponent leaves ( ) . - _
 * ~ ! * ' alone (all legal in a path) and encodes space, Thai, @ and &.
 *
 * `ampersand` selects the spelling for the resolver probes: BOTH must resolve,
 * because Next matches its rewrite on the RAW pathname — a client that encodes
 * sends %26 and a literal & never appears. Matching only one spelling was
 * measured to resolve 0 of 6.
 */
const encodePath = (p, { ampersand = 'encoded' } = {}) => {
  const enc = p.split('/').map(encodeURIComponent).join('/');
  return ampersand === 'literal' ? enc.replaceAll('%26', '&') : enc;
};

const extOf = (p) => {
  const last = p.slice(p.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1).toLowerCase();
};

/* ── IS THIS ACTUALLY THE FILE, OR AN ERROR PAGE WEARING A 200? ─────────────
 * Signature check on the first bytes. `null` means "no signature known for
 * this type", which is reported as unchecked rather than quietly passed.
 */
const MAGIC = {
  webp: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF'
    && b.subarray(8, 12).toString('latin1') === 'WEBP',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  gif: (b) => b.subarray(0, 3).toString('latin1') === 'GIF',
  svg: (b) => /^\s*(<\?xml|<svg|<!--|<!DOCTYPE svg)/i.test(b.subarray(0, 200).toString('utf8')),
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b // xlsx / pptx / docx / pbix are all zip
    // …EXCEPT when the legacy box named an Excel 97-2003 file `.xlsx`. That is
    // OLE2/CFB, not a zip, and there are real ones in /files/document. Delivery
    // returns them byte-equal to source, so the file is fine and only the name
    // lies — accepting the header here keeps a source-data quirk from being
    // reported as a delivery failure.
    || b.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1',
};
const magicFor = (ct, ext) => {
  if (/svg/.test(ct)) return MAGIC.svg;
  if (/webp/.test(ct)) return MAGIC.webp;
  if (/\bpng\b/.test(ct)) return MAGIC.png;
  if (/jpe?g/.test(ct)) return MAGIC.jpg;
  if (/gif/.test(ct)) return MAGIC.gif;
  if (ext === 'pdf') return MAGIC.pdf;
  if (['xlsx', 'xls', 'docx', 'pptx', 'pbix', 'zip'].includes(ext)) return MAGIC.zip;
  return null;
};
const looksLikeErrorPage = (b) => /^\s*(<!DOCTYPE html|<html)/i.test(b.subarray(0, 200).toString('utf8'));

/* ── RENDERED PIXEL WIDTH, READ OUT OF THE RETURNED BYTES ───────────────────
 *
 * The Cloudinary URL is server-side and invisible from here, so the only
 * evidence that `/_img/w800` changed the transformation is in the image the
 * edge handed back.
 *
 * BYTE SIZE ALONE IS NOT THAT EVIDENCE, and assuming it was produced three
 * false FAILs on the first run of this script. `c_limit` NEVER ENLARGES, so
 * for any source narrower than 800 px `w_1600,c_limit` and `w_800,c_limit`
 * resize nothing and return the SAME bytes — measured: greensunny.jpg 372 px,
 * logo-power-bi.png 300 px, find-my-mouse-in-powertoys.gif 716 px, all three
 * byte-identical across both variants and all three CORRECT.
 *
 * So the assertion is on WIDTH: the render must be min(sourceWidth, limit).
 * That distinguishes "the variant was ignored" from "the variant applied and
 * c_limit properly declined to upscale", which byte size cannot.
 */
function webpWidth(b) {
  if (b.length < 30 || b.subarray(0, 4).toString('latin1') !== 'RIFF') return null;
  const chunk = b.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X') return 1 + b.readUIntLE(24, 3);          // extended / animated
  if (chunk === 'VP8 ') return b.readUInt16LE(26) & 0x3fff;      // lossy
  if (chunk === 'VP8L') return (b.readUInt32LE(21) & 0x3fff) + 1; // lossless
  return null;
}

/* ── ONE MEASURED REQUEST ───────────────────────────────────────────────────
 * `redirect: 'manual'`: a rewrite is a PROXY, so a 3xx here is a finding, not
 * something to follow silently into a 200 that came from elsewhere.
 *
 * Bytes are counted from the DECODED body, and content-length is recorded
 * separately, because they legitimately differ when the hop is compressed —
 * an SVG arrives gzipped, so content-length is the compressed size while the
 * source-equality check needs the decoded size.
 *
 * 429 and 5xx are RETRIED and then reported as INFRA. A throttle counted as a
 * 404 invents a migration failure that is not there.
 */
async function probe(url, { range = null, attempt = 1 } = {}) {
  // `identity` on a RANGED request, deliberately. If the hop compresses, the
  // byte range applies to the COMPRESSED stream and a 1024-byte range decodes
  // to some other length — the assertion would then fail for a reason that has
  // nothing to do with delivery.
  const headers = { 'accept-encoding': range ? 'identity' : 'gzip, br' };
  if (range) headers.range = range;
  let res;
  let body;
  try {
    // 180s, not 60s. The largest legacy document is 44.6 MiB and is held OUT of
    // the edge cache by design, so every probe transfers the whole thing from
    // Blob — measured at 85s. At 60s it reported INFRA twice on a file that is
    // provably healthy (200, byte-exact, %PDF-, Range 206), which is a false
    // inconclusive rather than a finding.
    res = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(180_000) });
    // THE BODY READ IS INSIDE THE TRY, deliberately. The abort signal covers the
    // whole exchange, not just the headers, so a large document that stalls
    // mid-stream rejects HERE — and with this outside the try it escaped as an
    // uncaught DOMException and killed the run after 60-odd probes had passed.
    // A timeout is an INFRA outcome to retry, never a crash.
    body = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (attempt < 3) { await sleep(1500 * attempt); return probe(url, { range, attempt: attempt + 1 }); }
    return { url, range, error: String(err?.message ?? err), infra: true };
  }
  const h = (k) => res.headers.get(k);
  const out = {
    url,
    range,
    status: res.status,
    bytes: body.length,
    contentLength: h('content-length') ? Number(h('content-length')) : null,
    contentType: h('content-type') ?? '',
    contentEncoding: h('content-encoding') ?? '',
    contentRange: h('content-range') ?? '',
    contentDisposition: h('content-disposition') ?? '',
    acceptRanges: h('accept-ranges') ?? '',
    cacheControl: h('cache-control') ?? '',
    vercelCache: h('x-vercel-cache') ?? '',
    legacyDelivery: h('x-legacy-delivery') ?? '',
    location: h('location') ?? '',
    head: body.subarray(0, 64).toString('latin1'),
    htmlBody: looksLikeErrorPage(body),
  };
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(2000 * attempt);
    return probe(url, { range, attempt: attempt + 1 });
  }
  if (res.status === 429 || res.status >= 500) out.infra = true;
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Two probes of the same URL, for the MISS→HIT cacheability check.
 *
 * A brand-new asset can legitimately MISS twice: the second request races the
 * edge fill, or lands on a different PoP. Measured during the Stage-1 backfill —
 * four freshly-uploaded SVGs reported MISS→MISS and then HIT on the very next
 * request, so the pair was reporting a cold fill as an uncacheable response.
 *
 * One retry separates those two. It cannot mask a genuinely uncacheable
 * response, because `private`/no-store upstreams never reach HIT no matter how
 * many times they are asked — and the document category asserts the OPPOSITE
 * (that a HIT never happens), so a retry there would be wrong and is not used.
 */
async function probePair(url) {
  const first = await probe(url);
  let second = await probe(url);
  // Up to two patient retries. A first-ever request for a just-uploaded asset
  // fills the edge asynchronously, and 400 ms was measured too short — an SVG
  // reported MISS→MISS here and then HIT 6/6 with `Age: 169` moments later.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (/HIT/.test(second.vercelCache ?? '') || second.infra) break;
    await sleep(1500);
    second = await probe(url);
  }
  return [first, second];
}

/* ── PROBE SET, DRAWN FROM THE DATABASE ─────────────────────────────────── */
async function buildProbeSet() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(process.env.MONGODB_DB_NAME || '9exp_genesis')
    .collection('legacy_file_migrations');

  const P = {
    _id: 0, sourcePath: 1, publicId: 1, resourceType: 1, format: 1, status: 1,
    sourceBytes: 1, substitutionRule: 1, formatDisagrees: 1, pathExtension: 1, storedFormat: 1,
  };
  const one = async (filter, sort = {}) =>
    (await col.find({ status: 'uploaded', ...filter }, { projection: P }).sort(sort).limit(1).toArray())[0];
  const many = async (filter, sort = {}, n = 50) =>
    col.find({ status: 'uploaded', ...filter }, { projection: P }).sort(sort).limit(n).toArray();

  /* Traits, one file each. Named so a FAIL says WHICH property broke. */
  const wanted = [
    ['thai',            { resourceType: 'image', sourcePath: /^\/sites\/default\/files\/articles\/cover\/[^/]*[ก-๙]/ }],
    ['thai+space+paren',{ resourceType: 'image', sourcePath: /[ก-๙][^/]*\([^/]*\)[^/]*\.png$/ }],
    ['space+paren',     { resourceType: 'image', sourcePath: /shutterstock_[0-9]+ \(1\)\.jpg$/ }],
    ['paren+comma+trailing-space', { resourceType: 'image', sourcePath: /ETL \(Extract, Transform, Load\) \.png$/ }],
    ['UPPERCASE-ext',   { resourceType: 'image', sourcePath: /\.PNG$/ }],
    ['dotted-name',     { resourceType: 'image', sourcePath: /thailand-4\.0\.png$/ }],
    ['dotted-name-2',   { resourceType: 'image', sourcePath: /macro-excel\.001\.png$/ }],
    ['at-sign+spaces',  { resourceType: 'image', sourcePath: /@3x\.png$/, formatDisagrees: false }],
    // `storage: 'blob'` is EXCLUDED, and that is not incidental. The Blob
    // content-type correction set formatDisagrees on 7 Blob objects — 4 of them
    // MP3s — so this trait, which is meant to find a Cloudinary IMAGE whose
    // extension lies, started returning an audio file and asserting `image/*`
    // on it. The trait means "Cloudinary image", so it says so.
    ['formatDisagrees', { formatDisagrees: true, resourceType: 'image', storage: { $ne: 'blob' } }, { sourceBytes: 1 }],
    ['formatDisagrees-large', { formatDisagrees: true, resourceType: 'image', storage: { $ne: 'blob' } }, { sourceBytes: -1 }],
    ['plain-ascii',     { resourceType: 'image', sourcePath: /inline-images\/logo-power-bi\.png$/ }],
    ['animated-gif',    { resourceType: 'image', sourcePath: /\.gif$/ }, { sourceBytes: -1 }],
  ];
  const images = [];
  for (const [trait, filter, sort] of wanted) {
    const row = await one(filter, sort);
    if (!row) { console.warn(`  ! no row for trait ${trait} — trait not probed`); continue; }
    if (images.some((i) => i.row.sourcePath === row.sourcePath)) continue;
    images.push({ trait, row });
  }

  const svgs = await many({ sourcePath: /\.svg$/i }, { sourcePath: 1 });

  /* Documents: the LARGEST (the Range test wants a file worth seeking in),
   * plus a spaced .pdf, a .pbix and an .xlsx, and each raw root. */
  const rawAll = await many({ resourceType: 'raw' }, { sourceBytes: -1 });
  const pick = (re) => rawAll.find((r) => re.test(r.sourcePath));
  const docs = [
    { trait: 'largest-raw/pdf', row: rawAll[0] },
    { trait: 'pdf+spaces', row: pick(/ .*\.pdf$/) },
    { trait: 'pbix', row: pick(/\.pbix$/) },
    { trait: 'xlsx', row: pick(/\.xlsx$/) },
  ].filter((d) => d.row);

  /* THE RESOLVER POPULATION — every LOSSY substitution, both rules.
   *
   * Flattened because of the [[String]] quirk in the header. `&`→`and` and
   * `#`→`sharp` are the two lossy, non-invertible mappings, so they are the two
   * that must travel through /legacy-file; the trailing-space rule is also
   * flagged `publicIdSubstituted` but is served STATICALLY (Cloudinary trims a
   * trailing space when resolving an id), so including it here would assert the
   * wrong delivery path for 18 files.
   *
   * Capped per rule so a run stays quick — the population is now 20 `&` and 11
   * `#` after the full-tree backfill, and the point is coverage of both rules,
   * not exhaustion. */
  const substituted = await col
    .find({ publicIdSubstituted: true }, { projection: P }).toArray();
  const hasRule = (r, name) => (r.substitutionRule ?? []).flat(Infinity).includes(name);
  const ampersand = [
    ...substituted.filter((r) => hasRule(r, 'ampersand-to-and')).slice(0, 8),
    ...substituted.filter((r) => hasRule(r, 'hash-to-sharp')).slice(0, 6),
  ];

  /* NOT 'uploaded', but still REAL legacy URLs that the rewrite will point at,
   * so they are delivery surface and are probed too:
   *   exists      — the id was already in Cloudinary and overwrite:false
   *                 declined. The asset is there; delivery should be normal.
   *   superseded  — never uploaded under its OWN id. `publicId` carries the
   *                 WINNER's, and the claim in the resolver's header is that
   *                 the .jpeg path resolves to the surviving .png asset and
   *                 Cloudinary transcodes. That claim is worth measuring: if
   *                 it is wrong, this URL 404s for real users.
   */
  const others = await col.find(
    { status: { $in: ['exists', 'superseded'] } },
    { projection: P },
  ).sort({ sourcePath: 1 }).toArray();

  await client.close();
  return { images, svgs, docs, ampersand, others, substitutedCount: substituted.length };
}

/* ── VERDICTS ───────────────────────────────────────────────────────────────
 * Each returns { verdict, notes[] }. A note is an observation; only `fail`
 * pushes the tally. INFRA is separated from FAIL on purpose — a throttle is
 * not a broken migration and must not be reported as one.
 */
function judgeStatic(r1, r2, row, { expectContentType, expectBytes = null }) {
  const notes = [];
  let fail = false;
  if (r1.infra || r2.infra) return { verdict: 'INFRA', notes: [`upstream ${r1.status ?? r1.error}`] };
  if (r1.status !== 200) { fail = true; notes.push(`status ${r1.status}${r1.location ? ` → ${r1.location}` : ''}`); }
  if (r1.htmlBody) { fail = true; notes.push('body is HTML — error page wearing a 200'); }
  if (expectContentType && !expectContentType.test(r1.contentType)) {
    fail = true; notes.push(`content-type ${r1.contentType || '(none)'}`);
  }
  const magic = magicFor(r1.contentType, extOf(row.sourcePath));
  if (magic && r1.bytes && !magic(Buffer.from(r1.head, 'latin1'))) {
    fail = true; notes.push(`magic bytes wrong (${JSON.stringify(r1.head.slice(0, 8))})`);
  }
  // x-legacy-delivery on a static path = the function ran = bandwidth regression
  if (r1.legacyDelivery) { fail = true; notes.push(`x-legacy-delivery: ${r1.legacyDelivery} — FUNCTION RAN on a static path`); }
  // Cacheability: reaching HIT proves it. Already-warm (HIT,HIT) also proves it.
  const seq = `${r1.vercelCache || '-'}→${r2.vercelCache || '-'}`;
  if (!/HIT/.test(r2.vercelCache)) { fail = true; notes.push(`edge cache never HIT (${seq})`); }
  if (expectBytes != null && r1.bytes !== expectBytes) {
    fail = true; notes.push(`bytes ${r1.bytes} ≠ source ${expectBytes}`);
  }
  return { verdict: fail ? 'FAIL' : 'PASS', notes, seq };
}

/* ── RUN ────────────────────────────────────────────────────────────────── */
console.log(`\nlegacy delivery verification → ${ORIGIN}`);
console.log('READ-ONLY: one Mongo read, then HTTP GETs. Nothing is written.\n');

const set = await buildProbeSet();
console.log(`probe set: ${set.images.length} images · ${set.svgs.length} svg · ${set.docs.length} documents`);
console.log(`           ${set.ampersand.length} resolver-routed (of ${set.substitutedCount} substituted)`);

/* ── THE RESOLVER SET MUST NOT BE SILENTLY EMPTY ───────────────────────────
 *
 * This guard used to demand EXACTLY 6, because 6 was the whole ampersand
 * population when the migration was reference-driven and the danger was the
 * documented `substitutionRule` query matching zero rows (it is stored
 * [[String]], so Mongo's one-level descent misses it) and reporting a clean pass
 * having probed nothing.
 *
 * The full-tree backfill changed the population, so a hardcoded 6 now aborts on
 * correct data: Stage 2 alone brought 20 `&` files and 11 `#` files. The property
 * worth guarding was never the number — it was NON-EMPTINESS, plus agreement
 * with what the database actually holds. So the guard is now that, and the count
 * is reported rather than pinned.
 */
if (!set.ampersand.length) {
  die('the resolver probe set is EMPTY. Either no substituted rows exist, or the '
    + 'substitutionRule query has stopped matching (it is stored [[String]] — see the header). '
    + 'Refusing to report a pass having probed no resolver path.');
}

const rows = [];
const record = (o) => { rows.push(o); const v = o.verdict;
  const mark = v === 'PASS' ? '✓' : v === 'FAIL' ? '✗' : v === 'EXPECTED-INERT' ? '·' : '?';
  console.log(`  ${mark} ${v.padEnd(15)} ${o.category.padEnd(12)} ${o.label}`
    + (o.notes?.length ? `\n      ${o.notes.join('; ')}` : ''));
};

/* IMAGES + their w800 variant. */
console.log('\n── IMAGES (static rewrite; x-legacy-delivery must be ABSENT) ──');
for (const { trait, row } of set.images) {
  const path = encodePath(row.sourcePath);
  const url = `${ORIGIN}${path}`;
  const [r1, r2] = await probePair(url);
  const j = judgeStatic(r1, r2, row, { expectContentType: /^image\// });
  const dw = webpWidth(Buffer.from(r1.head, 'latin1'));
  if (j.verdict === 'PASS') {
    if (dw != null && dw > 1600) { j.verdict = 'FAIL'; j.notes.push(`rendered ${dw}px > w_1600 cap`); }
    else j.notes.push(`${dw ?? '?'}px · ${r1.bytes} B`);
  }
  record({ category: 'image', label: `${trait} · ${row.sourcePath}`, url, ...j,
    status: r1.status, bytes: r1.bytes, width: dw, cache: j.seq, legacy: r1.legacyDelivery,
    contentType: r1.contentType, cacheControl: r1.cacheControl, raw: [r1, r2] });

  // The variant must actually change the transformation. Asserted on WIDTH,
  // not bytes — see webpWidth() for why bytes gave three false FAILs.
  const vurl = `${ORIGIN}${VARIANT_PREFIX}/w800${path}`;
  const [v1, v2] = await probePair(vurl);
  const vj = judgeStatic(v1, v2, row, { expectContentType: /^image\// });
  const vw = webpWidth(Buffer.from(v1.head, 'latin1'));
  if (vj.verdict === 'PASS') {
    if (vw == null || dw == null) {
      vj.notes.push('width unreadable — variant not asserted');
    } else if (dw > 800) {
      // Source is wide enough for w_800 to bite: it MUST resize, and to exactly 800.
      if (vw !== 800) { vj.verdict = 'FAIL'; vj.notes.push(`${dw}px source rendered ${vw}px, expected 800px — variant not applied`); }
      else if (v1.bytes >= r1.bytes) { vj.verdict = 'FAIL'; vj.notes.push(`800px render ${v1.bytes} B not smaller than ${dw}px default ${r1.bytes} B`); }
      else vj.notes.push(`${dw}px→${vw}px · ${v1.bytes} B < ${r1.bytes} B`);
    } else {
      // Source narrower than 800: c_limit must NOT enlarge, so identical is correct.
      if (vw !== dw) { vj.verdict = 'FAIL'; vj.notes.push(`${dw}px source rendered ${vw}px — c_limit UPSCALED`); }
      else vj.notes.push(`${dw}px source ≤ 800 — c_limit no-op, identical to default (correct)`);
    }
  }
  record({ category: 'w800', label: `${trait} · ${VARIANT_PREFIX}/w800`, url: vurl, ...vj,
    status: v1.status, bytes: v1.bytes, width: vw, cache: vj.seq, legacy: v1.legacyDelivery,
    contentType: v1.contentType, cacheControl: v1.cacheControl, raw: [v1, v2] });
}

/* DRUPAL DERIVATIVES — source recovery. Both shapes: with an appended format
 * and without. A dotted source name is included because the appended-format
 * strip is deliberately narrow and a dotted name is where it would misfire. */
console.log('\n── DRUPAL DERIVATIVES (source recovery) ──');
const derivativeSources = set.images
  .filter((i) => /\.(png|jpg|jpeg)$/i.test(i.row.sourcePath) && i.row.sourcePath.startsWith('/sites/default/files/'))
  .slice(0, 3);
for (const { trait, row } of derivativeSources) {
  const rest = row.sourcePath.replace('/sites/default/files/', '');
  const src = await probe(`${ORIGIN}${encodePath(row.sourcePath)}`);
  for (const [shape, suffix] of [['appended .webp', '.webp'], ['no appended format', '']]) {
    const dpath = encodePath(`/sites/default/files/styles/large_cover/public/${rest}`) + suffix;
    const url = `${ORIGIN}${dpath}?itok=8PbWFEFd`;
    const [d1, d2] = await probePair(url);
    const j = judgeStatic(d1, d2, row, { expectContentType: /^image\// });
    if (j.verdict === 'PASS') {
      j.notes.push(d1.bytes === src.bytes
        ? `bytes == source render (${d1.bytes})`
        : `bytes ${d1.bytes} vs source render ${src.bytes}`);
    }
    record({ category: 'derivative', label: `${shape} · ${trait}`, url, ...j,
      status: d1.status, bytes: d1.bytes, cache: j.seq, legacy: d1.legacyDelivery,
      contentType: d1.contentType, cacheControl: d1.cacheControl, raw: [d1, d2] });
  }
}

/* SVG — untransformed, byte-identical, NOT rasterised. */
console.log('\n── SVG (must arrive UNTRANSFORMED) ──');
for (const row of set.svgs) {
  const url = `${ORIGIN}${encodePath(row.sourcePath)}`;
  const [r1, r2] = await probePair(url);
  /* A SUBSTITUTED SVG GOES THROUGH THE RESOLVER, and must.
   *
   * The full-tree backfill brought in four `course/roadmap/…-&-Security*.svg`
   * files. Their public_id is lossy, so the static rule cannot express it and
   * they route to /legacy-file by design — where x-legacy-delivery is PRESENT.
   * judgeStatic treats that header as a bandwidth regression, which is right for
   * a static path and exactly wrong here, so it reported four correct files as
   * failures. The category is decided by the path, not assumed. */
  const viaResolver = /[&#]/.test(row.sourcePath);
  const j = viaResolver
    ? { verdict: 'PASS', notes: [], seq: `${r1.vercelCache ?? '-'}→${r2.vercelCache ?? '-'}` }
    : judgeStatic(r1, r2, row, { expectContentType: /svg/, expectBytes: row.sourceBytes });
  if (viaResolver && j.verdict === 'PASS') {
    if (r1.status !== 200) { j.verdict = 'FAIL'; j.notes.push(`status ${r1.status}`); }
    else if (r1.legacyDelivery !== 'resolver') { j.verdict = 'FAIL'; j.notes.push(`x-legacy-delivery "${r1.legacyDelivery || '(absent)'}" ≠ resolver`); }
    else if (!/svg/.test(r1.contentType)) { j.verdict = 'FAIL'; j.notes.push(`content-type ${r1.contentType}`); }
    else j.notes.push(`${r1.bytes} B via resolver (substituted id)`);
  }
  if (j.verdict !== 'INFRA' && !MAGIC.svg(Buffer.from(r1.head, 'latin1'))) {
    j.verdict = 'FAIL'; j.notes.push('body does not begin as SVG — rasterised?');
  }
  if (j.verdict === 'PASS' && !viaResolver) j.notes.push(`${r1.bytes} B == source`);
  record({ category: viaResolver ? 'svg/resolver' : 'svg', label: row.sourcePath, url, ...j,
    status: r1.status, bytes: r1.bytes, cache: j.seq, legacy: r1.legacyDelivery,
    contentType: r1.contentType, cacheControl: r1.cacheControl, raw: [r1, r2] });
}

/* DOCUMENTS — no-store, never cached, 206 on Range, full length intact. */
console.log('\n── DOCUMENTS (no-store; Range must be 206; full length intact) ──');
for (const { trait, row } of set.docs) {
  const url = `${ORIGIN}${encodePath(row.sourcePath)}`;
  const ext = extOf(row.sourcePath);
  const a = await probe(url);
  const b = await probe(url);
  const ranged = await probe(url, { range: 'bytes=0-1023' });
  const notes = [];
  let fail = false;
  if (a.infra || b.infra || ranged.infra) {
    record({ category: 'document', label: `${trait} · ${row.sourcePath}`, url, verdict: 'INFRA',
      notes: [`upstream ${a.status ?? a.error}`], status: a.status, bytes: a.bytes, raw: [a, b, ranged] });
    continue;
  }
  if (a.status !== 200) { fail = true; notes.push(`status ${a.status}`); }
  if (a.htmlBody) { fail = true; notes.push('body is HTML — error page wearing a 200'); }
  if (!NO_STORE_DOCUMENT_EXTENSIONS.includes(ext)) notes.push(`${ext} is not in the no-store set`);
  else {
    if (!/no-store/.test(a.cacheControl)) { fail = true; notes.push(`cache-control ${a.cacheControl || '(none)'} — not no-store`); }
    // Held OUT of the edge cache on EVERY request. A HIT here is the bug that
    // makes a ranged 200 possible, so a HIT is a FAIL even though bytes are fine.
    for (const [n, r] of [['1st', a], ['2nd', b], ['ranged', ranged]]) {
      if (/HIT/.test(r.vercelCache)) { fail = true; notes.push(`${n} request x-vercel-cache ${r.vercelCache} — document was CACHED`); }
    }
  }
  const magic = magicFor(a.contentType, ext);
  if (magic && !magic(Buffer.from(a.head, 'latin1'))) { fail = true; notes.push(`magic bytes wrong (${JSON.stringify(a.head.slice(0, 8))})`); }
  // THE TRUNCATION BUG: 200 with a correct partial body reads as a complete file.
  if (ranged.status !== 206) {
    fail = true;
    notes.push(`Range → ${ranged.status} NOT 206${ranged.contentRange ? ` (content-range ${ranged.contentRange}, ${ranged.bytes} B body — TRUNCATION)` : ''}`);
  } else {
    // A range WIDER than the entity is satisfied by the whole entity — correct
    // HTTP, and the case for any document under 1 KiB (there is a 329-byte .rar
    // in /files/document). Asserting a flat 1024 reported that as truncation.
    const span = Math.min(1024, row.sourceBytes);
    const want = `bytes 0-${span - 1}/${row.sourceBytes}`;
    if (ranged.contentRange !== want) { fail = true; notes.push(`content-range "${ranged.contentRange}" ≠ "${want}"`); }
    if (ranged.bytes !== span) { fail = true; notes.push(`ranged body ${ranged.bytes} B ≠ ${span}`); }
  }
  if (a.bytes !== row.sourceBytes) { fail = true; notes.push(`full body ${a.bytes} B ≠ source ${row.sourceBytes} B`); }
  else notes.push(`full ${a.bytes} B == source`);
  record({ category: 'document', label: `${trait} · ${row.sourcePath}`, url,
    verdict: fail ? 'FAIL' : 'PASS', notes, status: a.status, bytes: a.bytes,
    cache: `${a.vercelCache}/${b.vercelCache}/${ranged.vercelCache}`, legacy: a.legacyDelivery,
    contentType: a.contentType, cacheControl: a.cacheControl, rangeStatus: ranged.status,
    contentRange: ranged.contentRange, raw: [a, b, ranged] });
}

/* RESOLVER — the 6 ampersand files, BOTH spellings. */
console.log('\n── RESOLVER (6 ampersand files × literal & and %26) ──');
for (const row of set.ampersand) {
  /* Both spellings for `&`; ENCODED ONLY for `#`.
   *
   * A literal `#` is the URL fragment delimiter — a client strips it and
   * everything after it before the request is sent, so `…/Programming in C#.png`
   * would arrive as `…/Programming in C` and match nothing. Probing the literal
   * form would be asserting that an unreachable URL works. */
  const spellings = row.sourcePath.includes('#') ? ['encoded'] : ['literal', 'encoded'];
  for (const spelling of spellings) {
    const url = `${ORIGIN}${encodePath(row.sourcePath, { ampersand: spelling })}`;
    const r = await probe(url);
    const notes = [];
    let fail = false;
    if (r.infra) {
      record({ category: `resolver/${spelling}`, label: row.sourcePath, url, verdict: 'INFRA',
        notes: [`upstream ${r.status ?? r.error}`], status: r.status, bytes: r.bytes, raw: [r] });
      continue;
    }
    if (r.status !== 200) { fail = true; notes.push(`status ${r.status}`); }
    if (r.htmlBody) { fail = true; notes.push('body is HTML — error page wearing a 200'); }
    // The resolver is the ONLY path where this header must be PRESENT. Its
    // absence means the static rule swallowed the request, and the derived
    // Cloudinary URL for these was measured to return HTTP 400.
    if (r.legacyDelivery !== 'resolver') { fail = true; notes.push(`x-legacy-delivery "${r.legacyDelivery || '(absent)'}" ≠ resolver`); }
    if (!/^inline/.test(r.contentDisposition)) { fail = true; notes.push(`content-disposition "${r.contentDisposition || '(none)'}" not inline`); }
    if (!/^image\//.test(r.contentType)) { fail = true; notes.push(`content-type ${r.contentType || '(none)'}`); }
    const magic = magicFor(r.contentType, extOf(row.sourcePath));
    if (magic && !magic(Buffer.from(r.head, 'latin1'))) { fail = true; notes.push(`magic bytes wrong (${JSON.stringify(r.head.slice(0, 8))})`); }
    if (!fail) notes.push(`${r.bytes} B`);
    record({ category: `resolver/${spelling}`, label: row.sourcePath, url,
      verdict: fail ? 'FAIL' : 'PASS', notes, status: r.status, bytes: r.bytes,
      cache: r.vercelCache, legacy: r.legacyDelivery, contentType: r.contentType,
      cacheControl: r.cacheControl, raw: [r] });
  }
}

/* NON-'uploaded' ROWS THAT ARE STILL LIVE URLS — see buildProbeSet(). */
console.log("\n── status 'exists' / 'superseded' (real URLs, extra coverage) ──");
for (const row of set.others) {
  const url = `${ORIGIN}${encodePath(row.sourcePath)}`;
  const ext = extOf(row.sourcePath);
  /* DISPATCH BY EXTENSION, not by assuming an image.
   *
   * This category used to run judgeStatic with expectContentType /^image\//
   * against whatever was in it. The full-tree backfill put DOCUMENTS in it — the
   * case-fold PDF rulings and three 'exists' course outlines — so it asserted
   * `image/*` on a PDF and demanded a cache HIT on a no-store document, where a
   * HIT is the failure. Four healthy files reported as broken. */
  const isDoc = NO_STORE_DOCUMENT_EXTENSIONS.includes(ext);
  const [r1, r2] = isDoc ? [await probe(url), await probe(url)] : await probePair(url);
  const notes = [];
  let verdict = 'PASS';
  const fail = (m) => { verdict = 'FAIL'; notes.push(m); };

  if (r1.infra || r2.infra) {
    verdict = 'INFRA'; notes.push(`upstream ${r1.status ?? r1.error}`);
  } else if (isDoc) {
    if (r1.status !== 200) fail(`status ${r1.status}`);
    if (!MAGIC.pdf(Buffer.from(r1.head, 'latin1')) && ext === 'pdf') fail('not a PDF');
    if (!/no-store/.test(r1.cacheControl ?? '')) fail(`cache-control ${r1.cacheControl}`);
    if (/HIT/.test(r1.vercelCache ?? '') || /HIT/.test(r2.vercelCache ?? '')) fail(`document was CACHED (${r1.vercelCache}/${r2.vercelCache})`);
    const ranged = await probe(url, { range: 'bytes=0-1023' });
    if (ranged.status !== 206) fail(`Range → ${ranged.status} NOT 206`);
    // A superseded document resolves to the WINNER's bytes, so its own recorded
    // sourceBytes is the wrong yardstick — the assertion is that it is a whole,
    // valid document, which the 206 total and the %PDF- header establish.
    if (verdict === 'PASS') notes.push(`${row.status} · ${r1.bytes} B · no-store, Range 206 ${ranged.contentRange}`);
  } else {
    const j = judgeStatic(r1, r2, row, { expectContentType: /^image\// });
    verdict = j.verdict; notes.push(...j.notes);
    if (verdict === 'PASS') {
      const w = webpWidth(Buffer.from(r1.head, 'latin1'));
      notes.push(`${row.status} · ${w ?? '?'}px · ${r1.bytes} B`
        + (row.status === 'superseded' ? ' — path resolved to the surviving asset' : ''));
    }
  }
  record({ category: `status:${row.status}`, label: row.sourcePath, url, verdict, notes,
    status: r1.status, bytes: r1.bytes, cache: `${r1.vercelCache}/${r2.vercelCache}`,
    legacy: r1.legacyDelivery, contentType: r1.contentType, cacheControl: r1.cacheControl, raw: [r1, r2] });
}

/* THE THREE WEBROOT PDFs — EXPECTED TO SERVE.
 * BLOB_PUBLIC_BASE is set, so next.config emits one rewrite per entry in
 * src/lib/webrootDocuments.mjs — the SAME list iterated below, which is what
 * stops this harness from checking a document the rewrite no longer serves —
 * and these URLs resolve to the Blob store. A 200 whose body begins
 * %PDF- is the PASS, and the magic-byte check is the point: a 200 carrying an
 * HTML error page would be the worst of both.
 * A 404 is still ACCEPTED rather than failed — not as the expected answer but
 * as the pre-Blob one, meaning this particular deployment emitted no rewrite.
 * That is inert, not broken. Anything else means a catch-all rule is matching
 * at the site root, which is the dangerous failure. */
console.log('\n── WEBROOT PDFs (BLOB_PUBLIC_BASE set — expect 200 %PDF-) ──');
for (const file of WEBROOT_DOCUMENTS) {
  const url = `${ORIGIN}/${file}`;
  const r = await probe(url);
  /* Two legitimate outcomes, decided by whether the deployment has
   * BLOB_PUBLIC_BASE — which this script cannot see, so it reads the answer off
   * the response instead of asserting one:
   *
   *   404  the rewrite was never emitted → EXPECTED-INERT, as it was before the
   *        Blob store existed.
   *   200  the store is live → then it must actually be a PDF, because a 200
   *        carrying an HTML error page would be the worst of both.
   *
   * The old version asserted 404 unconditionally and reported all three as
   * failures the moment the Blob track went live — a stale expectation, not a
   * regression. */
  let verdict; const notes = [];
  if (r.infra) verdict = 'INFRA';
  else if (r.status === 404) { verdict = 'EXPECTED-INERT'; notes.push('404 — rewrite not emitted (BLOB_PUBLIC_BASE unset in this deployment)'); }
  else if (r.status === 200) {
    const isPdf = MAGIC.pdf(Buffer.from(r.head, 'latin1'));
    verdict = isPdf ? 'PASS' : 'FAIL';
    notes.push(isPdf ? `200 from Blob, ${r.bytes} B, %PDF- verified` : `200 but NOT a PDF (${JSON.stringify(r.head.slice(0, 8))})`);
    if (isPdf && !/no-store/.test(r.cacheControl ?? '')) notes.push(`NB cache-control ${r.cacheControl}`);
  } else { verdict = 'FAIL'; notes.push(`status ${r.status} — expected 200 (Blob live) or 404 (inert)`); }
  record({ category: 'webroot-pdf', label: `/${file}`, url, verdict, notes,
    status: r.status, bytes: r.bytes, cache: r.vercelCache, legacy: r.legacyDelivery,
    contentType: r.contentType, cacheControl: r.cacheControl, raw: [r] });
}

/* ── PER-PROBE TABLE ────────────────────────────────────────────────────── */
console.log('\n════ PER-PROBE ════');
console.log('verdict         category          st  cache        x-legacy-delivery  bytes      path');
for (const r of rows) {
  console.log(
    `${r.verdict.padEnd(15)} ${r.category.padEnd(17)} ${String(r.status ?? '-').padEnd(3)} `
    + `${(r.cache || '-').padEnd(12)} ${(r.legacy || '(absent)').padEnd(18)} `
    + `${String(r.bytes ?? '-').padStart(9)}  ${decodeURIComponent(r.url.replace(ORIGIN, ''))}`
  );
}

/* ── TALLY ──────────────────────────────────────────────────────────────── */
const tally = {};
for (const r of rows) {
  tally[r.category] ??= { PASS: 0, FAIL: 0, INFRA: 0, 'EXPECTED-INERT': 0 };
  tally[r.category][r.verdict] += 1;
}
console.log('\n════ TALLY ════');
console.log('category        PASS  FAIL  INFRA  INERT');
for (const [c, t] of Object.entries(tally)) {
  console.log(`${c.padEnd(16)}${String(t.PASS).padStart(4)}${String(t.FAIL).padStart(6)}`
    + `${String(t.INFRA).padStart(7)}${String(t['EXPECTED-INERT']).padStart(7)}`);
}
const fails = rows.filter((r) => r.verdict === 'FAIL');
const infra = rows.filter((r) => r.verdict === 'INFRA');
console.log(`\ntotal ${rows.length} probes · ${rows.filter((r) => r.verdict === 'PASS').length} PASS · `
  + `${fails.length} FAIL · ${infra.length} INFRA · ${rows.filter((r) => r.verdict === 'EXPECTED-INERT').length} EXPECTED-INERT`);
if (fails.length) {
  console.log('\nFAILS:');
  for (const f of fails) console.log(`  ✗ [${f.category}] ${f.label}\n      ${f.notes.join('; ')}\n      ${f.url}`);
}
console.log(`\n${fails.length === 0 && infra.length === 0 ? 'GO' : 'NO-GO'} — `
  + `${fails.length} real failures, ${infra.length} infrastructure/inconclusive.`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ origin: ORIGIN, tally, rows }, null, 1));
  console.log(`\nmeasurements → ${JSON_OUT}`);
}
process.exit(fails.length ? 1 : 0);
