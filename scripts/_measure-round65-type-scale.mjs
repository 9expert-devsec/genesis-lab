/**
 * ROUND 65 §A/§B/§C/§E/§G — the rich-text type scale, measured in Chrome.
 *
 * Round 23 established that only a browser resolves this and JSDOM resolves
 * NONE of it; rounds 59, 60 and 61 each said so again. A `prose-sm md:prose-base`
 * pair is a MEDIA QUERY on top of a plugin's em-relative cascade, which is two
 * layers of "you cannot read this off a class string" stacked.
 *
 * ── BOTH CLASS STRINGS ARE MEASURED IN ONE RUN ────────────────────────────
 * The before string (`prose-lg …my-4`) and the after string are painted side by
 * side, so the table is a real before/after rather than two runs compared from
 * notes. That is only sound because `prose-lg` is STILL emitted by the JIT —
 * ArticleDetailClient and CustomPageView use it — and the after classes are
 * live in rich_text.jsx. Round 59 nearly shipped a wrong number because an
 * injected class absent from src/ was never emitted, and a class that does not
 * exist measures exactly like one that does nothing; the liveness control below
 * is what keeps that from happening quietly.
 *
 * ── WHY INJECTION, AND WHY IT IS SOUND ────────────────────────────────────
 * Round 60's argument, unchanged: the published page-builder routes 404 on this
 * clone and /preview is password-gated, and what matters for a CASCADE question
 * is the document's stylesheet, not which route emitted the markup. The real
 * component is rendered to markup and injected into a live dev-server page,
 * which carries the real compiled CSS.
 *
 * ── TWO SURFACES, AND THE DIFFERENCE IS THE POINT ─────────────────────────
 *   PUBLISHED  painted at top level, so the media query reads the WINDOW.
 *              Measured at 1200 (desktop) and 390 (mobile).
 *   CANVAS     painted inside an IFRAME sized to CanvasPanel.VIEWPORT_WIDTH,
 *              inside a 1200px window. Round 20 established the canvas iframe
 *              clones the parent's stylesheets, so it resolves against the same
 *              CSS — but a media query inside an iframe reads the FRAME. That is
 *              the claim that makes the device-preview buttons preview the TYPE
 *              and not merely the layout, and it is measured rather than argued.
 *
 * ── CONTROLS ─────────────────────────────────────────────────────────────
 *   LIVENESS   a deliberately fake modifier (`prose-xxl`) must measure exactly
 *              like the bare base. If it moves anything, the harness is reading
 *              something other than what it thinks.
 *   DISCRIMINATION  before and after must DIFFER at both viewports. A run where
 *              they agree is a broken harness, not a clean result.
 *   WRAP       round 61's `[overflow-wrap:anywhere]`, re-measured over a long
 *              unbroken Thai run at both viewports, at the new sizes.
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round65-type-scale.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { launch, openPage } from '../test/browser/cdp.mjs';
import { declarationsFor, require_ } from '../test/twCompile.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RichTextSection } from '../src/components/pageBuilder/sections/rich_text.jsx';

/** Paragraphs, a bullet list, an h2, an h3, a blockquote and inline code. */
const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'หัวข้อระดับสอง' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าแรกของเนื้อหา rich text ที่ผู้เขียนพิมพ์เข้ามา' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าที่สอง ต่อจากย่อหน้าแรกทันที' }] },
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'หัวข้อระดับสาม' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'รายการที่หนึ่ง' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'รายการที่สอง' }] }] },
    ] },
    { type: 'blockquote', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'ข้อความที่ยกมา' }] },
    ] },
    { type: 'paragraph', content: [
      { type: 'text', marks: [{ type: 'code' }], text: 'inlineCode()' },
    ] },
  ],
};

/** A long unbroken Thai run, for the round 61 wrap check. */
const LONG = 'ท'.repeat(260);
const WRAP_DOC = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: LONG }] },
] };

/**
 * ── NO DEV SERVER: THE STYLESHEET IS COMPILED HERE ───────────────────────
 *
 * Round 60 injected into a live dev-server page. This round could not: the
 * route it used makes an upstream data call that wedged the server twice and
 * timed the navigation out, and a static policy page went the same way once the
 * server was busy. So the CSS is compiled directly — @tailwind base +
 * components + utilities over the REAL src/ tree, through the same postcss +
 * tailwind the guards in test/tailwindArbitraryValueRules already use — and
 * written into an about:blank page.
 *
 * That is not a workaround, it is a better instrument, and for one reason: the
 * liveness question becomes REAL. Tailwind scans source TEXT, so a class that
 * appears only in this probe is never emitted, and a class that does not exist
 * measures exactly like one that does nothing (round 59 nearly shipped a wrong
 * number that way). Here the CONTENT IS src/, so `prose-xxl` genuinely compiles
 * to nothing and the control below genuinely fires.
 *
 * Verified before the browser is opened: every class string this probe paints
 * is asserted to compile, by selector, out of the same CSS that is injected.
 */
