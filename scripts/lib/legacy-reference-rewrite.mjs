/**
 * PHASE 2 — CLASSIFYING AND REWRITING ONE STORED REFERENCE.
 *
 * Pure. No database, no network, no filesystem. Everything here is a function
 * of (raw stored string, resolved facts passed in), which is what makes it
 * testable and what makes the dry run trustworthy: the driver decides nothing.
 *
 * ══ WHY THIS PHASE EXISTS ═══════════════════════════════════════════════════
 *
 * A reference stored as `https://www.9experttraining.com/sites/default/files/…`
 * never reaches our rewrite rules at all. The browser resolves that host and
 * goes straight to the legacy box. /articles renders today because that box is
 * still running — not because the delivery layer is doing anything. Phase 1
 * built a delivery layer that nothing currently uses. This is the phase that
 * connects them, and until it runs, shutting the legacy server down breaks the
 * site.
 *
 * ══ WHAT A REWRITTEN REFERENCE LOOKS LIKE ═══════════════════════════════════
 *
 *   https://www.9experttraining.com/sites/default/files/articles/cover/x.png
 *   → /sites/default/files/articles/cover/x.png
 *
 * Root-relative. No host. NO TRANSFORMATION, NO WIDTH, NO QUERY.
 *
 * The legacy path SHAPE is kept rather than replaced with something tidier,
 * for three reasons that all point the same way: the rewrite rules for this
 * shape are built and tested, external copies of these URLs need the shape to
 * keep working whatever we store, and a second shape would mean maintaining
 * two rule sets forever for no user-visible gain.
 *
 * A width or a format in a stored value is the Drupal mistake this whole
 * project is undoing — `styles/large_cover` is in the database precisely
 * because someone once thought a rendering decision belonged next to the data.
 * Delivery owns that. See src/lib/legacyTransforms.mjs.
 *
 * ══ THE RULE THAT GOVERNS EVERY DECISION HERE ═══════════════════════════════
 *
 * OPERATE ON THE RAW BYTES, VERIFY AGAINST THE DECODED FORM.
 *
 * A stored reference may be percent-encoded, may carry `&amp;` because it was
 * serialised into HTML, and may be both. Decoding it, transforming it, and
 * re-encoding it would silently normalise thousands of values — a diff we
 * could never audit and could never fully revert. So every replacement is
 * built by cutting the raw string, and the result is CHECKED against what
 * resolveDerivative() computes from the decoded form. If the two disagree the
 * reference is left alone and reported, never guessed at.
 */

import { pathOnly, resolveDerivative } from './legacy-source-manifest.mjs';
import { classifyRoot, decodePath, toPath } from './legacy-url-extract.mjs';

/**
 * What happened to one reference. Every reference lands in exactly one of
 * these, and only the first four ever produce a write.
 */
export const CLASS = {
  /** 1. Absolute or protocol-relative URL on the legacy host → root-relative. */
  DIRECT: 'direct-absolute',
  /** 2. Drupal styles/ derivative → the SOURCE path, not the derivative path. */
  DERIVATIVE: 'derivative',
  /** 3. The one superseded .jpeg → the surviving .png's path. */
  SUPERSEDED: 'superseded',
  /** 4. An ampersand file. Path unchanged; the resolver already handles it. */
  AMPERSAND: 'ampersand',
  /**
   * 5. The PATTERN refused, and the migration manifest answered instead.
   *
   * Deliberately a separate class from the pattern-resolved ones so the report
   * shows which references rest on EVIDENCE (this file was downloaded from the
   * legacy server and uploaded) rather than on a rule about path shape.
   */
  MANIFEST_RESOLVED: 'manifest-resolved',

  /** Already correct. MUST come out byte-identical. */
  ALREADY_RELATIVE: 'already-root-relative',
  /** Confirmed dead on the legacy server. Deliberately left broken and visible. */
  DEAD: 'dead',
  /** A page link, not a file reference. Out of scope for a file migration. */
  NOT_A_FILE: 'not-a-file',
  /** The script could not decide. Reported in full, never rewritten. */
  UNCLASSIFIED: 'unclassified',
};

