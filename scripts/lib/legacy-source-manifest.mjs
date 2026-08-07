/**
 * Derivative resolution and the canonical SOURCE-FILE manifest.
 *
 * Imported by scripts/audit-legacy-file-urls.mjs, which owns the scanning and
 * the URL extraction. This module owns everything downstream of "we have a set
 * of unique legacy URLs": turning Drupal image-style derivatives back into the
 * source files they were generated from, applying the scope filters, and
 * writing the manifest.
 *
 * It lives in a separate file only because the audit script had already passed
 * 1200 lines. The extraction logic is NOT duplicated here — this module never
 * looks at a document or a stored string, only at the entries the scan already
 * produced. There is one scan, one moment in time, and every report written by
 * a run shares its timestamp.
 *
 * NO WRITES TO MONGO. This module does not receive a database handle and does
 * not import mongoose. It reads entries and writes files under reports/.
 *
 * ── WHY DERIVATIVES HAVE TO BE RESOLVED AT ALL ──────────────────────────────
 * A Drupal image-style URL looks like this:
 *
 *   /sites/default/files/styles/large_cover/public/articles/cover/foo.png.webp?itok=8PbWFEFd
 *    └──────── files dir ────────┘└─ style ─┘└scheme┘└──── path under files ────┘└─ HMAC ─┘
 *
 * Drupal generates that file lazily from the source, caches it under styles/,
 * and signs the URL with the site's private key. None of that survives the
 * shutdown: the cache is disposable, the key dies with the box, and the only
 * thing worth copying is
 *
 *   /sites/default/files/articles/cover/foo.png
 *
 * which is what this module computes. Two transformations, and the second is
 * the one that can go wrong:
 *
 *   1. Drop `styles/<style>/<scheme>/`. Mechanical, unambiguous.
 *   2. Drop the format extension Drupal APPENDED when the style converted the
 *      image. This is a SECOND extension — `foo.png.webp` is a webp derivative
 *      of `foo.png`, so `.webp` comes off and `.png` stays. When the style did
 *      not convert format, nothing was appended and nothing may be removed.
 *
 * Step 2 is a guess, because the stored path does not record which of those
 * happened. The guess is made only when the extension underneath is itself an
 * image extension, which is the case Drupal actually produces. Everything else
 * is left alone and FLAGGED rather than coerced — see below.
 *
 * ── CONFIDENCE IS NOT DECORATION ────────────────────────────────────────────
 * Every resolution carries `confidence` and a list of `reasons`. A low-
 * confidence resolution means the computed source path is a guess that a human
 * has to look at before anything is copied or rewritten. They are listed
 * individually in the report, never folded into a total, because a source path
 * that is quietly wrong produces a migration that quietly loses a file.
 *
 * Reasons, all of which leave the entry usable but suspect:
 *
 *   non-public-scheme          styles/<style>/private/… or /temporary/… — a
 *                              real Drupal shape, but not the public files dir
 *                              this migration is scoped to.
 *   no-scheme-segment          no public/private/temporary segment where one
 *                              was expected. The path under files/ is then a
 *                              guess about where the style segment ends.
 *   ambiguous-appended-ext     the name ends in an image format, but what sits
 *                              under it is NOT an image extension — e.g.
 *                              `report.2024.webp`. Could be a dotted filename
 *                              rather than an appended extension, so NOTHING is
 *                              stripped. Left for a human.
 *   triple-image-extension     three or more stacked image extensions
 *                              (`foo.png.webp.webp`). Only the last comes off.
 *   source-equals-derivative   resolution was a no-op where one was expected.
 *   empty-source               nothing left after stripping.
 *   same-style-collision       two DIFFERENT derivative URLs of the SAME style
 *                              resolved to one source. Same style cannot
 *                              legitimately produce two names for one source,
 *                              so one of the two resolutions is wrong.
 *   source-is-another-deriv    the computed source is itself a derivative URL
 *                              seen elsewhere in the scan — a derivative of a
 *                              derivative, which should not exist.
 *
 * NOTE what is deliberately NOT a collision: two derivatives of DIFFERENT
 * styles resolving to the same source. That is the normal case — one image
 * rendered at two sizes — and flagging it would bury the real anomalies under
 * hundreds of false ones.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The extension vocabulary of the appended-format strip.
 *
 * IMPORTED, not defined here. next.config.mjs builds its styles/ rewrite
 * pattern from the same sets, and the production build must not depend on
 * scripts/ — so src/lib/legacyTransforms.mjs owns them and both consumers read
 * from there.
 *
 * A rewrite is a regex and cannot call resolveDerivative() per request, so the
 * pattern and this function can still drift even sharing a vocabulary. That is
 * what test/pure/legacyDerivativeRewrite.test.mjs pins: it asserts the rewrite
 * and resolveDerivative() agree on a corpus of real paths.
 */
