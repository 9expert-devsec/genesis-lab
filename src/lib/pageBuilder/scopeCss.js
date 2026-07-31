import postcss from 'postcss';

/**
 * scopeCss — confine untrusted `advanced.customCss` to `#<sectionId>`.
 *
 * The stored CSS is untrusted on EVERY render (developer-authored, but the
 * store is not a trust boundary). A bug here is silent and page-wide, so the
 * posture is fail-closed: parse with postcss, transform the AST, and drop
 * everything on any doubt. Nothing in the output may affect anything outside
 * the section's own subtree.
 *
 * Guarantees:
 *   - Every style rule's selectors are prefixed with `#<sectionId>` (descendant
 *     scope). Document-level selectors (html/body/:root/:scope) are DROPPED —
 *     a section can never restyle the document or page theme vars.
 *   - At-rules are an allowlist: only @media / @supports survive (their inner
 *     rules are scoped); @import/@charset/@keyframes/@font-face/@namespace/…
 *     are dropped (globals a section must not touch).
 *   - Dangerous declarations dropped: expression(), behavior, -moz-binding,
 *     javascript: values.
 *   - Comments stripped. Every `<` in the output is CSS-escaped (`\00003c`)
 *     so a `content: "</style>"` (or any tag close) can never break out of the
 *     injected <style> element.
 *   - Unparseable CSS, an oversize input, or an INVALID sectionId → '' (drop
 *     all). The sectionId is the scope prefix, so it must itself be a safe
 *     CSS/HTML identifier or it becomes the injection vector.
 *
 * ┌─ ADVERSARIAL CASES — RE-VERIFY EVERY ONE ON ANY CHANGE TO THIS FILE ──┐
 * │ There is no test runner in this repo. This IS the test. A "harmless   │
 * │ refactor" here silently reopens an XSS hole. For sectionId `sec`:     │
 * │                                                                        │
 * │  IN  .a{color:red}} body { display:none }                              │
 * │  OUT ""                              (stray } → parse fail → drop all)  │
 * │                                                                        │
 * │  IN  :root { --9e-navy: red }                                          │
 * │  OUT ""                              (document-level → dropped)         │
 * │                                                                        │
 * │  IN  body{…} html{…} * {margin:0}                                      │
 * │  OUT #sec * { margin:0 }             (body/html dropped; * scoped)      │
 * │                                                                        │
 * │  IN  @media (max-width:768px){ .a{color:red} }                         │
 * │  OUT @media (max-width:768px){ #sec .a{color:red} }                    │
 * │                                                                        │
 * │  IN  @charset..; @import..; .a{behavior:..;color:expression(..);       │
 * │      background:red}                                                    │
 * │  OUT #sec .a{ background:red }       (at-rules + unsafe decls dropped)  │
 * │                                                                        │
 * │  IN  .a::after{content:"</style><script>…"}                            │
 * │  OUT #sec .a::after{content:"\3c /style>\00003c script>…"}  (no </ )    │
 * │                                                                        │
 * │  IN  /* </style><script>x</script> *\/ .a{color:red}                   │
 * │      (the *\/ is backslash-escaped: the block terminator is `*` then   │
 * │       `/` adjacent, so `*\/` is inert and this row cannot close the    │
 * │       comment it lives in. It once did — see the note below.)          │
 * │  OUT #sec .a{ color:red }            (comment stripped)                 │
 * │                                                                        │
 * │  IN  .a { color:red; @@@ !!! {{{                                        │
 * │  OUT ""                              (unparseable → drop all)           │
 * │                                                                        │
 * │  IN  #sec .a { color:red }                                             │
 * │  OUT #sec .a { color:red }           (already scoped → not doubled)     │
 * │                                                                        │
 * │  IN  >20000 chars                    OUT ""   (length cap)              │
 * │  IN  css=.a{…}, sectionId="sec} body {…}"  OUT ""  (invalid id → drop)  │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A GREEN BUILD PROVES ONLY WHAT IS IN THE MODULE GRAPH ───────────────┐
 * │ This file once shipped a SYNTAX ERROR — a literal close-comment in the │
 * │ case row above — behind a green build. The throwaway page written to   │
 * │ pull this module into the graph lived in a `__`-prefixed folder, and   │
 * │ the App Router treats `_`-prefixed folders as PRIVATE: it never routed │
 * │ or compiled the page. The module was never built, so "compiled         │
 * │ successfully" said nothing about it, and the harness verified nothing. │
 * │                                                                        │
 * │ RULE: a verification harness must itself be verified by an OBSERVABLE  │
 * │ SIDE-EFFECT — the built page count changing, the route appearing in    │
 * │ the manifest, the expected string in the emitted HTML — never by the   │
 * │ absence of errors. This is the same failure class the table guards     │
 * │ against, and a future refactor will re-introduce the `_`-prefix trap.  │
 * └───────────────────────────────────────────────────────────────────────┘
 */

