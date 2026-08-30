/**
 * ROUND 60 §A/§B/§C/§D — what is actually setting the spacing, measured.
 *
 * Round 23: only a browser resolves a var-through-var chain, and JSDOM resolves
 * none of it. So this reads COMPUTED values from Chrome, and — the part a class
 * string cannot answer — asks CDP's CSS.getMatchedStylesForNode WHICH RULE
 * WINS, by selector and stylesheet.
 *
 * ── WHY INJECTION, AND WHY THAT IS SOUND HERE ────────────────────────────
 * The published page-builder pages on this clone route through /promotions or
 * /[...slug] and 404 on both (pageType promotion, no matching promotion doc),
 * and /preview/<slug> is password-gated. What matters for a CASCADE question is
 * the document's stylesheet, not which route emitted the markup — so the real
 * components are rendered to markup and injected into a live dev-server page,
 * which carries the real compiled stylesheet. Round 20 established the editor
 * canvas is an iframe that CLONES the parent's stylesheets, so the canvas
 * resolves against this same CSS too.
 *
 * THE LIVENESS CONTROL runs first. Round 59 nearly shipped a wrong number
 * because injected classes absent from src/ were never emitted by the JIT, and
 * a class that does not exist measures exactly like one that does nothing. A
 * deliberately fake class proves the check can fire.
 *
 * Four surfaces, because §B and §D are comparisons:
 *   renderer   rich_text's `prose prose-lg …`            (the public page)
 *   editor     RichTextEditor's `prose prose-sm …`       (the canvas input)
 *   article    ArticleDetailClient's `article-content prose prose-lg …`
 *   custom     CustomPageView's `custom-page-content prose prose-lg …`
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   FC_PORT=3001 node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round60-prose-spacing.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';
import { RichTextSection } from '../src/components/pageBuilder/sections/rich_text.jsx';

/** The observed content: a paragraph, then a two-item bullet list. */
const DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าแรกของเนื้อหา rich text ที่ผู้เขียนพิมพ์เข้ามา' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าที่สอง ต่อจากย่อหน้าแรกทันที' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'รายการที่หนึ่ง' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'รายการที่สอง' }] }] },
      ],
    },
  ],
};

/** The same body, as the HTML string the other three surfaces receive. */
const BODY_HTML =
  '<p>ย่อหน้าแรกของเนื้อหา rich text ที่ผู้เขียนพิมพ์เข้ามา</p>'
  + '<p>ย่อหน้าที่สอง ต่อจากย่อหน้าแรกทันที</p>'
  + '<ul><li><p>รายการที่หนึ่ง</p></li><li><p>รายการที่สอง</p></li></ul>';

/** Class strings copied from their components — kept verbatim so a drift shows. */
const SURFACES = {
  renderer: null, // rendered from the real component below
  editor:
    'prose prose-sm max-w-none focus:outline-none dark:prose-invert min-h-[8rem] '
    + 'prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 [&_li>p]:my-0 '
    + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  article:
    'article-content prose prose-lg max-w-none prose-h2:border-l-4 prose-h2:border-blue-500 '
    + 'prose-h2:pl-4 prose-a:text-blue-600 prose-a:underline prose-ol:list-decimal prose-ol:pl-6 '
    + 'prose-ul:list-disc prose-ul:pl-6 prose-li:my-1 dark:prose-invert',
  custom:
    'custom-page-content prose prose-lg mt-6 max-w-none prose-h2:border-l-4 '
    + 'prose-h2:border-blue-500 prose-h2:pl-4 prose-a:text-blue-600 prose-a:underline dark:prose-invert',
};

function paint(html) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0;background:#fff');
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:820px;--pb-accent-text:#005CFF');
  host.innerHTML = html;
  document.body.appendChild(host);
  return true;
}

