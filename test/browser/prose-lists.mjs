import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, tape } from './cdp.mjs';

/**
 * Lists copy as one line per item, and the rhythm between items did not move.
 *
 * ── WHY THIS IS A BROWSER SCRIPT AND NOT A jsdom TEST ───────────────────────
 * Both properties are things only a layout engine can answer. "What does the
 * clipboard get" is the browser's plain-text serialisation of a selection,
 * which emits a line break per BLOCK boundary — jsdom has no layout and its
 * `Selection.toString()` does not model it. "How far apart are two items" is
 * a computed layout, with margin collapsing, which jsdom does not do either.
 * A node test can pin that the CSS rule exists (test/fs/proseListCopy does);
 * it cannot pin that the rule works. This one can, and does.
 *
 * ── WHAT IT DRIVES ──────────────────────────────────────────────────────────
 * Not the app. A data: page carrying the BUILT stylesheet (.next/static/css —
 * so `npm run build` first) and the exact wrapper classes each public
 * rich-text surface uses, with Tiptap's <li><p>…</p></li> structure. That is
 * the whole cascade the real pages see — the typography plugin, globals.css,
 * the per-wrapper utilities — without a dev server or a database. So unlike
 * its siblings it can run alone:
 *
 *     npm run build && node test/browser/prose-lists.mjs
 *
 * It is also in run.mjs's SCRIPTS, so `npm run test:browser` runs it — but
 * that runner's preflight wants a dev server for the other scripts.
 *
 * ── THE NUMBERS ARE MEASUREMENTS, NOT CHOICES ───────────────────────────────
 * The expected gaps were measured against the build BEFORE the copy rule
 * existed (2026-09-12) and the rule's compensation exists to hold them. If
 * one moves, either the compensation drifted from the typography plugin or a
 * wrapper's utilities changed — either way the page respaced, and that is
 * what this guards. Update the number only with the commit that meant to.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS_DIR = path.join(HERE, '..', '..', '.next', 'static', 'css');

/** The built stylesheet that carries globals.css — the one with `.article-content`. */
function builtCss() {
  let files;
  try { files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')); } catch { files = []; }
  for (const f of files) {
    const css = readFileSync(path.join(CSS_DIR, f), 'utf8');
    if (css.includes('.article-content')) return css;
  }
  throw new Error(`no built stylesheet with .article-content under ${CSS_DIR} — run \`npm run build\` first`);
}

/**
 * Every public wrapper that renders Tiptap HTML, by the class string it uses
 * (verbatim from the component), and the gap between two sole-paragraph items
 * measured before the copy rule existed.
 *
 *   gap      px between consecutive top-level <li> boxes
 *   nested   px between consecutive nested <li> boxes
 */
const SCOPES = [
  { id: 'courseSection',   file: '[...slug]/_components/CourseRequirements.jsx (and its 4 siblings)', cls: 'article-content rich-body-nested-lists', gap: 16, nested: 16 },
  { id: 'articleBody',     file: 'articles/[slug]/_components/ArticleDetailClient.jsx', cls: 'article-content prose prose-lg max-w-none prose-li:my-1', gap: 16, nested: 16 },
  { id: 'masterclassBase', file: 'masterclass/[slug]/_components/MasterclassDetailClient.jsx (system requirements / topics)', cls: 'prose prose-base max-w-none prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-p:my-1', gap: 4, nested: 4 },
  { id: 'masterclassSm',   file: 'masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx (preparation)', cls: 'prose prose-sm max-w-none', gap: 16, nested: 8 },
  { id: 'faq',             file: 'components/faq/FaqAccordionSection.jsx', cls: 'prose prose-base', gap: 20, nested: 12 },
  { id: 'careerPath',      file: '[...slug]/_components/CareerPathDetail.jsx', cls: 'prose prose-lg max-w-none', gap: 24, nested: 16 },
  { id: 'customPage',      file: '[...slug]/_components/CustomPageView.jsx', cls: 'custom-page-content prose prose-lg max-w-none', gap: 24, nested: 16 },
  { id: 'topicRich',       file: '[...slug]/_components/CourseOutline.jsx', cls: 'topic-rich text-base', gap: 6, nested: 6 },
];

/** The admin editing surfaces: the SAME classes on the `.ProseMirror` root. Untouched. */
const EDITORS = [
  { id: 'courseBodyEditor', cls: 'ProseMirror course-body-editor article-content prose prose-sm max-w-none', gap: 16 },
  { id: 'simpleRichEditor', cls: 'ProseMirror prose prose-sm max-w-none', gap: 16 },
  { id: 'articleEditor',    cls: 'ProseMirror article-content prose prose-sm max-w-none', gap: 16 },
];

const LIST   = '<ul><li><p>ระบบปฏิบัติการ Windows 11 / 10</p></li><li><p>Claude Account (Free)</p></li><li><p>Internet</p></li></ul>';
const NESTED = '<ul><li><p>Parent</p><ul><li><p>Child A</p></li><li><p>Child B</p></li></ul></li><li><p>Next</p></li></ul>';
const MULTI  = '<ul><li><p>First para</p><p>Second para</p></li><li><p>Single</p></li></ul>';

function pageHtml(css) {
  const box = (id, cls, kind, html) => `<div id="${id}-${kind}" class="${cls}" data-kind="${kind}">${html}</div>`;
  const blocks = [
    ...SCOPES.map((s) => box(s.id, s.cls, 'list', LIST) + box(s.id, s.cls, 'nested', NESTED) + box(s.id, s.cls, 'multi', MULTI)),
    ...EDITORS.map((e) => box(e.id, e.cls, 'list', LIST)),
  ].join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="width:800px;margin:0">${blocks}</body></html>`;
}

/** Runs in the page: per box, the selection's plain text, the item gaps, and the paragraph's display. */
function measureAll() {
  const out = {};
  for (const box of document.querySelectorAll('[data-kind]')) {
    const top = [...box.querySelectorAll(':scope > ul > li')];
    const inner = [...box.querySelectorAll(':scope > ul > li > ul > li')];
    const gaps = (lis) => lis.slice(1).map((li, i) => +(li.getBoundingClientRect().top - lis[i].getBoundingClientRect().bottom).toFixed(1));
    const sel = window.getSelection(); sel.removeAllRanges();
    const range = document.createRange(); range.selectNodeContents(box); sel.addRange(range);
    out[box.id] = {
      copied: sel.toString(),
      gaps: gaps(top),
      nestedGaps: gaps(inner),
      pDisplay: [...box.querySelectorAll('li > p')].map((p) => getComputedStyle(p).display),
    };
  }
  return out;
}

const t = tape('prose-lists');
const { browser, close } = await launch();
try {
  const page = await openPage(browser, { width: 1000 });
  await page.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml(builtCss())) });
  await new Promise((r) => setTimeout(r, 800));
  const m = await page.eval(measureAll);

  for (const s of SCOPES) {
    const list = m[`${s.id}-list`], nested = m[`${s.id}-nested`], multi = m[`${s.id}-multi`];

    // ── THE COPY: one line per item, no blank line ─────────────────────────
    t.eq(list.copied, 'ระบบปฏิบัติการ Windows 11 / 10\nClaude Account (Free)\nInternet',
      `${s.id}: a list copies as one line per item`);
    t.ok(!list.copied.includes('\n\n'), `${s.id}: no blank line between items`);
    t.eq(nested.copied, 'Parent\n\nChild A\nChild B\nNext',
      `${s.id}: a nested list keeps the break before the sub-list and one line per child`);
    t.eq(multi.copied, 'First para\n\nSecond para\n\nSingle',
      `${s.id}: an item with TWO real paragraphs keeps them as paragraphs`);

    // ── THE RHYTHM: the gaps measured before the rule existed ──────────────
    for (const [i, g] of list.gaps.entries()) t.near(g, s.gap, 0.5, `${s.id}: gap between items ${i + 1}→${i + 2} is ${s.gap}px`);
    t.eq(list.gaps.length, 2, `${s.id}: three items measured`);
    for (const [i, g] of nested.nestedGaps.entries()) t.near(g, s.nested, 0.5, `${s.id}: nested gap ${i + 1}→${i + 2} is ${s.nested}px`);
    t.ok(list.pDisplay.every((d) => d === 'inline'), `${s.id}: a sole paragraph renders inline`, list.pDisplay.join(','));
    t.ok(multi.pDisplay.slice(0, 2).every((d) => d === 'block'), `${s.id}: paragraphs in a two-paragraph item stay block`);
  }

  // ── THE EDITOR IS UNTOUCHED ───────────────────────────────────────────────
  for (const e of EDITORS) {
    const list = m[`${e.id}-list`];
    t.ok(list.pDisplay.every((d) => d === 'block'), `${e.id}: the editor's paragraphs stay block`, list.pDisplay.join(','));
    t.eq(list.copied, 'ระบบปฏิบัติการ Windows 11 / 10\n\nClaude Account (Free)\n\nInternet',
      `${e.id}: the editor's selection serialises exactly as before (the rule does not reach .ProseMirror)`);
    for (const [i, g] of list.gaps.entries()) t.near(g, e.gap, 0.5, `${e.id}: editor item gap ${i + 1}→${i + 2} is ${e.gap}px, as before`);
  }
} finally {
  await close();
}

const { ok } = t.report();
process.exit(ok ? 0 : 1);