/** Roots that name a FILE on the legacy box. Anything else is a page. */
const FILE_ROOTS = new Set([
  'sites-default-files', 'download', 'file', 'files', 'images', 'webroot-file',
]);

const HOST_PREFIX_RE = /^(?:https?:)?\/\/(?:www\.)?9experttraining\.com(?::\d+)?/i;

/** Split a raw path-ish string into its path part and its query+fragment tail. */
function splitQuery(raw) {
  const cut = raw.search(/[?#]/);
  return cut === -1 ? { path: raw, tail: '' } : { path: raw.slice(0, cut), tail: raw.slice(cut) };
}

/**
 * Strip scheme and host from a raw reference WITHOUT touching the path bytes.
 *
 * Returns null when the string is not on the legacy host and is not already a
 * root-relative path — i.e. when it is something this phase has no business
 * rewriting.
 */
function rawRootRelative(raw) {
  if (HOST_PREFIX_RE.test(raw)) {
    const stripped = raw.replace(HOST_PREFIX_RE, '');
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return raw.startsWith('/') ? raw : null;
}

/**
 * Remove the `styles/<style>/<scheme>/` segment and the appended format
 * extension from a RAW (still-encoded) path.
 *
 * This deliberately mirrors resolveDerivative() structurally rather than
 * calling it, because resolveDerivative works on the decoded form and its
 * output cannot be re-encoded back to the original's byte shape. The caller
 * verifies the two agree.
 *
 * Returns null when the shape does not match, which is not an error — most
 * paths are not derivatives.
 */
function stripDerivativeRaw(rawPath, appendedFormats, imageExtensions) {
  const m = /^\/sites\/default\/files\/styles\/([^/]+)\/([^/]+)\/(.*)$/i.exec(rawPath);
  if (!m) return null;
  const [, , scheme, rest] = m;
  // Only the `public` stream wrapper is handled by pattern. `private` and
  // `temporary` are flagged low-confidence by resolveDerivative and are left
  // to the disagreement check below to reject.
  if (scheme.toLowerCase() !== 'public') return null;

  const segments = rest.split('/');
  const fileName = segments.pop() ?? '';
  const parts = fileName.split('.');

  let stripped = fileName;
  if (parts.length >= 3) {
    const last = parts[parts.length - 1].toLowerCase();
    const beneath = parts[parts.length - 2].toLowerCase();
    // Strip ONLY when Drupal could have appended this AND what sits under it is
    // itself an image extension. `report.2024.webp` must survive: `2024` is not
    // an image extension, so `.webp` is the real extension of a dotted name and
    // stripping it would invent a file that was never uploaded.
    if (appendedFormats.has(last) && imageExtensions.has(beneath)) {
      stripped = parts.slice(0, -1).join('.');
    }
  }

  return `/sites/default/files/${[...segments, stripped].filter(Boolean).join('/')}`;
}

/**
 * Classify one extracted reference and, when it should change, produce the
 * exact replacement string.
 *
 * `ctx` carries the facts this module refuses to look up for itself:
 *   deadPaths        Set of decoded path-only strings confirmed not to resolve.
 *   supersededBy     Map decoded sourcePath → decoded replacement path.
 *   ampersandPaths   Set of decoded path-only strings whose public_id was
 *                    substituted, so they must go through the resolver.
 *   appendedFormats  \ the derivative vocabulary, from
 *   imageExtensions  / src/lib/legacyTransforms.mjs
 *
 * Returns `{ cls, replacement, reason, decodedPath, targetPath }`.
 * `replacement === null` means leave the bytes exactly as they are.
 */
export function classifyReference(raw, ctx) {
  const {
    deadPaths, supersededBy, ampersandPaths, appendedFormats, imageExtensions,
  } = ctx;

  const decodedFull = decodePath(toPath(raw)).decoded;
  const decodedPathOnly = pathOnly(decodedFull);
  const root = classifyRoot(decodedFull);

  const nothing = (cls, reason) => ({
    cls, replacement: null, reason, decodedPath: decodedPathOnly, targetPath: decodedPathOnly,
  });

  // ── not a file at all ────────────────────────────────────────────────────
  // Page links (`/articles/…`, `/registration/public?…`) match the audit's
  // host pattern but are not file references. Rewriting them would silently
  // repoint a link at OUR route of the same name, which is a content decision
  // and not a file migration.
  if (!FILE_ROOTS.has(root)) return nothing(CLASS.NOT_A_FILE, `root=${root}`);

  const rootRelative = rawRootRelative(raw);
  if (rootRelative === null) {
    return nothing(CLASS.UNCLASSIFIED, 'neither on the legacy host nor root-relative');
  }

  const { path: rawPathPart } = splitQuery(rootRelative);

  // ── class 2: Drupal derivative ───────────────────────────────────────────
  const derivative = resolveDerivative(decodedFull);
  if (derivative) {
    const strippedRaw = stripDerivativeRaw(rawPathPart, appendedFormats, imageExtensions);
    if (strippedRaw === null) {
      return nothing(
        CLASS.UNCLASSIFIED,
        `resolveDerivative recognised a derivative the raw strip did not (scheme/shape mismatch)`,
      );
    }
    // THE AGREEMENT CHECK. Two encodings of one rule; if they disagree about
    // this path, we do not get to pick a winner.
    const strippedDecoded = decodePath(strippedRaw).decoded;
    if (strippedDecoded !== derivative.sourcePath) {
      return nothing(
        CLASS.UNCLASSIFIED,
        `raw strip → ${strippedDecoded} but resolveDerivative → ${derivative.sourcePath}`,
      );
    }
    if (derivative.confidence !== 'high') {
      // THE PATTERN REFUSES, AND IT IS RIGHT TO. From the path alone there is
      // no way to tell a Drupal-appended extension from a genuinely dotted
      // filename — `thailand-4.0.png` could be either, and a rule that picked
      // one would pick wrong somewhere nobody would ever look.
      //
      // The candidate is carried out with the refusal so the MANIFEST layer
      // (resolveFromManifest, below) can answer from evidence. This function
      // does not consult it and must never learn from it: the pattern's job is
      // to know what it cannot know.
      return {
        ...nothing(CLASS.UNCLASSIFIED, `low-confidence derivative: ${derivative.reasons.join(', ')}`),
        candidate: strippedRaw,
        candidateDecoded: derivative.sourcePath,
      };
    }
    if (deadPaths.has(derivative.sourcePath)) {
      return { ...nothing(CLASS.DEAD, 'derivative source is confirmed dead'), targetPath: derivative.sourcePath };
    }
    return {
      cls: CLASS.DERIVATIVE,
      replacement: strippedRaw === raw ? null : strippedRaw,
      reason: `styles/${derivative.style} stripped`,
      decodedPath: decodedPathOnly,
      targetPath: derivative.sourcePath,
    };
  }

  // ── class 3: the superseded .jpeg ────────────────────────────────────────
  const supersedes = supersededBy.get(decodedPathOnly);
  if (supersedes) {
    if (deadPaths.has(supersedes)) {
      return { ...nothing(CLASS.DEAD, 'superseding file is confirmed dead'), targetPath: supersedes };
    }
    // The replacement is CONSTRUCTED from the migration record, which stores
    // decoded paths. This is the one case where a decoded value is written
    // back, and it is safe only because the record's path is plain ASCII —
    // asserted by the caller before the run starts.
    return {
      cls: CLASS.SUPERSEDED,
      replacement: supersedes,
      reason: 'superseded by the surviving .png',
      decodedPath: decodedPathOnly,
      targetPath: supersedes,
    };
  }

  // ── dead, for everything that resolves to itself ─────────────────────────
  if (deadPaths.has(decodedPathOnly)) {
    return nothing(CLASS.DEAD, 'confirmed dead on the legacy server');
  }

  // ── class 4: an ampersand file ───────────────────────────────────────────
  // Counted separately because it is the one class where the delivered path is
  // NOT the Cloudinary public_id — the resolver looks it up. The rewrite is
  // otherwise identical to class 1: strip the host, keep the path.
  const isAmpersand = ampersandPaths.has(decodedPathOnly);

  // ── class 1 / 4: strip host and query, keep the path bytes ───────────────
  const replacement = rawPathPart;
  if (replacement === raw) {
    return nothing(CLASS.ALREADY_RELATIVE, isAmpersand ? 'ampersand file, already correct' : 'already correct');
  }
  return {
    cls: isAmpersand ? CLASS.AMPERSAND : CLASS.DIRECT,
    replacement,
    reason: HOST_PREFIX_RE.test(raw) ? 'host stripped' : 'query/fragment stripped',
    decodedPath: decodedPathOnly,
    targetPath: decodedPathOnly,
  };
}

/**
 * THE EVIDENCE LAYER. Runs ONLY where classifyReference() refused.
 *
 * ══ WHY THIS IS A SEPARATE FUNCTION AND NOT A BETTER RULE ═══════════════════
 *
 * `legacy_file_migrations` records only files that were actually DOWNLOADED
 * from the legacy server and UPLOADED successfully. It therefore answers the
 * exact question a path cannot: does this file exist?
 *
 * For `/styles/large_cover/public/articles/cover/thailand-4.0.png` the two
 * readings are `thailand-4.0.png` (dotted filename, nothing appended) and
 * `thailand-4.0` (Drupal appended `.png`). Measured against the manifest:
 *
 *     thailand-4.0.png        FOUND, status=uploaded, 212186 bytes
 *     thailand-4.0            absent
 *
 * That is not a better guess, it is an observation. All three refused
 * references resolved the same way, and all three stripped alternatives are
 * absent from the manifest.
 *
 * ── WHY THE PATTERN MUST NOT ABSORB THIS ────────────────────────────────────
 * It would be easy to teach stripAppendedExtension() "do not strip when the
 * segment beneath is numeric". That rule would be right for these three and
 * wrong for the first file someone uploads called `chart.2.webp` that really
 * was converted. The pattern's correctness comes from refusing; the manifest's
 * comes from having looked. Keeping them in separate functions keeps the
 * report able to say which references rest on which — see CLASS.MANIFEST_RESOLVED.
 *
 * `manifestHas(decodedPath)` must return true only for a record with status
 * `uploaded`. A row that exists in the manifest but failed to upload is
 * evidence of the opposite.
 */
export function resolveFromManifest(result, ctx) {
  if (result.cls !== CLASS.UNCLASSIFIED) return result;
  if (!result.candidate) return result;

  const { manifestHas, deadPaths } = ctx;
  if (!manifestHas(result.candidateDecoded)) {
    return {
      ...result,
      reason: `${result.reason}; candidate ${result.candidateDecoded} is NOT in the migration manifest`,
    };
  }
  if (deadPaths.has(result.candidateDecoded)) {
    return {
      ...result,
      cls: CLASS.DEAD,
      replacement: null,
      targetPath: result.candidateDecoded,
      reason: 'manifest-resolved candidate is confirmed dead',
    };
  }
  return {
    cls: CLASS.MANIFEST_RESOLVED,
    replacement: result.candidate,
    reason: `pattern refused (${result.reason}); manifest confirms the candidate was uploaded`,
    decodedPath: result.decodedPath,
    targetPath: result.candidateDecoded,
  };
}

/**
 * Apply a set of range replacements to one field value.
 *
 * Splices by offset, back to front so earlier offsets stay valid. The string
 * between two replacements is copied verbatim and never parsed — no HTML is
 * re-serialised, no whitespace is normalised, no entity is touched. A
 * formatting-only diff across 479 article bodies would be indistinguishable
 * from a real change if this ever has to be audited, so there are none.
 *
 * `edits` is `[{ start, end, replacement }]`; overlapping ranges throw rather
 * than silently corrupt, because extractLegacyUrls guarantees they cannot
 * overlap and a violation means that guarantee broke.
 */
export function applyEdits(original, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error(
        `overlapping edits at ${sorted[i - 1].start}-${sorted[i - 1].end} and ${sorted[i].start}-${sorted[i].end}`,
      );
    }
  }
  let out = original;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const e = sorted[i];
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

/** Classes that produce a write. Everything else is left byte-identical. */
export const REWRITING_CLASSES = new Set([
  CLASS.DIRECT, CLASS.DERIVATIVE, CLASS.SUPERSEDED, CLASS.AMPERSAND, CLASS.MANIFEST_RESOLVED,
]);

/** What an unencodable superseded replacement earns. */
export const ENCODING_GATE = {
  OK: 'ok',
  WARN: 'warn',
  DIE: 'die',
};

/**
 * THE ENCODING GUARANTEE, SPLIT BY REACHABILITY.
 *
 * ══ THE PROBLEM THIS SOLVES ═════════════════════════════════════════════════
 *
 * `superseded` is the only class that writes back a DECODED path — it is taken
 * from the migration record rather than from the reference — so it is the only
 * class whose replacement has to be plain ASCII. That guarantee used to be a
 * startup assertion over the WHOLE superseded map, which meant one row that
 * could never produce a rewrite halted every run. One does: a course cover with
 * literal spaces in its filename, referenced nowhere except inside
 * legacy_file_migrations, which the rewrite excludes.
 *
 * ══ WHY `phase` IS THE RIGHT AXIS ═══════════════════════════════════════════
 *
 * Reachability is not knowable at load: whether a superseded path is referenced
 * in a rewritable collection is exactly what the scan is about to find out. But
 * it IS knowable at the write point, where it is knowable trivially — code that
 * has reached that line is about to write the value, so the row is reachable by
 * definition. `phase` is therefore not a proxy for reachability; it is where
 * reachability stops being a question.
 *
 *   'load'   → WARN. Name the row, keep going.
 *   'write'  → DIE.  The guarantee lands exactly where the value is stored.
 *
 * ══ WHY THE WARNING IS NOT SUPPRESSED FOR UNREACHABLE ROWS ══════════════════
 *
 * Same reasoning as the `pinTie` tripwire in src/lib/articleRank.js: a branch
 * that should be unreachable is worth reporting when it fires, because "should
 * be" is a claim about data that can change. If one of these rows ever starts
 * being referenced in content, the warning is the notice that arrives BEFORE
 * the die — one run earlier, and in a form somebody can act on.
 *
 * NOT DONE, deliberately: encoding the value. This script does not encode
 * anything, its header says so, and whether it should is a separate correctness
 * question from where this guarantee belongs.
 */
export function encodingGate({ phase, cls, replacement }) {
  if (cls !== CLASS.SUPERSEDED) return ENCODING_GATE.OK;
  if (typeof replacement !== 'string') return ENCODING_GATE.OK;
  if (encodeURI(replacement) === replacement) return ENCODING_GATE.OK;
  return phase === 'write' ? ENCODING_GATE.DIE : ENCODING_GATE.WARN;
}

/**
 * The full decision for one reference: pattern first, evidence only where the
 * pattern refused. Callers should use this rather than calling the two in
 * sequence themselves, so the ordering cannot be got wrong.
 */
export function decideReference(raw, ctx) {
  return resolveFromManifest(classifyReference(raw, ctx), ctx);
}