function readComputed() {
  const host = document.getElementById('h');
  const ps = [...host.querySelectorAll('p')];
  const lis = [...host.querySelectorAll('li')];
  const ul = host.querySelector('ul');
  const g = (el) => {
    if (!el) return null;
    const c = getComputedStyle(el);
    return {
      fontSize: c.fontSize, lineHeight: c.lineHeight,
      marginTop: c.marginTop, marginBottom: c.marginBottom,
    };
  };
  // The number a reader actually sees between two paragraphs: the gap between
  // the first paragraph's bottom border edge and the second's top. Margin
  // collapsing means this is NOT the sum of the two margins.
  let gapPP = null;
  if (ps.length >= 2) {
    const a = ps[0].getBoundingClientRect();
    const b = ps[1].getBoundingClientRect();
    gapPP = +(b.top - a.bottom).toFixed(1);
  }
  let gapLI = null;
  if (lis.length >= 2) {
    const a = lis[0].getBoundingClientRect();
    const b = lis[1].getBoundingClientRect();
    gapLI = +(b.top - a.bottom).toFixed(1);
  }
  let gapPtoUL = null;
  if (ps.length && ul) {
    // last paragraph that is NOT inside the list
    const outside = ps.filter((p) => !p.closest('li'));
    if (outside.length) {
      gapPtoUL = +(ul.getBoundingClientRect().top
        - outside[outside.length - 1].getBoundingClientRect().bottom).toFixed(1);
    }
  }
  return {
    p: g(ps.find((p) => !p.closest('li'))),
    liP: g(ps.find((p) => p.closest('li'))),
    li: g(lis[0]),
    ul: g(ul),
    gapParagraphToParagraph: gapPP,
    gapListItemToListItem: gapLI,
    gapParagraphToList: gapPtoUL,
  };
}

