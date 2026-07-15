/**
 * Sanitizer for inline roadmap SVGs (course-detail InteractiveSvgRoadmap).
 *
 * The SVGs come from MSDB admin uploads and are injected into the DOM (they carry
 * per-node <a> links, which rasterizing would strip). Inline SVG can carry
 * script, so DOMPurify runs first and the security bar is unchanged: scripts and
 * on* event handlers are ALWAYS stripped.
 *
 * ── Why <style> is now allowed (and why it needs its own CSS scrub) ───────────
 * The uploaded roadmaps author hover as inline `onmouseover`/`onmouseout` JS
 * handlers — which DOMPurify correctly strips, so hover silently dies while the
 * links (xlink:href) survive. The safe mechanism is CSS `:hover` in a <style>
 * block, so <style> is added to the allowlist. BUT: verified against
 * isomorphic-dompurify in this repo, allowing <style> does NOT scrub the CSS
 * inside it — `@import`, `expression(...)`, `behavior:`, and
 * `url(javascript:/data:/http:)` all survive. So we scrub the <style> contents
 * ourselves: hover needs only fill/stroke/opacity/transform/transition/cursor +
 * internal paint refs `url(#gradient)`, never an external/scheme url or an
 * @import. Event-handler hover is NOT re-enabled — that would re-open the exact
 * "inline SVG can carry script" hole the component forbids.
 *
 * Pure string transforms (the DOMPurify instance is passed in, since the
 * component imports it dynamically, browser-only) so the scrub is unit-testable
 * without a DOM.
 */

export const ROADMAP_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_ATTR: ['target', 'href', 'xlink:href'],
  ADD_TAGS: ['use', 'style'],
};

/**
 * Strip the dangerous constructs from CSS destined for an injected <style>.
 * Comments are removed first so a payload can't hide keyword-splitting behind
 * `@imp/**​/ort`. Internal paint references `url(#id)` are KEPT (the roadmaps use
 * `stroke:url(#gradient)`); any `url()` with a scheme/external target is dropped.
 */
export function scrubStyleCss(rawCss) {
  const css = String(rawCss ?? '').replace(/\/\*[\s\S]*?\*\//g, ''); // strip CSS comments
  return css
    .replace(/@import[^;]*;?/gi, '')                          // no external stylesheet imports
    .replace(/expression\s*\([^)]*\)/gi, '')                  // legacy IE expression()
    .replace(/behavior\s*:[^;}]*;?/gi, '')                    // legacy IE behavior:
    .replace(/url\(\s*(['"]?)(?!\s*#)[^)]*\1\s*\)/gi, 'none') // keep url(#frag); drop url(scheme:/external)
    .replace(/(?:javascript|vbscript)\s*:/gi, '');            // belt-and-suspenders
}

/** Apply scrubStyleCss to every <style> block in already-DOMPurified markup. Pure. */
export function scrubStyleBlocks(html) {
  return String(html ?? '').replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open, css, close) => open + scrubStyleCss(css) + close
  );
}

/**
 * Full pipeline: DOMPurify (SVG profile — strips scripts + on* handlers) THEN the
 * explicit <style> CSS scrub. `DOMPurify` is injected (browser-only in the
 * component). Returns injection-ready markup.
 */
export function sanitizeRoadmapSvg(svgText, DOMPurify) {
  const cleaned = DOMPurify.sanitize(String(svgText ?? ''), ROADMAP_SANITIZE_CONFIG);
  return scrubStyleBlocks(cleaned);
}