const CONTENT = ['./src/**/*.{js,jsx,mjs}'];

async function compileCss() {
    // require_ resolves relative to test/, not to this file — absolute, so the
  // config is the repo's own rather than whatever sits beside the helper.
  const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const config = {
    presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
    content: CONTENT.map((g) => path.join(ROOT, g.replace('./', '')).split(path.sep).join('/')),
  };
  const r = await postcss([tailwindcss(config)]).process(
    '@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined },
  );
  return r.css;
}

const BEFORE =
  'prose prose-lg max-w-none prose-headings:font-heading '
  + 'prose-a:text-[var(--pb-accent-text)] prose-img:rounded-9e-md dark:prose-invert '
  + 'prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 [&_li>p]:my-0 '
  + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0';

/** The editor input's string, read for §E rather than retyped. */
const EDITOR =
  'prose prose-sm max-w-none focus:outline-none dark:prose-invert min-h-[8rem] '
  + 'prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 [&_li>p]:my-0 '
  + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0';

/** A modifier the plugin does not register — the liveness control. */
const FAKE = BEFORE.replace('prose-lg', 'prose-xxl');

const AFTER_HTML = renderToStaticMarkup(RichTextSection({ content: { doc: DOC } }));
const AFTER_WRAP = renderToStaticMarkup(RichTextSection({ content: { doc: WRAP_DOC } }));
/** The same nodes under another class string: swap the wrapper's class only. */
const withClass = (html, cls) => html.replace(/^<div class="[^"]*"/, `<div class="${cls}"`);

// ── what runs inside the page ─────────────────────────────────────────────

function paintTop(html, css) {
  if (!document.getElementById('tw')) {
    const st = document.createElement('style');
    st.id = 'tw'; st.textContent = css;
    document.head.appendChild(st);
  }
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0;background:#fff');
  const host = document.createElement('div');
  host.id = 'h';
  // The page wrapper's own declaration, round 61 — measured here because the
  // wrap check below depends on it reaching the section by inheritance.
  host.setAttribute('style', 'width:100%;--pb-accent-text:#005CFF;overflow-wrap:anywhere');
  host.innerHTML = html;
  document.body.appendChild(host);
  return true;
}

/**
 * Paint into an IFRAME of a given width, cloning the parent's stylesheets the
 * way CanvasPanel does, and return the frame's document for measuring.
 */
function paintFrame(html, width, css) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0;background:#fff');
  const f = document.createElement('iframe');
  f.id = 'f';
  f.setAttribute('style', `width:${width}px;height:2000px;border:0`);
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open();
  d.write('<!doctype html><html><head></head><body style="margin:0"></body></html>');
  d.close();
  // The real CanvasPanel clones the parent's stylesheets into the frame; here
  // the same compiled CSS is installed directly, which is the same stylesheet
  // by a shorter route. What is being measured is that the media query reads
  // the FRAME's width, and that is a property of the frame, not of how the CSS
  // arrived in it.
  const st = d.createElement('style');
  st.textContent = css;
  d.head.appendChild(st);
  const host = d.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:100%;--pb-accent-text:#005CFF;overflow-wrap:anywhere');
  host.innerHTML = html;
  d.body.appendChild(host);
  return true;
}

/**
 * Everything below runs INSIDE the page, so each function must be entirely
 * self-contained — `Runtime.evaluate` serialises one function, not its scope.
 * `inFrame` picks the document rather than a shared helper doing it.
 */
function readAt(inFrame) {
  const doc = inFrame ? document.getElementById('f').contentDocument : document;
  const host = doc.getElementById('h');
  if (!host) return { error: 'no host' };
  const g = (el) => {
    if (!el) return null;
    const c = doc.defaultView.getComputedStyle(el);
    return { size: c.fontSize, line: c.lineHeight };
  };
  const ps = [...host.querySelectorAll('p')]
    .filter((el) => !el.closest('li') && !el.closest('blockquote'));
  const lis = [...host.querySelectorAll('li')];
  const gap = (a, b) => (a && b
    ? +(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom).toFixed(1)
    : null);
  return {
    p: g(ps[0]),
    li: g(lis[0]),
    h2: g(host.querySelector('h2')),
    h3: g(host.querySelector('h3')),
    blockquote: g(host.querySelector('blockquote p')),
    code: g(host.querySelector('code')),
    gapPP: gap(ps[0], ps[1]),
    gapLI: gap(lis[0], lis[1]),
  };
}

/** Does the long run stay inside its box? */
function readOverflowAt(inFrame) {
  const doc = inFrame ? document.getElementById('f').contentDocument : document;
  const host = doc.getElementById('h');
  const box = host && host.querySelector('div');
  if (!box) return { error: 'no prose box' };
  return {
    clientWidth: box.clientWidth,
    scrollWidth: box.scrollWidth,
    overflows: box.scrollWidth > box.clientWidth + 1,
    bodyScroll: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1,
  };
}
// ── driver ────────────────────────────────────────────────────────────────