/** Which rules match a node, in cascade order, with their stylesheet origin. */
async function matched(page, selector, props) {
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return { error: 'node not found: ' + selector };
  const m = await page.send('CSS.getMatchedStylesForNode', { nodeId });
  const out = [];
  for (const entry of m.matchedCSSRules ?? []) {
    const rule = entry.rule;
    const decls = (rule.style?.cssProperties ?? [])
      .filter((d) => props.includes(d.name) && d.text)
      .map((d) => `${d.name}: ${d.value}`);
    if (!decls.length) continue;
    out.push({
      selector: rule.selectorList?.text,
      origin: rule.origin,
      sheet: rule.styleSheetId ? 'author' : rule.origin,
      decls,
    });
  }
  const inline = (m.inlineStyle?.cssProperties ?? [])
    .filter((d) => props.includes(d.name) && d.text)
    .map((d) => `${d.name}: ${d.value}`);
  if (inline.length) out.push({ selector: '(inline style)', decls: inline });
  return out;
}

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1200, height: 900 });
    await page.send('Page.navigate', { url: ORIGIN + '/promotions' });
    await new Promise((r) => setTimeout(r, 8000));
    // AFTER the navigation, and DOM before CSS: the CSS agent refuses to start
    // without the DOM agent, and a navigation resets both.
    await page.send('DOM.enable');
    await page.send('CSS.enable');

    /**
     * ── THE LIVENESS CONTROL, CORRECTED ──────────────────────────────────
     * Round 59's version put the class on a BARE div and asked whether any
     * computed property moved. That answers the question for a class that
     * paints the element itself, and gives a FALSE DEAD for every class that
     * targets DESCENDANTS — `prose-p:my-4`, `prose-li:my-1`, `[&_li>p]:my-0`
     * all changed nothing on an empty div while demonstrably working. Its first
     * run here reported all three as dead beside measurements that had plainly
     * moved, which is how the flaw surfaced.
     *
     * The second version gave them a subtree to act on but still reported them
     * dead, for a different reason worth writing down: Tailwind's PREFLIGHT
     * already sets `p, ul { margin: 0 }`, so on a bare host there is no margin
     * for `my-0` to remove. A class can only be observed against the context it
     * is used in, so the base here is `prose prose-lg` — the thing that puts the
     * margins there — and each class is added ON TOP of it.
     *
     * `max-w-none` is still reported dead and correctly so: `prose` sets a
     * max-width and the renderer already carries `max-w-none`, so adding it a
     * second time moves nothing. It is listed rather than quietly excluded to
     * keep the difference between a no-op and a missing rule visible.
     */
    const dead = await page.eval((classes) => {
      const BASE = 'prose prose-lg max-w-none';
      const host = document.createElement('div');
      host.innerHTML = '<p>a</p><p>b</p><ul><li><p>c</p></li><li><p>d</p></li></ul>';
      document.body.appendChild(host);
      const snap = (el) => [el, ...el.querySelectorAll('*')]
        .map((n) => { const c = getComputedStyle(n); return c.marginTop + '|' + c.marginBottom
          + '|' + c.maxWidth + '|' + c.fontSize + '|' + c.lineHeight + '|' + c.color; })
        .join(';');
      host.className = BASE;
      const base = snap(host);
      const out = [];
      for (const c of classes) {
        host.className = BASE + ' ' + c;
        if (snap(host) === base) out.push(c);
      }
      host.remove();
      return out;
    }, ['article-content', 'custom-page-content',
        'max-w-none', 'prose-p:my-4', 'prose-li:my-1', '[&_li>p]:my-0',
        '[&>*:first-child]:mt-0', '[&>*:last-child]:mb-0', 'not-a-real-class-control']);
    console.log('DEAD classes (expect the fake one, plus max-w-none as a no-op): ' + JSON.stringify(dead));

    const rendererHtml = renderToStaticMarkup(RichTextSection({ content: { doc: DOC } }));
    const surfaceHtml = {
      renderer: rendererHtml,
      editor: `<div class="${SURFACES.editor}">${BODY_HTML}</div>`,
      article: `<div class="${SURFACES.article}">${BODY_HTML}</div>`,
      custom: `<div class="${SURFACES.custom}">${BODY_HTML}</div>`,
    };

    console.log('');
    console.log('### §A/§B/§D  computed values per surface');
    for (const [name, html] of Object.entries(surfaceHtml)) {
      await page.eval(paint, html);
      const m = await page.eval(readComputed);
      console.log('');
      console.log('--- ' + name + ' ---');
      console.log('  p        ' + JSON.stringify(m.p));
      console.log('  li       ' + JSON.stringify(m.li));
      console.log('  p in li  ' + JSON.stringify(m.liP));
      console.log('  ul       ' + JSON.stringify(m.ul));
      console.log('  GAP p->p ' + m.gapParagraphToParagraph
        + '   GAP li->li ' + m.gapListItemToListItem
        + '   GAP p->ul ' + m.gapParagraphToList);
    }

    /**
     * ── THE PAIRWISE CHECK THE PER-CLASS CONTROL CANNOT DO ───────────────
     * `[&>*:first-child]:mt-0` / `[&>*:last-child]:mb-0` report as no-ops
     * against plain `prose`, and that is CORRECT: typography already zeroes the
     * block's outer edges there. Their job is to restore that zeroing after
     * `prose-p:my-4` — same (0,1,0) specificity, later in source — takes it
     * away. That is an interaction between two classes, which a one-class-at-a-
     * time check is structurally unable to see. So it is measured directly:
     * drop the two and the block must grow an outer margin again.
     */
    const RENDERER_CLASSES = (await page.eval(
      (html) => { const d = document.createElement('div'); d.innerHTML = html;
                  return d.firstElementChild.getAttribute('class'); },
      rendererHtml,
    ));
    const WITHOUT = RENDERER_CLASSES
      .split(/\s+/).filter((c) => c !== '[&>*:first-child]:mt-0' && c !== '[&>*:last-child]:mb-0')
      .join(' ');
    console.log('');
    console.log('### the two zeroing classes ARE load-bearing in the full string');
    for (const [label, cls] of [['with them   ', RENDERER_CLASSES], ['without them', WITHOUT]]) {
      await page.eval(paint, `<div class="${cls}">${BODY_HTML}</div>`);
      const m = await page.eval(readComputed);
      console.log('  ' + label + '  first p margin-top ' + m.p.marginTop
        + '   trailing ul margin-bottom ' + m.ul.marginBottom);
    }

    console.log('');
    console.log('### §A  WHICH RULE WINS — rich_text renderer');
    await page.eval(paint, rendererHtml);
    for (const [label, sel] of [['<p> (top level)', '#h > div > p'], ['<li>', '#h li'], ['<p> INSIDE li', '#h li p'], ['<ul>', '#h ul']]) {
      const rules = await matched(page, sel, ['margin-top', 'margin-bottom', 'line-height', 'font-size']);
      console.log('  ' + label + ':');
      for (const r of rules) console.log('     ' + JSON.stringify(r));
    }

    console.log('');
    console.log('### §D  WHICH RULE WINS — article body (the surface that looks right)');
    await page.eval(paint, surfaceHtml.article);
    for (const [label, sel] of [['<p>', '#h p'], ['<li>', '#h li']]) {
      const rules = await matched(page, sel, ['margin-top', 'margin-bottom', 'line-height']);
      console.log('  ' + label + ':');
      for (const r of rules) console.log('     ' + JSON.stringify(r));
    }

    await page.eval(paint, rendererHtml);
    const clip = await page.eval(() => {
      const r = document.getElementById('h').getBoundingClientRect();
      return { x: 0, y: 0, width: 860, height: Math.min(700, Math.round(r.height) + 40) };
    });
    const out = (process.env.TEMP || '.') + '/round60-prose-after.png';
    await page.screenshot(out, { clip });
    console.log('');
    console.log('shot: ' + out);
  } finally { await close(); }
}
main().catch((e) => { console.error('x ' + (e?.stack ?? e)); process.exit(1); });
