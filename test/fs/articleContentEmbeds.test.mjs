import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readSource, scrubSource, ROOT } from '../sourceScan.mjs';
import { TABLE_WRAPPER_CLASS } from '@/lib/articles/wrapArticleTables';

/**
 * The public article body's YouTube embeds and tables.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 * `.article-content` had NO iframe rule and NO table rules at all, while
 * `.promotion-html-content` twenty lines above it has a full table block. Every
 * stored article body carries a literal width="640" height="360" on the iframe
 * — the editor configures Youtube.configure({ width: 640, height: 360 }) and
 * the extension writes those into the HTML at insert time — so with no CSS to
 * override them the attributes governed. Scanned across vw 320-2560, the
 * content column is 288-639px for vw 320-671, which is where the 640px box
 * OVERFLOWED THE VIEWPORT (by 352px at vw=320, 2.22x the column), and 641-900px
 * from vw 673 up, where it was undersized by as much as 260px.
 *
 * Tables had no borders, no padding, no header fill and no dark variants, and
 * images in cells rendered at natural size, so a row of logos had a different
 * height in every cell.
 *
 * ── FIXED AT RENDER TIME, NOT MIGRATED ──────────────────────────────────────
 * Both fixes are CSS. Stored HTML is not rewritten, which is the established
 * precedent for this surface — see src/lib/articles/normalizeAuthoredColors.js,
 * which corrects hardcoded Tiptap colours the same way and says why.
 *
 * ── WHY THESE GUARDS READ SCRUBBED CSS, AND WHY THAT IS LOAD-BEARING HERE ───
 * sourceScan is a JS/JSX reader. It DOES understand slash-star block comments,
 * which are also CSS's only comment form, and the first test below proves that
 * against the real file rather than assuming it. (This paragraph cannot show
 * the closing delimiter: it would end the comment it is written inside — which
 * is itself the hazard being described.) That matters more than usual here: the
 * CSS this file guards is heavily commented, and one of those comments quotes
 * `table { display: block; overflow-x: auto }` — the approach that was
 * considered and rejected. Read unscrubbed, a probe for that string would find
 * it and report the opposite of the truth. There is one CSS construct the
 * scrubber does mangle, `url(https://…)`, whose `//` it reads as a line
 * comment; globals.css contains no such URL, which is checked below rather
 * than asserted from memory.
 *
 * ── AND WHY TAILWIND IS NOT INVOLVED ────────────────────────────────────────
 * These are plain CSS rules, not utility classes, so the JIT content scan does
 * not apply — confirmed against tailwind.config.js's globs below, not assumed.
 */

const CSS = readSource('src/app/globals.css');
const YT_DIST = readFileSync(
  path.join(ROOT, 'node_modules/@tiptap/extension-youtube/dist/index.js'), 'utf8'
);
const ARTICLE_FORM = readSource('src/app/admin/articles/_components/ArticleForm.jsx');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * EVERY declaration block for an exact selector in the SHIPPED stylesheet,
 * concatenated.
 *
 * Every, not the first — CSS cascades, and both surfaces here genuinely split
 * one selector across two rules (`td, th { border }` then `th { background }`).
 * An indexOf-based reader returns the first and reports the second's
 * declarations as absent, which is a false negative that looks exactly like a
 * missing rule.
 *
 * The selector must also be findable at EITHER end of a comma-separated list.
 * `td img, th img { … }` puts `td img` before a comma and `th img` before the
 * brace, so a matcher that only accepts `selector {` finds the second and
 * reports the first as missing — again a false negative wearing the costume of
 * an absent rule. Hence the optional `,[^{}]*` tail, bounded by the braces so
 * it cannot wander into the next rule. The leading `(?:^|[},;\n])` stops a
 * longer selector that merely ends with this one from matching.
 *
 * Throws rather than returning '' when the rule is absent, because every
 * `assert.match` below would otherwise pass vacuously against an empty string.
 */
