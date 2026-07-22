/**
 * svg-hover-to-css.mjs — Convert roadmap SVG hover from inline on* JS handlers
 * to sanitizer-surviving CSS `:hover` inside a <style> block.
 *
 * Why: InteractiveSvgRoadmap runs uploaded SVG through isomorphic-dompurify,
 * which strips on* handlers (a script-execution vector). Hover authored as
 * `onmouseover`/`onmouseout` therefore silently dies while the <a> links live.
 * The safe landing pad already shipped: <style> survives DOMPurify and its CSS
 * is scrubbed by scrubStyleCss. This script does the CONTENT half — it rewrites
 * the SAME hover effect as ID-scoped CSS `:hover`. It does NOT re-enable events.
 *
 * Usage:  node scripts/svg-hover-to-css.mjs <input.svg>
 * Writes: <input>.hover-css.svg  (never overwrites the input)
 *
 * Design choices:
 *  - Parse with jsdom in XML mode (namespace + case preserving) ONLY to locate
 *    and validate: query by [id="..."] / element name because XML docs have no
 *    DTD-declared ID type, so getElementById() is unreliable. jsdom is NOT used
 *    to serialize — its XMLSerializer rewrites the root <svg> as <svg:svg> when
 *    the file declares a redundant xmlns:svg (Inkscape does), and DOMPurify's SVG
 *    profile then discards the whole tree. So mutations are applied as SCOPED
 *    string edits on the original text, keyed by the exact ids jsdom located,
 *    leaving the file (and its unprefixed <svg> root) byte-for-byte intact
 *    everywhere we don't touch.
 *  - Extract every ID and colour from the handler STRINGS in the file. Fail
 *    loudly on any node whose handler shape differs — never fall back to
 *    hardcoded values, never guess.
 *  - Fix the two inline-style collisions (a hover group's inline display:none,
 *    and each label path's inline fill) by STRIPPING those single declarations,
 *    so plain-specificity CSS wins without !important.
 *  - Emit only ID-scoped rules (every selector starts with an existing #id) so
 *    the injected <style>, which applies to the whole host document, can't leak.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

/** Loud failure — a converted-but-wrong SVG is worse than a stop. */
class TransformError extends Error {}

/**
 * Split an inline `style` attribute into ordered [prop, value] pairs, preserving
 * everything we don't touch. Declarations are `prop:value` separated by `;`.
 */
function parseStyle(styleText) {
  return String(styleText ?? '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      if (i === -1) return { prop: d, value: '', raw: d };
      return {
        prop: d.slice(0, i).trim(),
        value: d.slice(i + 1).trim(),
        raw: d,
      };
    });
}

/** Re-serialize declarations, dropping any whose prop is in `dropProps`. */
function serializeStyle(decls, dropProps) {
  const drop = new Set(dropProps.map((p) => p.toLowerCase()));
  return decls
    .filter((d) => !drop.has(d.prop.toLowerCase()))
    .map((d) => `${d.prop}:${d.value}`)
    .join(';');
}

/**
 * Rewrite a single element's opening-tag STRING, dropping `prop` from its inline
 * `style`. Keeps every other declaration; removes the whole `style="..."` (and
 * one leading space) if nothing remains. Returns { tag, changed }.
 */
function stripDeclFromTag(tag, prop) {
  const m = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i.exec(tag);
  if (!m) return { tag, changed: false };
  const value = m[3] !== undefined ? m[3] : m[4];
  const decls = parseStyle(value);
  if (!decls.some((d) => d.prop.toLowerCase() === prop.toLowerCase())) return { tag, changed: false };
  const next = serializeStyle(decls, [prop]);
  const quote = m[2][0];
  const replacement = next ? `${m[1]}${quote}${next}${quote}` : '';
  return { tag: tag.slice(0, m.index) + replacement + tag.slice(m.index + m[0].length), changed: true };
}

/** `id="..."` value of a tag string, or null. */
function tagId(tag) {
  const m = /\bid\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
  return m ? (m[2] !== undefined ? m[2] : m[3]) : null;
}