import { APPENDED_FORMATS, IMAGE_EXTENSIONS, FILES_DIR } from '../../src/lib/legacyTransforms.mjs';

/** Drupal stream wrappers that can appear where `public` normally sits. */
const KNOWN_SCHEMES = new Set(['public', 'private', 'temporary']);

const STYLE_PREFIX_RE = /^\/sites\/default\/files\/styles\/([^/]+)\/(.*)$/i;

// ── shared path helpers (single home — the audit script imports these) ──────

/** The path without its query string or fragment. */
export function pathOnly(p) {
  const cut = p.search(/[?#]/);
  return cut === -1 ? p : p.slice(0, cut);
}

export function extensionOf(decodedPath) {
  const last = pathOnly(decodedPath).split('/').filter(Boolean).pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot <= 0 || dot === last.length - 1) return '(none)';
  const ext = last.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '(none)';
}

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── step 2: the appended-extension strip ────────────────────────────────────

/**
 * Remove the format extension Drupal appended, if it appended one.
 *
 * Returns `{ name, appended, reasons }`. `appended` is null when nothing was
 * removed — which is a perfectly ordinary outcome for a style that did not
 * convert format, and is NOT flagged.
 *
 * The rule is deliberately narrow: strip only when the LAST extension is a
 * format Drupal converts to AND the extension underneath it is itself an image
 * extension. `foo.png.webp` → `foo.png`. `report.2024.webp` is left alone,
 * because `2024` is not an image extension and that is far more likely to be a
 * dotted filename than a Drupal conversion — but it is flagged, because from
 * a styles/ path we cannot actually be sure.
 */
function stripAppendedExtension(fileName) {
  const reasons = [];
  const parts = fileName.split('.');

  // Fewer than two extensions: nothing could have been appended.
  if (parts.length < 3) return { name: fileName, appended: null, reasons };

  const last = parts[parts.length - 1].toLowerCase();
  const beneath = parts[parts.length - 2].toLowerCase();

  if (!APPENDED_FORMATS.has(last)) {
    // Ends in something Drupal never converts to — an ordinary dotted name.
    return { name: fileName, appended: null, reasons };
  }

  if (!IMAGE_EXTENSIONS.has(beneath)) {
    // `report.2024.webp`. Stripping would invent `report.2024`. Refuse, flag.
    reasons.push('ambiguous-appended-ext');
    return { name: fileName, appended: null, reasons };
  }

  // `foo.png.webp.webp` — strip one layer only and say so.
  if (parts.length >= 4 && IMAGE_EXTENSIONS.has(parts[parts.length - 3].toLowerCase())) {
    reasons.push('triple-image-extension');
  }

  return { name: parts.slice(0, -1).join('.'), appended: last, reasons };
}

// ── step 1 + 2 together ─────────────────────────────────────────────────────

/**
 * Resolve one decoded path. Returns null when the path is not a derivative at
 * all — callers treat that as "this URL is already a source file".
 */
export function resolveDerivative(decodedPath) {
  const clean = pathOnly(decodedPath);
  const m = STYLE_PREFIX_RE.exec(clean);
  if (!m) return null;

  const [, style, afterStyle] = m;
  const reasons = [];

  // The scheme segment: `public` in every case this migration cares about.
  const slash = afterStyle.indexOf('/');
  const head = (slash === -1 ? afterStyle : afterStyle.slice(0, slash)).toLowerCase();
  let underFiles;

  if (head === 'public') {
    underFiles = slash === -1 ? '' : afterStyle.slice(slash + 1);
  } else if (KNOWN_SCHEMES.has(head)) {
    reasons.push('non-public-scheme');
    underFiles = slash === -1 ? '' : afterStyle.slice(slash + 1);
  } else {
    // No scheme segment. Where the style segment ends is now a guess.
    reasons.push('no-scheme-segment');
    underFiles = afterStyle;
  }

  const segments = underFiles.split('/').filter(Boolean);
  const fileName = segments.pop() ?? '';
  const strip = stripAppendedExtension(fileName);
  reasons.push(...strip.reasons);

  const sourcePath = `${FILES_DIR}/${[...segments, strip.name].filter(Boolean).join('/')}`;

  if (!strip.name) reasons.push('empty-source');
  if (sourcePath === clean) reasons.push('source-equals-derivative');

  return {
    derivativePath: clean,
    style,
    scheme: head,
    sourcePath,
    appendedExtension: strip.appended,
    tokenised: /[?&]itok=/i.test(decodedPath),
    confidence: reasons.length ? 'low' : 'high',
    reasons,
  };
}

/**
 * Cross-entry checks that a single path cannot detect on its own. Mutates the
 * `derivative` object already attached to each entry, appending reasons and
 * downgrading confidence.
 *
 * Two derivatives of DIFFERENT styles sharing a source is normal and is not
 * flagged here — see the header.
 */
export function flagResolutionCollisions(derivativeEntries) {
  const derivativePaths = new Set(derivativeEntries.map((e) => e.derivative.derivativePath));

  // A computed source that is itself a derivative URL seen in this scan.
  for (const e of derivativeEntries) {
    if (derivativePaths.has(e.derivative.sourcePath)) {
      e.derivative.reasons.push('source-is-another-deriv');
      e.derivative.confidence = 'low';
    }
  }

  // Same style, same computed source, different derivative path: one of the
  // two strips must be wrong, because a single style renders a source once.
  const byStyleSource = new Map();
  for (const e of derivativeEntries) {
    const key = `${e.derivative.style} ${e.derivative.sourcePath}`;
    if (!byStyleSource.has(key)) byStyleSource.set(key, []);
    byStyleSource.get(key).push(e);
  }
  for (const group of byStyleSource.values()) {
    const distinct = new Set(group.map((e) => e.derivative.derivativePath));
    if (distinct.size < 2) continue;
    for (const e of group) {
      e.derivative.reasons.push('same-style-collision');
      e.derivative.confidence = 'low';
    }
  }
}

// ── scope filters ───────────────────────────────────────────────────────────

/**
 * Applied as REPORTED filters, never as silent drops: every manifest entry
 * carries `inScope` plus the reasons it was excluded, both sets are written
 * out, and the report prints how many unique source files each filter removed.
 * Reversing one is a matter of ignoring a flag, not re-running anything.
 *
 * The first two are the ones that were asked for. The third is MINE and is
 * called out as such in the report so it can be overruled: without it a
 * "source file manifest" contains 389 extensionless Drupal page URLs, which
 * are a redirect problem rather than files to copy.
 */
export const SCOPE_FILTERS = [
  {
    id: 'webhook-logs-only',
    label: 'referenced ONLY from webhook_logs.*',
    why: 'Frozen inbound payload logs. Never re-rendered, so nothing points a user at these.',
    requested: true,
  },
  {
    id: 'file-singular-root',
    label: 'under the /file/ singular root',
    why: 'Explicitly out of scope for this migration.',
    requested: true,
  },
  {
    id: 'page-link-not-a-file',
    label: 'extensionless page links, not files',
    why: 'NOT a requested filter — added here because a source-FILE manifest should not '
       + 'contain Drupal page URLs. Overrule by ignoring this flag.',
    requested: false,
  },
];

function exclusionsFor(sourceEntry) {
  const out = [];
  const collections = sourceEntry.collections;
  if (collections.size > 0 && [...collections].every((c) => c === 'webhook_logs')) {
    out.push('webhook-logs-only');
  }
  if (sourceEntry.roots.size > 0 && [...sourceEntry.roots].every((r) => r === 'file')) {
    out.push('file-singular-root');
  }
  const allPageLinks = sourceEntry.contributingUrls.every((u) => u.root === 'other' && u.extension === '(none)');
  if (allPageLinks) out.push('page-link-not-a-file');
  return out;
}

// ── the manifest ────────────────────────────────────────────────────────────

/**
 * Collapse unique URLs onto unique SOURCE files.
 *
 * A source file referenced directly in one place and through a derivative in
 * another becomes ONE entry — that is the whole point, and it is why the key is
 * the source path rather than the stored path.
 *
 * `maxSites` bounds the merged reference list the same way the scan bounds its
 * own; the count is always complete even when the list is truncated.
 */
export function buildSourceManifest(entries, { maxSites = 500 } = {}) {
  const bySource = new Map();

  for (const entry of entries) {
    const deriv = entry.derivative ?? null;
    const sourcePath = deriv ? deriv.sourcePath : pathOnly(entry.decodedPath);

    let s = bySource.get(sourcePath);
    if (!s) {
      s = {
        sourcePath,
        extension: extensionOf(sourcePath),
        roots: new Set(),
        styles: new Set(),
        collections: new Set(),
        contributingUrls: [],
        refCount: 0,
        directRefCount: 0,
        derivativeRefCount: 0,
        confidence: 'high',
        confidenceReasons: new Set(),
        tokenisedRefs: 0,
        sites: [],
        sitesTruncated: 0,
      };
      bySource.set(sourcePath, s);
    }

    s.roots.add(entry.root);
    for (const c of entry.collections) s.collections.add(c);
    s.refCount += entry.refCount;
    s.contributingUrls.push({
      decodedPath: entry.decodedPath,
      root: entry.root,
      extension: entry.extension,
      refCount: entry.refCount,
      isDerivative: Boolean(deriv),
      style: deriv?.style ?? null,
      confidence: deriv?.confidence ?? 'high',
    });

    if (deriv) {
      s.styles.add(deriv.style);
      s.derivativeRefCount += entry.refCount;
      if (deriv.tokenised) s.tokenisedRefs += entry.refCount;
      if (deriv.confidence === 'low') {
        s.confidence = 'low';
        for (const r of deriv.reasons) s.confidenceReasons.add(r);
      }
    } else {
      s.directRefCount += entry.refCount;
    }

    for (const site of entry.sites) {
      if (s.sites.length < maxSites) s.sites.push(site);
      else s.sitesTruncated += 1;
    }
    s.sitesTruncated += entry.sitesTruncated;
  }

  const sources = [...bySource.values()];
  for (const s of sources) {
    s.reachedOnlyViaDerivatives = s.derivativeRefCount > 0 && s.directRefCount === 0;
    s.exclusionReasons = exclusionsFor(s);
    s.inScope = s.exclusionReasons.length === 0;
  }

  sources.sort((a, b) => b.refCount - a.refCount || a.sourcePath.localeCompare(b.sourcePath));

  // Per-filter removal counts. Computed against the full set, so a source
  // caught by two filters is counted under both — the report says so.
  const removedBy = new Map(SCOPE_FILTERS.map((f) => [f.id, 0]));
  for (const s of sources) {
    for (const r of s.exclusionReasons) removedBy.set(r, (removedBy.get(r) ?? 0) + 1);
  }

  return {
    sources,
    inScope: sources.filter((s) => s.inScope),
    removedBy,
    stats: {
      totalSources: sources.length,
      inScopeSources: sources.filter((s) => s.inScope).length,
      reachedOnlyViaDerivatives: sources.filter((s) => s.reachedOnlyViaDerivatives).length,
      lowConfidence: sources.filter((s) => s.confidence === 'low').length,
    },
  };
}

// ── writers ─────────────────────────────────────────────────────────────────

const serialise = (s, checked) => ({
  sourcePath: s.sourcePath,
  extension: s.extension,
  roots: [...s.roots].sort(),
  styles: [...s.styles].sort(),
  refCount: s.refCount,
  directRefCount: s.directRefCount,
  derivativeRefCount: s.derivativeRefCount,
  reachedOnlyViaDerivatives: s.reachedOnlyViaDerivatives,
  tokenisedRefs: s.tokenisedRefs,
  confidence: s.confidence,
  confidenceReasons: [...s.confidenceReasons].sort(),
  inScope: s.inScope,
  exclusionReasons: s.exclusionReasons,
  contributingUrls: s.contributingUrls,
  collections: [...s.collections].sort(),
  sites: s.sites,
  sitesTruncated: s.sitesTruncated,
  ...(checked ? { sourceCheck: s.sourceCheck ?? null } : {}),
});

function manifestCsv(sources, checked) {
  const header = [
    'source_path', 'extension', 'in_scope', 'exclusion_reasons', 'ref_count',
    'direct_refs', 'derivative_refs', 'reached_only_via_derivatives',
    'roots', 'styles', 'confidence', 'confidence_reasons', 'collections',
    'first_collection', 'first_field_path', 'first_id',
    ...(checked ? ['source_http_status', 'source_content_length', 'source_check_error'] : []),
  ];
  const lines = [header.join(',')];
  for (const s of sources) {
    const s0 = s.sites[0] ?? {};
    lines.push([
      s.sourcePath, s.extension, s.inScope ? 'yes' : 'no', s.exclusionReasons.join(' '),
      s.refCount, s.directRefCount, s.derivativeRefCount,
      s.reachedOnlyViaDerivatives ? 'yes' : '',
      [...s.roots].sort().join(' '), [...s.styles].sort().join(' '),
      s.confidence, [...s.confidenceReasons].sort().join(' '),
      [...s.collections].sort().join(' '),
      s0.collection ?? '', s0.fieldPath ?? '', s0._id ?? '',
      ...(checked ? [s.sourceCheck?.status ?? '', s.sourceCheck?.contentLength ?? '', s.sourceCheck?.error ?? ''] : []),
    ].map(csvCell).join(','));
  }
  // BOM so Excel decodes the Thai filenames as UTF-8 rather than the system
  // codepage. CRLF for the same reason.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Writes the manifest three ways: one JSON holding the FULL set with an
 * `inScope` flag on every entry, and two CSVs — full and in-scope — so the
 * "emit it twice" requirement holds without duplicating rows inside the JSON.
 */
export function writeSourceManifest(manifest, meta, checked, dir, stamp) {
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, `source-manifest-${stamp}.json`);
  const csvPath = path.join(dir, `source-manifest-${stamp}.csv`);
  const inScopeCsvPath = path.join(dir, `source-manifest-in-scope-${stamp}.csv`);

  const payload = {
    generatedAt: new Date().toISOString(),
    database: meta.database,
    legacyHost: meta.legacyHost,
    checked,
    note: 'One entry per unique SOURCE file on the legacy server. Drupal image-style '
        + 'derivatives are collapsed onto the source they were generated from, and a file '
        + 'referenced both directly and via a derivative is ONE entry. sourcePath for a '
        + 'derivative is COMPUTED, not observed — see confidence/confidenceReasons.',
    scopeFilters: SCOPE_FILTERS.map((f) => ({
      ...f,
      uniqueSourcesRemoved: manifest.removedBy.get(f.id) ?? 0,
    })),
    totals: {
      uniqueSourceFiles: manifest.stats.totalSources,
      inScope: manifest.stats.inScopeSources,
      excluded: manifest.stats.totalSources - manifest.stats.inScopeSources,
      reachedOnlyViaDerivatives: manifest.stats.reachedOnlyViaDerivatives,
      lowConfidenceResolutions: manifest.stats.lowConfidence,
    },
    sources: manifest.sources.map((s) => serialise(s, checked)),
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, manifestCsv(manifest.sources, checked), 'utf8');
  fs.writeFileSync(inScopeCsvPath, manifestCsv(manifest.inScope, checked), 'utf8');

  return { jsonPath, csvPath, inScopeCsvPath };
}