function block(selector, css = CSS.code) {
  const re = new RegExp(
    `(?:^|[},;\\n])\\s*${escapeRe(selector)}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`, 'g'
  );
  const found = [...css.matchAll(re)].map((m) => m[1]);
  if (!found.length) {
    throw new Error(
      `no "${selector} {" rule in globals.css. Every probe on it would pass ` +
        'vacuously, so this throws instead of returning an empty block.'
    );
  }
  return found.join(' ; ');
}

/**
 * One declaration's value, or null.
 *
 * The leading boundary is not decoration: without it, `width` matches inside
 * `max-width: 100%` and a probe for "does this rule fill the column" passes on
 * a rule that only caps it. `-` is deliberately absent from the boundary class
 * so that `max-width`, `border-color` and friends cannot satisfy `width` or
 * `border`.
 */
function decl(selector, prop, css = CSS.code) {
  const re = new RegExp(`(?:^|[;{\\s])${escapeRe(prop)}\\s*:\\s*([^;}]+)`);
  const m = re.exec(block(selector, css));
  return m ? m[1].trim() : null;
}

// ── PRECONDITION: the reader actually strips CSS comments ───────────────────

test('sourceScan strips CSS block comments from the real globals.css', () => {
  assert.match(CSS.raw, /\/\*/, 'the shipped file does contain block comments');
  assert.equal(/\/\*/.test(CSS.code), false, 'and the scrubbed read has none left');
  assert.ok(CSS.code.length < CSS.raw.length, 'so the scrub removed something');
});