/** Index just past the `>` that closes the opening tag beginning at `start`, quote-aware. */
function endOfOpeningTag(text, start) {
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i + 1;
  }
  throw new TransformError('unterminated opening tag while inserting <style>');
}

/** Capture group `g` (default 1) of `re` on `s`, or null. */
function grab(re, s, g = 1) {
  const m = re.exec(s);
  return m ? m[g] : null;
}

/**
 * Parse a matching mouseover/mouseout handler pair into the effect spec.
 * Throws TransformError (loud) if the shape doesn't match the expected:
 *   over: getElementById('HOVER').style.display='inline'
 *         getElementById('TEXT').getElementsByTagName('path') ... .style.fill='#HOVER'
 *   out:  getElementById('HOVER').style.display='none'
 *         ... .style.fill='#REST'
 */
function parseHandlers(anchorId, over, out) {
  if (!over) throw new TransformError(`<a id="${anchorId}"> has no onmouseover to parse`);
  if (!out) throw new TransformError(`<a id="${anchorId}"> has onmouseover but no onmouseout`);

  const idIn = (verb, s) =>
    grab(
      new RegExp(
        `getElementById\\(\\s*(['"])([^'"]*)\\1\\s*\\)\\s*\\.style\\.display\\s*=\\s*(['"])${verb}\\3`,
        'i'
      ),
      s,
      2
    );
  const textIdIn = (s) =>
    grab(
      /getElementById\(\s*(['"])([^'"]*)\1\s*\)\s*\.getElementsByTagName\(\s*(['"])path\3\s*\)/i,
      s,
      2
    );
  const fillIn = (s) => grab(/\.style\.fill\s*=\s*(['"])(#[0-9A-Fa-f]{3,8})\1/i, s, 2);

  const hoverGroupId = idIn('inline', over);
  const hoverGroupIdOut = idIn('none', out);
  const textGroupId = textIdIn(over);
  const textGroupIdOut = textIdIn(out);
  const hoverFill = fillIn(over);
  const restFill = fillIn(out);

  const problems = [];
  if (!hoverGroupId) problems.push('no `getElementById(...).style.display="inline"` in onmouseover');
  if (!hoverGroupIdOut) problems.push('no `getElementById(...).style.display="none"` in onmouseout');
  if (!textGroupId) problems.push('no `getElementById(...).getElementsByTagName("path")` in onmouseover');
  if (!hoverFill) problems.push('no `style.fill="#..."` in onmouseover');
  if (!restFill) problems.push('no `style.fill="#..."` in onmouseout');
  if (hoverGroupId && hoverGroupIdOut && hoverGroupId !== hoverGroupIdOut)
    problems.push(`display group id differs over/out (${hoverGroupId} vs ${hoverGroupIdOut})`);
  if (textGroupId && textGroupIdOut && textGroupId !== textGroupIdOut)
    problems.push(`text group id differs over/out (${textGroupId} vs ${textGroupIdOut})`);

  if (problems.length)
    throw new TransformError(
      `<a id="${anchorId}"> handler shape not recognized — refusing to guess:\n` +
        problems.map((p) => `    • ${p}`).join('\n') +
        `\n  onmouseover: ${over}\n  onmouseout:  ${out}`
    );

  return { anchorId, hoverGroupId, textGroupId, hoverFill, restFill };
}

/** Build the ID-scoped CSS for one anchor. Every selector starts with an #id. */
function cssForNode({ anchorId, hoverGroupId, textGroupId, hoverFill, restFill }) {
  return [
    `#${hoverGroupId} { display: none; }`,
    `#${anchorId}:hover #${hoverGroupId} { display: inline; }`,
    `#${textGroupId} path { fill: ${restFill}; transition: fill .15s ease; }`,
    `#${anchorId}:hover #${textGroupId} path { fill: ${hoverFill}; }`,
    `#${anchorId} { cursor: pointer; }`,
  ].join('\n');
}

function convert(svgText) {
  // ── Phase 1: parse + validate + locate (jsdom, read-only) ──────────────────
  const dom = new JSDOM(svgText, { contentType: 'image/svg+xml' });
  const { document } = dom.window;
  const root = document.documentElement;

  const parseError = document.querySelector('parsererror');
  if (parseError) throw new TransformError(`SVG did not parse as XML:\n${parseError.textContent}`);
  if (!root || root.localName !== 'svg')
    throw new TransformError(`root element is <${root && root.localName}>, expected <svg>`);

  const byId = (id) => document.querySelector(`[id="${id}"]`);

  const anchors = Array.from(document.querySelectorAll('a'));
  const withHandler = anchors.filter((a) => a.hasAttribute('onmouseover') || a.hasAttribute('onmouseout'));

  const summary = {
    anchorsTotal: anchors.length,
    processed: [],
    skippedNoHandler: anchors
      .filter((a) => !a.hasAttribute('onmouseover') && !a.hasAttribute('onmouseout'))
      .map((a) => a.getAttribute('id') || '(no id)'),
    mutations: { handlersRemoved: 0, displayStripped: 0, fillStrippedPaths: 0 },
    leakRisks: [],
    css: '',
  };

  if (withHandler.length === 0) return { changed: false, summary, output: null };

  const rules = [];
  const hoverGroupIds = new Set(); // <g> ids whose inline display:none must be stripped
  const targetPathIds = new Set(); // <path> ids whose inline fill must be stripped

  for (const a of withHandler) {
    const anchorId = a.getAttribute('id');
    if (!anchorId)
      throw new TransformError('an <a> with a hover handler has no id — cannot scope `:hover` to it');

    const spec = parseHandlers(anchorId, a.getAttribute('onmouseover'), a.getAttribute('onmouseout'));

    // Every ID the CSS references must (a) exist and (b) be prefixed, else a rule
    // could go unscoped and repaint the whole host document.
    for (const [label, id] of [
      ['anchor', spec.anchorId],
      ['hover-group', spec.hoverGroupId],
      ['text-group', spec.textGroupId],
    ]) {
      if (!byId(id)) throw new TransformError(`${label} id #${id} referenced by handler does not exist in the SVG`);
      if (!id.includes('__')) summary.leakRisks.push(`${label} id #${id} is not prefixed (leak risk)`);
    }

    const hoverGroup = byId(spec.hoverGroupId);
    const hadInlineDisplayNone =
      /(^|;)\s*display\s*:\s*none\s*(;|$)/i.test(hoverGroup.getAttribute('style') || '');
    hoverGroupIds.add(spec.hoverGroupId);

    // Collect the label paths. They must all carry an id so a scoped string edit
    // can target each precisely; fail loudly if any lacks one.
    const paths = Array.from(byId(spec.textGroupId).querySelectorAll('path'));
    const noId = paths.filter((p) => !p.hasAttribute('id'));
    if (noId.length)
      throw new TransformError(
        `${noId.length} <path> in #${spec.textGroupId} have no id — cannot target them for a scoped string edit`
      );
    for (const p of paths) targetPathIds.add(p.getAttribute('id'));

    rules.push(cssForNode(spec));
    summary.processed.push({
      anchorId: spec.anchorId,
      hoverGroupId: spec.hoverGroupId,
      textGroupId: spec.textGroupId,
      hoverFill: spec.hoverFill,
      restFill: spec.restFill,
      hadInlineDisplayNone,
      pathsInTextGroup: paths.length,
      pathIds: paths.map((p) => p.getAttribute('id')),
    });
  }

  // ── Phase 2: mutate the ORIGINAL string, scoped by the located ids ─────────
  let text = svgText;

  // (1) Remove the event handlers. Attribute values are double-quoted and their
  //     JS uses single quotes, so [^"]* is a safe, exact match.
  let handlersRemoved = 0;
  text = text.replace(/\s*onmouse(?:over|out)\s*=\s*"[^"]*"/gi, () => {
    handlersRemoved += 1;
    return '';
  });
  const expectHandlers = withHandler.length * 2;
  if (handlersRemoved !== expectHandlers)
    throw new TransformError(`expected to remove ${expectHandlers} handler attributes, removed ${handlersRemoved}`);
  summary.mutations.handlersRemoved = handlersRemoved;

  // (2a) Strip inline display:none from each hover <g>. One pass over <g> tags.
  const displayDone = new Set();
  text = text.replace(/<g\b[^>]*>/gi, (tag) => {
    const id = tagId(tag);
    if (!id || !hoverGroupIds.has(id)) return tag;
    const { tag: next, changed } = stripDeclFromTag(tag, 'display');
    if (changed) displayDone.add(id);
    return next;
  });
  for (const id of hoverGroupIds)
    if (!displayDone.has(id)) throw new TransformError(`could not strip inline display from #${id}`);
  summary.mutations.displayStripped = displayDone.size;

  // (2b) Strip inline fill from each label <path>. One pass over <path> tags.
  const fillDone = new Set();
  text = text.replace(/<path\b[^>]*>/gi, (tag) => {
    const id = tagId(tag);
    if (!id || !targetPathIds.has(id)) return tag;
    const { tag: next, changed } = stripDeclFromTag(tag, 'fill');
    if (changed) fillDone.add(id);
    return next;
  });
  const missedFill = [...targetPathIds].filter((id) => !fillDone.has(id));
  if (missedFill.length)
    throw new TransformError(`failed to strip inline fill from ${missedFill.length} path(s): ${missedFill.slice(0, 5).join(', ')}…`);
  summary.mutations.fillStrippedPaths = fillDone.size;

  // (3) Insert ONE <style> immediately after the <svg> opening tag.
  const css = rules.join('\n');
  summary.css = css;
  const svgStart = text.search(/<svg\b/i);
  if (svgStart === -1) throw new TransformError('no <svg> opening tag found for <style> insertion');
  const insertAt = endOfOpeningTag(text, svgStart);
  const styleBlock = `\n  <style type="text/css">\n${css}\n  </style>`;
  const output = text.slice(0, insertAt) + styleBlock + text.slice(insertAt);

  return { changed: true, summary, output };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function outPathFor(input) {
  if (/\.hover-css\.svg$/i.test(input))
    throw new TransformError(`refusing to run on an already-converted file: ${input}`);
  return input.replace(/\.svg$/i, '.hover-css.svg');
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node scripts/svg-hover-to-css.mjs <input.svg>');
    process.exit(2);
  }
  const output = outPathFor(input);
  if (output === input) throw new TransformError('output path equals input — aborting to avoid overwrite');

  const svgText = readFileSync(input, 'utf8');
  const { changed, summary, output: converted } = convert(svgText);

  console.log(`\n=== ${input} ===`);
  console.log(`anchors: ${summary.anchorsTotal}  |  with handler: ${summary.processed.length}  |  no-handler (left alone): ${summary.skippedNoHandler.join(', ') || '(none)'}`);

  if (!changed) {
    console.log('no handlers found, nothing to do — no output written.');
    return;
  }

  for (const p of summary.processed) {
    console.log(
      `  • #${p.anchorId}: hover-group #${p.hoverGroupId} (inline display:none present: ${p.hadInlineDisplayNone}), ` +
        `text-group #${p.textGroupId} (${p.pathIds.length} paths targeted for fill-strip), ` +
        `fill ${p.restFill} → ${p.hoverFill}`
    );
  }
  console.log(
    `mutations: handlers removed=${summary.mutations.handlersRemoved}, inline display:none stripped=${summary.mutations.displayStripped}, path fills stripped=${summary.mutations.fillStrippedPaths}`
  );
  if (summary.leakRisks.length) console.log('LEAK RISKS:\n  ' + summary.leakRisks.join('\n  '));
  console.log('\n--- generated <style> ---\n' + summary.css + '\n');

  writeFileSync(output, converted, 'utf8');
  console.log(`wrote ${output}`);
}

try {
  main();
} catch (err) {
  if (err instanceof TransformError) {
    console.error('\nTRANSFORM ABORTED\n' + err.message + '\n');
    process.exit(1);
  }
  throw err;
}

export { convert, parseHandlers, cssForNode, parseStyle, serializeStyle, stripDeclFromTag };