const MAX_CSS_LENGTH = 20000;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;             // valid, safe HTML/CSS id
const ALLOWED_ATRULES = new Set(['media', 'supports']);
const DOC_SELECTOR_RE = /^(html|body|:root|:scope)\b/i;
const DANGEROUS_VALUE_RE = /(expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:)/i;
const DANGEROUS_PROP_RE = /^(behavior|-moz-binding)$/i;

function warn(msg) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[pageBuilder scopeCss] dropped: ${msg}`);
  }
}

/** A sectionId is safe to interpolate into a selector / DOM id? */
export function isValidSectionId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function scopeSelector(sel, scope, scopeStartRe) {
  const s = sel.trim();
  if (!s) return null;
  if (DOC_SELECTOR_RE.test(s)) return null;   // never restyle the document
  if (scopeStartRe.test(s)) return s;         // already scoped → leave as-is
  return `${scope} ${s}`;
}

export function scopeCss(css, sectionId) {
  if (typeof css !== 'string' || !css.trim()) return '';
  if (!isValidSectionId(sectionId)) { warn(`invalid sectionId ${JSON.stringify(sectionId)}`); return ''; }
  if (css.length > MAX_CSS_LENGTH) { warn(`css too long (${css.length})`); return ''; }

  const scope = `#${sectionId}`;
  const scopeStartRe = new RegExp(`^#${sectionId}(\\s|$|[.#:\\[>+~])`);

  let root;
  try {
    root = postcss.parse(css);
  } catch {
    warn('unparseable css'); return '';           // fail closed
  }

  try {
    // 1. drop disallowed at-rules (removes their subtrees too)
    root.walkAtRules((at) => {
      if (!ALLOWED_ATRULES.has(at.name.toLowerCase())) at.remove();
    });
    // 2. strip comments
    root.walkComments((c) => c.remove());
    // 3. drop dangerous declarations
    root.walkDecls((decl) => {
      if (DANGEROUS_PROP_RE.test(decl.prop) || DANGEROUS_VALUE_RE.test(decl.value)) decl.remove();
    });
    // 4. prefix selectors; drop rules with no surviving selector or no decls
    root.walkRules((rule) => {
      if (!rule.nodes || rule.nodes.length === 0) { rule.remove(); return; }
      const selectors = rule.selectors.map((s) => scopeSelector(s, scope, scopeStartRe)).filter(Boolean);
      if (!selectors.length) { rule.remove(); return; }
      rule.selectors = selectors;
    });
    // 5. remove now-empty @media/@supports
    root.walkAtRules((at) => { if (!at.nodes || at.nodes.length === 0) at.remove(); });

    // 6. LOAD-BEARING: escape every '<' in the output so nothing can close
    // the injected <style> element (a `content: "</style>"` breakout). This
    // does NOT rely on postcss's own escaping behaviour — postcss may or may
    // not escape '<' and that can change across versions. This replace is the
    // guarantee: any literal '<' postcss emits is neutralised here. Do not
    // remove it on the assumption postcss handles it.
    const out = root.toString().replace(/</g, '\\00003c ');
    return out.trim();
  } catch {
    warn('transform failed'); return '';           // fail closed
  }
}