test('CONTROL: the scrub is load-bearing — it removes the rejected approach this file quotes', () => {
  // Not a hypothetical. The shipped CSS comment explains why a scrolling table
  // was rejected and quotes the declaration verbatim. If the guards below read
  // CSS.raw, a probe for that string would find it in prose and conclude the
  // stylesheet does something it explicitly does not.
  assert.match(CSS.raw, /table \{ display: block/,
    'the rejected approach is quoted in a comment in the shipped file');
  assert.equal(/table \{ display: block/.test(CSS.code), false,
    'and the scrubbed read cannot see it — which is what makes the table guards honest');
  // The distinction is fine-grained on purpose: `display: block` on its own IS
  // in the real CSS now (the YouTube iframe rule), so only the quoted
  // `table { display: block` form separates prose from shipped declarations.
  assert.match(CSS.code, /display: block/, 'the bare declaration is genuinely present');
});

test('CONTROL: a CSS comment naming a selector cannot satisfy a selector probe', () => {
  const probe =
    '.article-content iframe { max-width: 100%; }\n' +
    '/* .article-content marquee { width: 100%; } */\n';
  const scrubbed = scrubSource(probe);
  assert.equal(/marquee/.test(scrubbed), false, 'the commented selector is gone');
  assert.match(scrubbed, /\.article-content iframe/, 'while the real rule survives');
});

test('CONTROL: globals.css has no url(https://…) for the scrubber to truncate', () => {
  // The one CSS construct this JS reader mangles: it takes the `//` for a line
  // comment and drops the rest of the line. Checked, not remembered.
  assert.equal(/url\([^)]*\/\//.test(CSS.raw), false, 'no protocol-bearing url() in the file');
  // ...and the hazard is real, so the check above is not decorative.
  assert.equal(
    /e\.com/.test(scrubSource('.a { background: url(https://e.com/x.png); }')), false,
    'a protocol URL genuinely IS truncated by this reader'
  );
});

test('CONTROL: the rule reader finds a selector at BOTH ends of a list, and no further', () => {
  // The reader is the subject of every assertion below, so its two failure
  // modes are pinned here against the SHIPPED stylesheet. Both were live
  // defects in this file before they were fixed.
  //   · list position — `td img, th img { … }` has one selector before the
  //     comma and one before the brace; an over-strict matcher finds only the
  //     second and reports the first as a missing rule.
  //   · over-reach — `.article-content img` must not be satisfied by
  //     `.article-content td img`, or the "scoped to cells" control is a lie.
  assert.match(block('.article-content td img'), /object-fit/, 'found before the comma');
  assert.match(block('.article-content th img'), /object-fit/, 'and before the brace');
  assert.equal(decl('.article-content img', 'object-fit'), null,
    'while the shorter selector does NOT pick up the cell rule');

  // ...and multi-rule accumulation: `th` gets its border from the td,th rule
  // and its background from its own, and both must be visible at once.
  assert.ok(decl('.article-content th', 'border'), 'border comes from the td,th rule');
  assert.ok(decl('.article-content th', 'background'), 'background from the th rule');
});

// ── the wrapper selector matches what the extension actually emits ──────────

test('the CSS is keyed on the attribute the installed extension really emits', () => {
  // The selector is only correct if it matches Tiptap's output. Both sides of
  // the extension agree, and both are read from the installed package rather
  // than from documentation or memory.
  assert.match(YT_DIST, /'data-youtube-video':\s*''/, 'renderHTML wraps the iframe in that div');
  assert.match(YT_DIST, /div\[data-youtube-video\] iframe/, 'and parseHTML reads it back');
  assert.match(CSS.code, /\.article-content \[data-youtube-video\] iframe/,
    'and the stylesheet targets the same attribute');
});

test('CONTROL: the attribute probe discriminates between real and plausible names', () => {
  // Without this, `/data-youtube-video/` could be matching a substring of
  // something else, or any near-miss name would look equally "confirmed".
  for (const wrong of ['data-youtube-embed', 'data-video-youtube', 'data-yt-video']) {
    assert.equal(YT_DIST.includes(wrong), false, `${wrong} is NOT what the extension emits`);
    assert.equal(CSS.code.includes(wrong), false, `and the stylesheet does not key on ${wrong}`);
  }
});

// ── the embed fills the column and stops honouring the height attribute ─────

const EMBED = '.article-content [data-youtube-video] iframe';

test('the wrapped iframe fills the column and holds 16:9 without the height attribute', () => {
  assert.equal(decl(EMBED, 'width'), '100%', 'it fills the content column at every width');
  assert.equal(decl(EMBED, 'height'), 'auto', 'so the stored height="360" no longer governs');
  assert.match(decl(EMBED, 'aspect-ratio') ?? '', /^16\s*\/\s*9$/,
    'and the ratio comes from CSS, not the attribute');
});

test('CONTROL: those probes fail against a rule in the same file that lacks them', () => {
  // Fired at `.article-content img`, which is SHIPPED SOURCE and genuinely has
  // no width and no aspect-ratio — so this is not a fixture the test wrote to
  // be convenient. It is also the rule that proves `decl` distinguishes `width`
  // from `max-width`: this block sets the latter and not the former.
  assert.equal(decl('.article-content img', 'width'), null, 'the body image rule does not fill');
  assert.equal(decl('.article-content img', 'aspect-ratio'), null, 'and imposes no ratio');
  assert.equal(decl('.article-content img', 'max-width'), '100%',
    'it caps only — which is the distinction being drawn');
});

test('every iframe is capped, not only the wrapped one', () => {
  assert.match(decl('.article-content iframe', 'max-width') ?? '', /100%/,
    'a pasted or non-YouTube embed still cannot exceed the column');
});

test('CONTROL: the sibling surface genuinely has no iframe rule, so the probe sees absence', () => {
  // .promotion-html-content is the other dangerouslySetInnerHTML block in this
  // same stylesheet and has no iframe rule at all. If `block()` returned
  // something for it, the presence checks above would mean nothing.
  assert.equal(/\.promotion-html-content iframe/.test(CSS.code), false);
  assert.throws(() => block('.promotion-html-content iframe'), /no ".*" rule/,
    'and the reader refuses to hand back an empty block for a missing rule');
});

// ── tables mirror the promotion vocabulary rather than opening a new one ────

test('the article table rules mirror .promotion-html-content exactly', () => {
  // Both blocks are read from the SAME shipped stylesheet, so this compares
  // two live surfaces rather than a surface against a number typed here.
  for (const prop of ['border', 'padding', 'text-align']) {
    const promo = decl('.promotion-html-content th', prop);
    const article = decl('.article-content th', prop);
    assert.ok(promo, `.promotion-html-content th should define ${prop}`);
    assert.equal(article, promo, `${prop} must match the promotion surface, not diverge`);
  }
  assert.equal(decl('.article-content th', 'background'), decl('.promotion-html-content th', 'background'));
  assert.equal(decl('.article-content table', 'border-collapse'), 'collapse');
  assert.equal(decl('.article-content table', 'width'), '100%');
});

test('CONTROL: the mirror comparison can tell two values apart', () => {
  // Otherwise "article === promo" could be two reads of one selector, and any
  // divergence would pass. These two blocks DO differ in their margin — the
  // promotion surface uses margin-bottom, the article one margin — so a real
  // difference in the same file is detected.
  assert.equal(decl('.promotion-html-content table', 'margin-bottom'), '1rem');
  assert.equal(decl('.promotion-html-content table', 'margin'), null, 'no shorthand there');
  assert.equal(decl('.article-content table', 'margin'), '1rem 0', 'and a shorthand here');
});

test('the dark-mode table variants exist and match the promotion surface', () => {
  assert.equal(
    decl('.dark .article-content th', 'border-color'),
    decl('.dark .promotion-html-content th', 'border-color'),
    'the dark border token is shared'
  );
  assert.equal(
    decl('.dark .article-content th', 'background'),
    decl('.dark .promotion-html-content th', 'background'),
    'and so is the dark header fill'
  );
});

test('CONTROL: the dark probes are reading real declarations, not nulls', () => {
  // null === null would make the pair above pass with both rules missing.
  assert.ok(decl('.dark .promotion-html-content th', 'background'), 'promotion defines one');
  assert.ok(decl('.dark .article-content th', 'background'), 'and so does the article surface');
  assert.equal(decl('.dark .article-content th', 'font-style'), null, 'and absent props read null');
});

// ── images in cells get one uniform box ─────────────────────────────────────

test('table cell images get a uniform base box that survives mixed aspect ratios', () => {
  for (const cell of ['.article-content td img', '.article-content th img']) {
    assert.equal(decl(cell, 'height'), '3rem', 'a fixed HEIGHT, so every cell shares a rhythm');
    assert.equal(decl(cell, 'object-fit'), 'contain', 'and contain, so nothing is cropped for it');
    assert.equal(decl(cell, 'width'), 'auto', 'width follows the aspect ratio');
    assert.equal(decl(cell, 'max-width'), '100%', 'but never exceeds a narrow cell');
  }
});

test('CONTROL: the box is scoped to cells — the body image rule is untouched', () => {
  // Fired at shipped source again. If the height had been put on
  // `.article-content img`, every image in every article body would be 3rem
  // tall, and a probe that only checked the cell rule would never notice.
  assert.equal(decl('.article-content img', 'height'), 'auto',
    'body images stay height:auto, exactly as before this change');
  assert.equal(decl('.article-content img', 'object-fit'), null, 'and are not letterboxed');
  assert.notEqual(decl('.article-content img', 'height'), '3rem', 'the cell box did not leak out');
});

// ── the table scroll wrapper: CSS shape, and the seams around it ───────────

test('the wrapper scrolls and the table inside it is NOT the scroll container', () => {
  // The box model is the whole fix. The WRAPPER is an ordinary block that
  // fills the column and scrolls; the TABLE stays a real table with
  // `width: auto; min-width: 100%`, so a narrow one is stretched to the column
  // edge by the min-width and a wide one grows past it and scrolls.
  const w = `.article-content .${TABLE_WRAPPER_CLASS}`;
  assert.equal(decl(w, 'overflow-x'), 'auto', 'the wrapper is the scroll container');
  assert.equal(decl(w, 'max-width'), '100%', 'and never exceeds the column, so the page cannot');
  assert.equal(decl(`${w} table`, 'min-width'), '100%', 'narrow tables still stretch');
  assert.equal(decl(`${w} table`, 'width'), 'auto', 'wide ones grow past the wrapper');
});

test('CONTROL: the failed CSS-only shape is NOT what shipped', () => {
  // `display: block` on the table is the construction that scrolls but stops
  // narrow tables stretching. Fired at the shipped rules: neither the base
  // table rule nor the wrapped one may carry it.
  assert.equal(decl('.article-content table', 'display'), null, 'the table is still a table');
  assert.equal(decl(`.article-content .${TABLE_WRAPPER_CLASS} table`, 'display'), null);
  // ...and the base rule still says width:100%, so the wrapped rule is a real
  // override rather than the only rule in play.
  assert.equal(decl('.article-content table', 'width'), '100%', 'the unwrapped default');
  assert.notEqual(
    decl(`.article-content .${TABLE_WRAPPER_CLASS} table`, 'width'),
    decl('.article-content table', 'width'),
    'and the wrapper rule genuinely differs from it'
  );
});

test('the focusable wrapper has a visible focus ring', () => {
  // The module sets tabindex="0" so a keyboard user can scroll it. A focusable
  // element with no focus style is its own accessibility defect.
  const f = `.article-content .${TABLE_WRAPPER_CLASS}:focus-visible`;
  assert.match(decl(f, 'outline') ?? '', /solid/, 'an outline on keyboard focus');
  assert.ok(decl(`.dark ${f}`, 'outline-color'), 'and a dark-mode colour for it');
});

test('CONTROL: the focus probe is not satisfied by the non-focus rule', () => {
  assert.equal(decl(`.article-content .${TABLE_WRAPPER_CLASS}`, 'outline'), null,
    'the resting wrapper has no outline, so the :focus-visible rule is what was found');
});

test('the scroll shadow has a dark-mode variant, and it actually differs', () => {
  // The affordance is painted with gradients keyed to the surface colour, so
  // both halves have to switch: a black shadow is invisible on #0D1B2A.
  const light = block(`.article-content .${TABLE_WRAPPER_CLASS}`);
  const dark = block(`.dark .article-content .${TABLE_WRAPPER_CLASS}`);
  assert.match(light, /radial-gradient/, 'light mode paints a shadow');
  assert.match(dark, /radial-gradient/, 'and so does dark mode');
  assert.match(light, /rgba\(13, 27, 42/, 'dark ink on the light surface');
  assert.match(dark, /rgba\(255, 255, 255/, 'light ink on the dark surface');
  assert.notEqual(light, dark, 'the two blocks are not the same declarations');
});

test('CONTROL: the shadow colours are genuinely swapped, not both present in one', () => {
  // Otherwise the pair above could pass with one block containing both.
  const light = block(`.article-content .${TABLE_WRAPPER_CLASS}`);
  assert.equal(/rgba\(255, 255, 255/.test(light), false,
    'the light block must not also carry the dark shadow');
});

test('the affordance self-cancels: covers are local, shadows are not', () => {
  // The technique in one line: two opaque covers pinned to the CONTENT
  // (`local`) sit over two shadows pinned to the BOX (`scroll`). At rest both
  // shadows are covered, so a table that does not overflow shows nothing.
  const b = block(`.article-content .${TABLE_WRAPPER_CLASS}`);
  assert.equal((b.match(/\blocal\b/g) || []).length, 2, 'two content-pinned covers');
  assert.equal((b.match(/\bscroll\b/g) || []).length, 2, 'two box-pinned shadows');
});

test('CONTROL: that probe distinguishes the two attachment values', () => {
  // `local` and `scroll` are both substrings of nothing else in the block, and
  // swapping them would break the effect silently.
  const b = block(`.article-content .${TABLE_WRAPPER_CLASS}`);
  assert.equal(/linear-gradient[^,]*,[^,]*,[^,]*no-repeat local/.test(b), true,
    'the linear covers are the local ones');
  assert.equal(/radial-gradient[\s\S]*no-repeat scroll/.test(b), true,
    'and the radial shadows are the scrolling ones');
});

// ── the seams: class name, wiring order, dependency ────────────────────────

test('the CSS class and the module constant are the same string', () => {
  // Nothing at build time connects them: rename either and the wrapper renders
  // unstyled — no error, no failing build, tables silently clipped again.
  assert.match(CSS.code, new RegExp(`\\.article-content \\.${TABLE_WRAPPER_CLASS}\\b`),
    'the stylesheet targets the exported class');
});

test('CONTROL: that probe would not match a renamed class', () => {
  assert.equal(new RegExp('\\.article-content \\.article-table-scroller\\b').test(CSS.code), false);
  assert.equal(TABLE_WRAPPER_CLASS, 'article-table-scroll', 'and the constant is what is imported');
});

test('the wrap is gated on a cheap substring check BEFORE the parser', () => {
  // Asserted against the source, not behaviour, and that is deliberate.
  // Removing this gate reddens NOTHING behaviourally, because byte-identity
  // for a table-free body is delivered a second time by `wrapped ? … : str`
  // further down. That redundancy is real and worth naming rather than
  // papering over: the gate is a PERFORMANCE guard — it keeps 416 of the 488
  // corpus bodies from being parsed and re-serialised at all — and this tier
  // cannot observe a parse that did not happen. So the claim made here is the
  // one that is actually true: the early return exists, and it precedes the
  // parse.
  const mod = readSource('src/lib/articles/wrapArticleTables.js').code;
  const gate = mod.indexOf('return str;');
  const parse = mod.indexOf('parseFragment(');
  assert.match(mod, /if \(!\/<table\/i\.test\(str\)\) return str;/, 'the cheap gate is present');
  assert.ok(gate !== -1 && parse !== -1, 'both the gate and the parse are in the file');
  assert.ok(gate < parse, 'and the gate comes first, or it is not a gate');
});

test('CONTROL: the ordering probe is not true of any two positions', () => {
  // Otherwise "gate < parse" could be an accident of where the strings sit.
  const mod = readSource('src/lib/articles/wrapArticleTables.js').code;
  assert.ok(mod.indexOf('serialize(') > mod.indexOf('parseFragment('), 'parse precedes serialise');
  assert.equal(mod.indexOf('parseFragment(') > mod.indexOf('serialize('), false,
    'and the comparison is directional, not symmetric');
});

test('the page wraps tables on the SERVER, after the colour pass', () => {
  // Order matters one way: the colour pass reads inline styles and does not
  // care about wrappers, but running it second would re-serialise a body this
  // one already re-serialised.
  const page = readSource('src/app/(public)/articles/[slug]/page.jsx');
  // The CALL is read from `code` — the nesting order is the claim, and prose
  // about it must not satisfy the probe.
  assert.match(page.code, /wrapArticleTables\(\s*normalizeAuthoredColors\(/,
    'wrapArticleTables(normalizeAuthoredColors(...)) — this order');
  // The IMPORT is read from `withImports`, because `code` strips import
  // statements outright — asserting it there would fail no matter what the
  // file said, which is the mirror of the vacuous-pass trap sourceScan
  // documents for "nothing imports X" guards.
  assert.match(page.withImports, /from '@\/lib\/articles\/wrapArticleTables'/,
    'imported, not inlined');
});

test('CONTROL: the order probe rejects the reverse nesting', () => {
  const reversed = 'content: normalizeAuthoredColors(wrapArticleTables(article.content))';
  assert.equal(/wrapArticleTables\(\s*normalizeAuthoredColors\(/.test(reversed), false,
    'the probe is order-sensitive, not just presence-sensitive');
});

test('the wrap is NOT deferred to a client effect', () => {
  // Server output must already be correct: a client wrap means the first paint
  // overflows and then jumps, and a reader without JS gets the broken version.
  const client = readSource('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx').code;
  assert.equal(/wrapArticleTables/.test(client), false, 'the client component does not do this');
  assert.equal(new RegExp(TABLE_WRAPPER_CLASS).test(client), false,
    'and does not construct the wrapper either');
});

test('CONTROL: that probe can see the class when it IS present', () => {
  // Otherwise "absent from the client" is true of a typo.
  assert.match(CSS.code, new RegExp(TABLE_WRAPPER_CLASS), 'the same probe finds it in the CSS');
});

test('parse5 is a declared RUNTIME dependency, not a transitive or dev one', () => {
  // It runs on the server in the render path. Leaning on it transitively is
  // how a dependency disappears in a future install; declaring it dev would
  // omit it from the production install entirely.
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.parse5, 'declared in dependencies');
  assert.equal(pkg.devDependencies?.parse5, undefined, 'and not in devDependencies');
});

test('CONTROL: the dependency probe can tell the two blocks apart', () => {
  // sucrase is the precedent for declaring a would-be-transitive package, and
  // it lives in devDependencies — so the two lookups are genuinely different.
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies?.sucrase, 'sucrase is a devDependency');
  assert.equal(pkg.dependencies?.sucrase, undefined, 'and not a runtime one');
});

// ── the editor config was deliberately NOT changed ──────────────────────────

test('the editor still writes width/height, because omitting them is worse', () => {
  // This pins a DECISION, so that "cleaning up" ArticleForm reddens here with
  // the reason attached. The extension does not omit the attributes when the
  // options are absent — it substitutes its OWN defaults, and they are 4:3.
  assert.match(
    ARTICLE_FORM.code,
    /Youtube\.configure\(\{[^}]*width:\s*640[^}]*height:\s*360/,
    'ArticleForm still configures 640x360'
  );
  assert.match(YT_DIST, /height:\s*480,/, "the extension's own default height is 480");
  assert.match(YT_DIST, /width:\s*640,/, 'and its default width is 640');
  assert.match(
    YT_DIST,
    /width:\s*this\.options\.width,\s*height:\s*this\.options\.height/,
    'and renderHTML writes them unconditionally, so there is no config that omits them'
  );
});

test('CONTROL: omitting the options would genuinely change the shipped ratio', () => {
  // If the default equalled the configured value this guard would be pointless,
  // so the numbers are compared rather than merely asserted to exist.
  const defaultHeight = Number(/height:\s*(\d+),/.exec(YT_DIST)[1]);
  const configured = Number(/height:\s*(\d+)/.exec(
    /Youtube\.configure\(\{[^}]*\}\)/.exec(ARTICLE_FORM.code)[0]
  )[1]);
  assert.notEqual(defaultHeight, configured, 'the default is not what the editor sets');
  assert.equal(defaultHeight, 480, '640x480 is 4:3');
  assert.equal(configured, 360, 'while 640x360 is 16:9');
});

// ── Tailwind is not in the loop ─────────────────────────────────────────────

/** A `content` glob as a matcher, so this is checked rather than eyeballed. */
function globToRe(glob) {
  let g = glob.replace(/^\.\//, '');
  g = g.replace(/[.+^$()|[\]]/g, '\\$&');
  g = g.replace(/\{([^}]+)\}/g, (_, alts) => `(?:${alts.split(',').join('|')})`);
  g = g.replace(/\*\*\//g, ' ');
  g = g.replace(/\*/g, '[^/]*');
  g = g.replace(/ /g, '(?:.*/)?');
  return new RegExp(`^${g}$`);
}

test('globals.css is NOT scanned by the Tailwind JIT, so plain rules need no glob', () => {
  const config = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
  const globs = [...config.matchAll(/'(\.\/src\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(globs.length >= 3, `expected the content globs, found ${globs.length}`);
  for (const g of globs) {
    assert.equal(
      globToRe(g).test('src/app/globals.css'), false,
      `${g} must not match globals.css — if it did, these rules would be JIT-dependent`
    );
  }
});

test('CONTROL: the glob matcher does match the files it is supposed to', () => {
  // Otherwise "nothing matches globals.css" would be true of a broken matcher.
  const config = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
  const globs = [...config.matchAll(/'(\.\/src\/[^']+)'/g)].map((m) => m[1]);
  const res = globs.map(globToRe);
  assert.ok(
    res.some((re) => re.test('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx')),
    'a real .jsx under src/app IS covered'
  );
  assert.ok(res.some((re) => re.test('src/lib/scheduleStatus.js')), 'and the src/lib glob works');
});