async function evaluate(page, fn, args = []) {
  const expr = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: false,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description ?? ''));
  return result.value;
}

const VARIANTS = {
  before: withClass(AFTER_HTML, BEFORE),
  after: AFTER_HTML,
  editor: withClass(AFTER_HTML, EDITOR),
  fakeControl: withClass(AFTER_HTML, FAKE),
};

async function main() {
  const { browser, close } = await launch();
  const out = { published: {}, canvas: {}, wrap: {}, controls: {} };
  try {
    /**
     * ONE page, RESIZED between measurements — not a page per viewport.
     * The media query is the whole point, so the viewport has to move; but a
     * second Target.createTarget after a navigation timed the driver out, and
     * re-navigating per width would reload the stylesheet for no gain.
     * Emulation.setDeviceMetricsOverride is what openPage itself uses, so
     * calling it again is the same mechanism, not a second one.
     */
    const page = await openPage(browser, { width: 1200, height: 900 });
    const css = await compileCss();
    // Every class this probe paints must exist in that CSS. Asserted by
    // SELECTOR out of the compiled output, before a single measurement is
    // taken — otherwise a missing rule and a rule that does nothing are the
    // same reading.
    for (const c of ['prose-lg', 'prose-sm', 'prose-base', 'md:prose-base',
      'prose-p:my-3', 'md:prose-p:my-4', 'prose-li:my-1', '[&_li>p]:my-0']) {
      if (!declarationsFor(css, c).length) throw new Error('does not compile: ' + c);
    }
    if (declarationsFor(css, 'prose-xxl').length) {
      throw new Error('the liveness control compiles — pick a modifier the plugin really lacks');
    }
    await page.send('Page.navigate', { url: 'about:blank' });
    await new Promise((r) => setTimeout(r, 400));

    const resize = async (width) => {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: false,
        screenWidth: width, screenHeight: 900,
      });
      await new Promise((r) => setTimeout(r, 250));
    };

    for (const [label, width] of [['desktop@1200', 1200], ['mobile@390', 390]]) {
      await resize(width);
      out.published[label] = {};
      for (const [name, html] of Object.entries(VARIANTS)) {
        await evaluate(page, paintTop, [html, css]);
        out.published[label][name] = await evaluate(page, readAt, [false]);
      }
      await evaluate(page, paintTop, [AFTER_WRAP, css]);
      out.wrap['published ' + label] = await evaluate(page, readOverflowAt, [false]);
    }

    // The canvas: one 1200px WINDOW, three frame widths — the editor's own map.
    await resize(1200);
    for (const [label, width] of [['desktop(frame 1100)', 1100], ['tablet(frame 768)', 768], ['mobile(frame 390)', 390]]) {
      await evaluate(page, paintFrame, [VARIANTS.after, width, css]);
      out.canvas[label] = await evaluate(page, readAt, [true]);
      await evaluate(page, paintFrame, [AFTER_WRAP, width, css]);
      out.wrap['canvas ' + label] = await evaluate(page, readOverflowAt, [true]);
    }

    // ── controls ──────────────────────────────────────────────────────────
    const d = out.published['desktop@1200'];
    const m = out.published['mobile@390'];
    out.controls = {
      fakeModifierPSize: d.fakeControl?.p?.size,
      baseNoModifierExpected: '16px',
      fakeModifierIsInert: d.fakeControl?.p?.size === '16px', // prose with no size modifier is 1rem
      beforeAfterDifferDesktop: JSON.stringify(d.before) !== JSON.stringify(d.after),
      beforeAfterDifferMobile: JSON.stringify(m.before) !== JSON.stringify(m.after),
      mediaQueryActuallyFlips: d.after?.p?.size !== m.after?.p?.size,
      canvasFrameDrivesQuery:
        out.canvas['mobile(frame 390)']?.p?.size !== out.canvas['tablet(frame 768)']?.p?.size,
      editorMatchesMobileBody: JSON.stringify(d.editor?.p) === JSON.stringify(m.after?.p),
    };
  } finally { await close(); }

  console.log(JSON.stringify(out, null, 2));

  const c = out.controls;
  const bad = [];
  if (!c.beforeAfterDifferDesktop) bad.push('before and after agree at desktop');
  if (!c.beforeAfterDifferMobile) bad.push('before and after agree at mobile');
  if (!c.mediaQueryActuallyFlips) bad.push('the md: query did not flip the size');
  if (!c.canvasFrameDrivesQuery) bad.push('the canvas iframe width did not drive the query');
  if (!c.fakeModifierIsInert) bad.push('the fake modifier was not inert (' + c.fakeModifierPSize + ')');
  if (Object.values(out.wrap).some((w) => w.overflows || w.bodyScroll)) bad.push('a long run overflowed');
  if (bad.length) { console.error('CONTROLS FAILED: ' + bad.join('; ')); process.exit(1); }
  console.log('controls pass: the fake modifier is inert, before != after at both '
    + 'viewports, the query flips, the canvas frame drives it, and nothing overflows.');
}
await main();
