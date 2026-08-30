/**
 * ROUND 61 §A/§B/§D/§E/§G — what fails to constrain a long unbroken run.
 *
 * Round 23: only a browser resolves this. So every number here is computed in
 * Chrome, and the ANCESTOR CHAIN is walked from the text node up so the report
 * names the first box that fails to constrain its child rather than the box the
 * text happens to sit in.
 *
 * ── THE THAI QUESTION IS NOT THE SYNTHETIC ONE ───────────────────────────
 * `ทททท…` repeated has no line-break opportunity at all. Ordinary Thai prose
 * does: Chrome runs ICU dictionary breaking when the content is tagged Thai, and
 * <html lang="th"> is set in layout.jsx. So the two cases can behave completely
 * differently and a fix judged only on the synthetic run can quietly wreck real
 * prose. Both are measured, and for real prose the probe counts BAD BREAKS — a
 * line that begins with a Thai combining mark (U+0E31, U+0E34-U+0E3A,
 * U+0E47-U+0E4E) is a break inside a syllable cluster, which is the failure
 * `word-break: break-all` produces and which a Thai reader sees immediately.
 *
 * ── NO TEMP FILE ANYWHERE THE SUITE OR TAILWIND CAN SEE ──────────────────
 * This probe writes nothing. The measure script beside it writes its baselines
 * to scripts/*.generated.mjs, pre-transpiled — see that file's header.
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   FC_PORT=3001 node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round61-overflow.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';
import { SectionRenderer } from '../src/components/pageBuilder/SectionRenderer.jsx';

/** The reported case: a bullet whose text is one unbroken run. */
const RUN = 'ท'.repeat(120);
/** Ordinary Thai prose — the case that must NOT be broken mid-syllable. */
const PROSE =
  'หลักสูตรนี้ออกแบบมาสำหรับผู้ที่ต้องการเริ่มต้นใช้งานปัญญาประดิษฐ์ในการทำงานจริง '
  + 'โดยเน้นการลงมือปฏิบัติจริงตลอดทั้งหลักสูตร ผู้เรียนจะได้เรียนรู้วิธีการสร้างแอปพลิเคชัน '
  + 'ทางธุรกิจด้วยเครื่องมือสมัยใหม่ และสามารถนำไปประยุกต์ใช้กับงานของตนเองได้ทันที '
  + 'พร้อมทั้งได้รับเอกสารประกอบการอบรมและใบประกาศนียบัตรเมื่อจบหลักสูตร';

const doc = (items) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้านำ' }] },
    { type: 'bulletList', content: items.map((t) => ({
      type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
    })) },
  ],
});

const richTextSection = (d) => ({
  id: 'rt', type: 'rich_text', name: '', enabled: true, sortOrder: 0,
  settings: { containerWidth: 'large', spacingTop: 'none', spacingBottom: 'none', background: 'default', visibility: 'all' },
  layout: {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  content: { doc: d },
});

/** The reported shape: rich_text in two_column's right slot. */
const twoColumn = (d) => ({
  id: 'tc', type: 'two_column', name: '', enabled: true, sortOrder: 0,
  settings: { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium', background: 'default', visibility: 'all' },
  layout: { ratio: '50-50' }, style: {},
  advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  content: { left: [], right: [richTextSection(d)] },
});

const draw = (section) => renderToStaticMarkup(
  SectionRenderer({ section, path: null, resolvedData: undefined }),
);

/** Walk from the deepest element containing `needle` up to #h, reporting each box. */
function chain(html, needle) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0;background:#fff');
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:1200px;--pb-accent-text:#005CFF');
  host.innerHTML = html;
  document.body.appendChild(host);

  let el = null;
  for (const n of host.querySelectorAll('*')) {
    if (n.children.length === 0 && n.textContent.includes(needle)) { el = n; break; }
  }
  if (!el) return { error: 'needle not found' };

  const rows = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const c = getComputedStyle(n);
    const parent = n.parentElement ? getComputedStyle(n.parentElement) : null;
    rows.push({
      tag: n.tagName.toLowerCase(),
      cls: (n.getAttribute('class') ?? '').slice(0, 46),
      scrollW: n.scrollWidth,
      clientW: n.clientWidth,
      overflows: n.scrollWidth > n.clientWidth + 1,
      display: c.display,
      minWidth: c.minWidth,
      overflowWrap: c.overflowWrap,
      wordBreak: c.wordBreak,
      whiteSpace: c.whiteSpace,
      overflowX: c.overflowX,
      parentDisplay: parent?.display ?? null,
    });
    if (n.id === 'h') break;
  }
  return { rows, hostScrollW: host.scrollWidth, hostClientW: host.clientWidth };
}

/** Line boxes for the text in `needle`, plus breaks that land inside a cluster. */
function lines(html, needle) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0;background:#fff');
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:1200px;--pb-accent-text:#005CFF');
  host.innerHTML = html;
  document.body.appendChild(host);

  let node = null;
  const it = document.createNodeIterator(host, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.textContent.includes(needle.slice(0, 12))) { node = n; break; }
  }
  if (!node) return { error: 'text node not found' };

  const s = node.textContent;
  const r = document.createRange();
  r.selectNodeContents(node);
  const boxes = [...r.getClientRects()];

  // Which character index starts each visual line? Walk per character and note
  // where `top` changes.
  const COMBINING = /[ัิ-ฺ็-๎]/;
  const starts = []; let lastTop = null;
  for (let i = 0; i < s.length; i += 1) {
    const cr = document.createRange();
    cr.setStart(node, i); cr.setEnd(node, i + 1);
    const b = cr.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    if (lastTop === null || Math.abs(b.top - lastTop) > 1) { starts.push(i); lastTop = b.top; }
  }
  const badBreaks = starts.slice(1).filter((i) => COMBINING.test(s[i]));
  return {
    chars: s.length,
    lineBoxes: boxes.length,
    lineStarts: starts.length,
    badBreaks: badBreaks.length,
    badExamples: badBreaks.slice(0, 4).map((i) => s.slice(Math.max(0, i - 3), i + 3)),
    widest: Math.round(Math.max(0, ...boxes.map((b) => b.width))),
  };
}

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1440, height: 1000 });
    await page.send('Page.navigate', { url: ORIGIN + '/promotions' });
    await new Promise((r) => setTimeout(r, 8000));

    const dead = await page.eval((classes) => {
      const BASE = 'prose prose-lg';
      const host = document.createElement('div');
      host.innerHTML = '<p>a</p><ul><li><p>b</p></li></ul>';
      document.body.appendChild(host);
      const snap = (el) => [el, ...el.querySelectorAll('*')]
        .map((n) => { const c = getComputedStyle(n);
          return [c.marginTop, c.marginBottom, c.minWidth, c.overflowWrap, c.wordBreak, c.maxWidth].join('|'); })
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
    }, ['min-w-0', 'break-words', 'break-all', '[overflow-wrap:anywhere]', 'not-a-real-class-control']);
    console.log('DEAD classes (expect the fake one only): ' + JSON.stringify(dead));

    console.log('');
    console.log('### §A  ancestor chain, unbroken run inside two_column right slot');
    const c = await page.eval(chain, draw(twoColumn(doc([RUN]))), RUN.slice(0, 20));
    console.log('host scrollW ' + c.hostScrollW + ' clientW ' + c.hostClientW);
    console.log('tag  overflows  scrollW/clientW   display        minWidth  overflow-wrap  word-break  parentDisplay  class');
    for (const r of c.rows.reverse()) {
      console.log(
        r.tag.padEnd(5) + String(r.overflows).padEnd(11)
        + (r.scrollW + '/' + r.clientW).padEnd(18)
        + r.display.padEnd(15) + r.minWidth.padEnd(10)
        + r.overflowWrap.padEnd(15) + r.wordBreak.padEnd(12)
        + String(r.parentDisplay).padEnd(15) + r.cls);
    }

    console.log('');
    console.log('### §A  the same rich_text with NO two_column around it');
    const c2 = await page.eval(chain, draw(richTextSection(doc([RUN]))), RUN.slice(0, 20));
    for (const r of c2.rows.reverse()) {
      console.log(
        r.tag.padEnd(5) + String(r.overflows).padEnd(11)
        + (r.scrollW + '/' + r.clientW).padEnd(18)
        + r.display.padEnd(15) + r.minWidth.padEnd(10)
        + r.overflowWrap.padEnd(15) + r.wordBreak.padEnd(12)
        + String(r.parentDisplay).padEnd(15) + r.cls);
    }

    console.log('');
    console.log('### §G  ordinary Thai prose, WITHOUT any fix — does it already wrap?');
    for (const [label, wrapper] of [['bare rich_text', richTextSection], ['in two_column', twoColumn]]) {
      const m = await page.eval(lines, draw(wrapper(doc([PROSE]))), PROSE);
      console.log('  ' + label.padEnd(16) + JSON.stringify(m));
    }
    console.log('  (badBreaks = a line starting with a Thai combining mark)');

    console.log('');
    console.log('### §G  what each candidate does to the SAME Thai prose');
    for (const extra of ['', 'break-words', 'break-all', '[overflow-wrap:anywhere]']) {
      const html = draw(richTextSection(doc([PROSE])))
        .replace('class="prose prose-lg', `class="${extra} prose prose-lg`);
      const m = await page.eval(lines, html, PROSE);
      console.log('  ' + (extra || '(none)').padEnd(26) + JSON.stringify(m));
    }
    console.log('');
    console.log('### §G  and to the synthetic unbroken run');
    for (const extra of ['', 'break-words', 'break-all', '[overflow-wrap:anywhere]']) {
      const html = draw(richTextSection(doc([RUN])))
        .replace('class="prose prose-lg', `class="${extra} prose prose-lg`);
      const m = await page.eval(lines, html, RUN.slice(0, 12));
      console.log('  ' + (extra || '(none)').padEnd(26) + JSON.stringify(m));
    }

    /**
     * ── THE CANDIDATES AS CSS PROPERTIES, NOT AS CLASSES ─────────────────
     * The class-based pass above reported `[overflow-wrap:anywhere]` as having
     * no effect. That is NOT a fact about `anywhere`: the class is in no source
     * file, so Tailwind never emitted a rule for it, and an unemitted class
     * measures exactly like an inert one (round 60's trap, third occurrence).
     * These apply the PROPERTY inline, so what is measured is the CSS.
     *
     * Two widths, because the failure mode differs: the repo already recorded
     * (globals.css, the article-table note) that `overflow-wrap: break-word`
     * does NOT reduce min-content width — only `anywhere` does — so inside a
     * grid/flex track with `min-width: auto` the TRACK can still be forced wide
     * even though the text itself wraps.
     */
    console.log('');
    console.log('### the candidates as PROPERTIES, both containers, both widths');
    const CAND = {
      '(none)': '',
      'overflow-wrap:break-word': 'overflow-wrap:break-word',
      'overflow-wrap:anywhere': 'overflow-wrap:anywhere',
      'word-break:break-all': 'word-break:break-all',
      'min-width:0 only': '',
    };
    for (const width of [1200, 380]) {
      for (const [label, wrapper] of [['bare', richTextSection], ['two_column', twoColumn]]) {
        console.log('  -- host ' + width + 'px, ' + label);
        for (const [name, css] of Object.entries(CAND)) {
          const minw = name === 'min-width:0 only';
          const html = draw(wrapper(doc([RUN])))
            .replace('class="prose prose-lg', `style="${css}" class="prose prose-lg`);
          const m = await page.eval((h, w, forceMinW) => {
            document.body.innerHTML = '';
            const host = document.createElement('div');
            host.id = 'h';
            host.setAttribute('style', `width:${w}px;--pb-accent-text:#005CFF`);
            host.innerHTML = h;
            document.body.appendChild(host);
            if (forceMinW) {
              for (const n of host.querySelectorAll('div,section')) {
                const p = n.parentElement && getComputedStyle(n.parentElement).display;
                if (p === 'grid' || p === 'flex') n.style.minWidth = '0';
              }
            }
            return { hostScrollW: host.scrollWidth, hostClientW: host.clientWidth,
                     overflows: host.scrollWidth > host.clientWidth + 1 };
          }, html, width, minw);
          console.log('     ' + name.padEnd(26) + 'scrollW ' + String(m.hostScrollW).padEnd(6)
            + 'clientW ' + String(m.hostClientW).padEnd(6) + 'overflows ' + m.overflows);
        }
      }
    }

    console.log('');
    console.log('### §G  Thai PROSE at a narrow width — where break-all can do damage');
    for (const width of [380, 260]) {
      for (const [name, css] of Object.entries({
        '(none)': '', 'overflow-wrap:break-word': 'overflow-wrap:break-word',
        'overflow-wrap:anywhere': 'overflow-wrap:anywhere', 'word-break:break-all': 'word-break:break-all',
      })) {
        const html = draw(richTextSection(doc([PROSE])))
          .replace('class="prose prose-lg', `style="${css}" class="prose prose-lg`);
        const m = await page.eval((h, w, needle) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', `width:${w}px`);
          host.innerHTML = h;
          document.body.appendChild(host);
          let node = null;
          const it = document.createNodeIterator(host, NodeFilter.SHOW_TEXT);
          for (let n = it.nextNode(); n; n = it.nextNode()) {
            if (n.textContent.includes(needle)) { node = n; break; }
          }
          if (!node) return { error: 'no node' };
          const s = node.textContent;
          const COMBINING = /[ัิ-ฺ็-๎]/;
          const starts = []; let lastTop = null;
          for (let i = 0; i < s.length; i += 1) {
            const cr = document.createRange();
            cr.setStart(node, i); cr.setEnd(node, i + 1);
            const b = cr.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) continue;
            if (lastTop === null || Math.abs(b.top - lastTop) > 1) { starts.push(i); lastTop = b.top; }
          }
          const bad = starts.slice(1).filter((i) => COMBINING.test(s[i]));
          return { lines: starts.length, badBreaks: bad.length,
                   badExamples: bad.slice(0, 3).map((i) => s.slice(Math.max(0, i - 4), i + 4)),
                   overflows: host.scrollWidth > host.clientWidth + 1 };
        }, html, width, PROSE.slice(0, 12));
        console.log('  ' + String(width).padEnd(5) + name.padEnd(26) + JSON.stringify(m));
      }
    }

    /**
     * ── ALL FIVE RATIOS, BECAUSE THEY ARE NOT THE SAME SHAPE ─────────────
     * `50-50` compiles to `lg:grid-cols-2`, and Tailwind's grid-cols-N uses
     * `repeat(N, minmax(0, 1fr))` — track minimum 0. The other four are
     * arbitrary track lists (`lg:grid-cols-[2fr_3fr]`), and a bare `<n>fr`
     * track has an AUTOMATIC MINIMUM of min-content. So an unbreakable run can
     * force those four tracks wide in a way it cannot force `50-50`. Measuring
     * only the reported ratio would have missed that entirely.
     */
    console.log('');
    console.log('### all five two_column ratios, before and after break-words');
    const RATIOS = ['50-50', '40-60', '60-40', '30-70', '70-30'];
    for (const ratio of RATIOS) {
      const sec = twoColumn(doc([RUN]));
      sec.layout = { ratio };
      const base = draw(sec);
      for (const [label, html] of [
        ['before', base],
        ['after ', base.replace('class="prose prose-lg', 'class="break-words prose prose-lg')],
      ]) {
        const m = await page.eval((h) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:1200px');
          host.innerHTML = h;
          document.body.appendChild(host);
          const grid = host.querySelector('.grid');
          return { hostScrollW: host.scrollWidth, hostClientW: host.clientWidth,
                   gridScrollW: grid?.scrollWidth ?? null, gridClientW: grid?.clientWidth ?? null,
                   overflows: host.scrollWidth > host.clientWidth + 1 };
        }, html);
        console.log('  ' + ratio.padEnd(7) + label + '  host ' + String(m.hostScrollW).padEnd(6)
          + '/' + String(m.hostClientW).padEnd(6) + ' grid ' + String(m.gridScrollW).padEnd(6)
          + '/' + String(m.gridClientW).padEnd(6) + ' overflows ' + m.overflows);
      }
    }

    console.log('');
    console.log('### §D/§E  do other surfaces overflow the same way?');
    const OTHERS = {
      'article body': `<div class="article-content prose prose-lg max-w-none"><ul><li><p>${RUN}</p></li></ul></div>`,
      'heading': draw({ id: 'h1', type: 'heading', name: '', enabled: true, sortOrder: 0,
        settings: {}, layout: {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
        content: { text: RUN, level: 'h2' } }),
      'checklist': draw({ id: 'c1', type: 'checklist', name: '', enabled: true, sortOrder: 0,
        settings: {}, layout: {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
        content: { items: [RUN] } }),
      'price_card title': draw({ id: 'p1', type: 'price_card', name: '', enabled: true, sortOrder: 0,
        settings: {}, layout: {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
        content: { title: RUN, price: '1', features: [] } }),
      'notice': draw({ id: 'n1', type: 'notice', name: '', enabled: true, sortOrder: 0,
        settings: {}, layout: {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
        content: { text: RUN } }),
    };
    for (const [name, html] of Object.entries(OTHERS)) {
      const m = await page.eval((h) => {
        document.body.innerHTML = '';
        const host = document.createElement('div');
        host.id = 'h';
        host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
        host.innerHTML = h;
        document.body.appendChild(host);
        return { scrollW: host.scrollWidth, clientW: host.clientWidth,
                 overflows: host.scrollWidth > host.clientWidth + 1 };
      }, html);
      console.log('  ' + name.padEnd(18) + 'scrollW ' + String(m.scrollW).padEnd(6)
        + 'clientW ' + String(m.clientW).padEnd(6) + 'OVERFLOWS ' + m.overflows);
    }

    console.log('');
    console.log('### §G  what break-all does to LATIN words (the reason to reject it)');
    const LATIN = 'Build Business Apps with Claude Code for professional developers';
    for (const [name, css] of Object.entries({
      '(none)': '', 'overflow-wrap:break-word': 'overflow-wrap:break-word',
      'word-break:break-all': 'word-break:break-all',
    })) {
      const html = draw(richTextSection(doc([LATIN])))
        .replace('class="prose prose-lg', `style="${css}" class="prose prose-lg`);
      const m = await page.eval((h, needle) => {
        document.body.innerHTML = '';
        const host = document.createElement('div');
        host.id = 'h';
        host.setAttribute('style', 'width:300px');
        host.innerHTML = h;
        document.body.appendChild(host);
        let node = null;
        const it = document.createNodeIterator(host, NodeFilter.SHOW_TEXT);
        for (let n = it.nextNode(); n; n = it.nextNode()) {
          if (n.textContent.includes(needle)) { node = n; break; }
        }
        const s = node.textContent;
        const starts = []; let lastTop = null;
        for (let i = 0; i < s.length; i += 1) {
          const cr = document.createRange();
          cr.setStart(node, i); cr.setEnd(node, i + 1);
          const b = cr.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (lastTop === null || Math.abs(b.top - lastTop) > 1) { starts.push(i); lastTop = b.top; }
        }
        // A break is MID-WORD if the character before it is not a space.
        const midWord = starts.slice(1).filter((i) => s[i - 1] && s[i - 1] !== ' ');
        return { lines: starts.length, midWordBreaks: midWord.length,
                 examples: midWord.slice(0, 3).map((i) => s.slice(Math.max(0, i - 5), i + 5)) };
      }, html, LATIN.slice(0, 10));
      console.log('  ' + name.padEnd(26) + JSON.stringify(m));
    }

    /**
     * ── THE CANDIDATE FIX, MEASURED AS A PAIR ───────────────────────────
     * `break-words` on the PAGE WRAPPER (overflow-wrap is inherited, so every
     * section gets it without its own class attribute moving) plus `min-w-0` on
     * two_column's two column divs (not inheritable, and required because four
     * of the five ratios are bare `fr` tracks whose automatic minimum is
     * min-content — which overflow-wrap:break-word does not reduce).
     *
     * Both halves are applied here the way the components would, so the numbers
     * are the fix's numbers rather than an argument about them.
     */
    console.log('');
    console.log('### CANDIDATE: break-words on the page wrapper + min-w-0 on two_column columns');
    console.log('ratio    variant                          host scrollW/clientW  overflows');
    for (const ratio of ['50-50', '40-60', '60-40', '30-70', '70-30']) {
      const sec = twoColumn(doc([RUN]));
      sec.layout = { ratio };
      const base = draw(sec);
      const variants = {
        'none': [false, false],
        'break-words only': [true, false],
        'min-w-0 only': [false, true],
        'BOTH': [true, true],
      };
      for (const [name, [wrap, minw]] of Object.entries(variants)) {
        const m = await page.eval((h, doWrap, doMinW) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:1200px');
          // the PAGE wrapper, exactly as PageBuilderView/CanvasPanel render it
          host.innerHTML = `<div class="${doWrap ? 'break-words' : ''}">${h}</div>`;
          document.body.appendChild(host);
          if (doMinW) {
            const grid = host.querySelector('.grid');
            for (const col of grid ? [...grid.children] : []) col.classList.add('min-w-0');
          }
          return { s: host.scrollWidth, c: host.clientWidth,
                   over: host.scrollWidth > host.clientWidth + 1 };
        }, base, wrap, minw);
        console.log('  ' + ratio.padEnd(8) + name.padEnd(33) + (m.s + '/' + m.c).padEnd(22) + m.over);
      }
    }

    console.log('');
    console.log('### inheritance really reaches every section type from the page wrapper');
    for (const [name, html] of Object.entries(OTHERS)) {
      const m = await page.eval((h) => {
        const out = {};
        for (const wrap of [false, true]) {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
          host.innerHTML = `<div class="${wrap ? 'break-words' : ''}">${h}</div>`;
          document.body.appendChild(host);
          out[wrap ? 'after' : 'before'] = {
            s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1,
          };
        }
        return out;
      }, html);
      console.log('  ' + name.padEnd(18) + 'before ' + String(m.before.s).padEnd(6) + String(m.before.over).padEnd(7)
        + '  after ' + String(m.after.s).padEnd(6) + m.after.over);
    }

    console.log('');
    console.log('### §G  Thai PROSE under the candidate — must be untouched');
    for (const width of [1200, 380, 260]) {
      const html = draw(richTextSection(doc([PROSE])));
      const m = await page.eval((h, w, needle) => {
        const run = (wrap) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.setAttribute('style', `width:${w}px`);
          host.innerHTML = `<div class="${wrap ? 'break-words' : ''}">${h}</div>`;
          document.body.appendChild(host);
          let node = null;
          const it = document.createNodeIterator(host, NodeFilter.SHOW_TEXT);
          for (let n = it.nextNode(); n; n = it.nextNode()) {
            if (n.textContent.includes(needle)) { node = n; break; }
          }
          const s = node.textContent;
          const COMBINING = /[ัิ-ฺ็-๎]/;
          const starts = []; let lastTop = null;
          for (let i = 0; i < s.length; i += 1) {
            const cr = document.createRange();
            cr.setStart(node, i); cr.setEnd(node, i + 1);
            const b = cr.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) continue;
            if (lastTop === null || Math.abs(b.top - lastTop) > 1) { starts.push(i); lastTop = b.top; }
          }
          const bad = starts.slice(1).filter((i) => COMBINING.test(s[i]));
          return { lines: starts.length, bad: bad.length };
        };
        return { before: run(false), after: run(true) };
      }, html, width, PROSE.slice(0, 12));
      console.log('  ' + String(width).padEnd(6) + 'before lines ' + m.before.lines + ' bad ' + m.before.bad
        + '   after lines ' + m.after.lines + ' bad ' + m.after.bad
        + '   identical: ' + (m.before.lines === m.after.lines && m.after.bad === 0));
    }

    /**
     * ── THE EXHAUSTIVE SWEEP, so the fix is bounded by measurement ────────
     * Every SELF-CONTAINED section type (the data-backed ones need a resolver
     * and are excluded by name, not silently), rendered with the unbroken run
     * in each of its text fields, under the page wrapper. Whatever still
     * overflows AFTER the inherited break-words is a box whose own min-width
     * blocks it — the flex/grid-item case — and that list is exactly what
     * min-w-0 has to be applied to. Nothing more.
     */
    console.log('');
    console.log('### EXHAUSTIVE: which section types still overflow WITH break-words inherited');
    const mk = (type, content, layout) => ({
      id: 's', type, name: '', enabled: true, sortOrder: 0,
      settings: { containerWidth: 'large', spacingTop: 'none', spacingBottom: 'none', background: 'default', visibility: 'all' },
      layout: layout ?? {}, style: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
      content,
    });
    const CASES = [
      ['heading', mk('heading', { text: RUN, level: 'h2' })],
      ['rich_text', mk('rich_text', { doc: doc([RUN]) })],
      ['cta', mk('cta', { heading: RUN, description: RUN, buttonLabel: RUN, buttonHref: '/a' })],
      ['checklist', mk('checklist', { items: [RUN], heading: RUN })],
      ['notice', mk('notice', { text: RUN })],
      ['container', mk('container', { children: [mk('heading', { text: RUN, level: 'h3' })] })],
      ['two_column', mk('two_column', { left: [], right: [mk('rich_text', { doc: doc([RUN]) })] }, { ratio: '40-60' })],
      ['card_grid', mk('card_grid', { children: [mk('price_card', { title: RUN, price: '1', features: [RUN] })] }, { columns: 2 })],
      ['highlight_grid', mk('highlight_grid', { children: [mk('stat_card', { value: RUN, label: RUN })] }, { columns: 2 })],
      ['timeline', mk('timeline', { items: [{ title: RUN, description: RUN }] })],
      ['tabs', mk('tabs', { items: [{ label: 'ก', body: RUN }] })],
      ['accordion', mk('accordion', { items: [{ title: RUN, body: RUN }] })],
      ['price_card', mk('price_card', { title: RUN, price: RUN, period: RUN, features: [RUN], footnote: RUN, ribbon: RUN, buttonLabel: RUN, buttonHref: '/a' })],
      ['stat_card', mk('stat_card', { value: RUN, label: RUN })],
      ['icon_card', mk('icon_card', { title: RUN, description: RUN, icon: 'Users' })],
      ['instructor_card', mk('instructor_card', { name: RUN, title: RUN, bio: RUN })],
      ['full_width', mk('full_width', { children: [mk('notice', { text: RUN })] })],
    ];
    console.log('type              before   after(break-words)  still overflows');
    const stillBad = [];
    for (const [name, section] of CASES) {
      let html;
      try { html = draw(section); } catch (e) { console.log('  ' + name.padEnd(17) + 'THREW ' + (e?.message ?? e)); continue; }
      const m = await page.eval((h) => {
        const run = (wrap) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
          host.innerHTML = `<div class="${wrap ? 'break-words' : ''}">${h}</div>`;
          document.body.appendChild(host);
          return { s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1 };
        };
        return { before: run(false), after: run(true) };
      }, html);
      if (m.after.over) stillBad.push(name);
      console.log('  ' + name.padEnd(17) + String(m.before.s).padEnd(9) + String(m.after.s).padEnd(20) + m.after.over);
    }
    console.log('');
    console.log('  STILL OVERFLOWING after break-words: ' + JSON.stringify(stillBad));

    /**
     * ── ONE LEVER FOR THE CONTAINER CASES ────────────────────────────────
     * Every nested section is wrapped by SectionRenderer in a <section>, and
     * THAT element is the flex/grid item whenever a container lays it out
     * (two_column's flex columns, card_grid's grid, full_width's flex column).
     * So `min-w-0` belongs on that wrapper rather than being sprinkled per
     * container. On a section that is NOT a flex/grid item it is a no-op —
     * `min-width: auto` already computes to 0 for a block — which is what makes
     * it safe to apply universally. Tested here by injection before any source
     * is touched.
     */
    console.log('');
    console.log('### LEVER TEST: break-words on page wrapper + min-w-0 on every <section>');
    console.log('type              none     +wrap    +wrap+minw0  fixed');
    for (const [name, section] of CASES) {
      let html;
      try { html = draw(section); } catch { continue; }
      const m = await page.eval((h) => {
        const run = (wrap, minw) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
          host.innerHTML = `<div class="${wrap ? 'break-words' : ''}">${h}</div>`;
          document.body.appendChild(host);
          if (minw) for (const sec of host.querySelectorAll('section')) sec.classList.add('min-w-0');
          return { s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1 };
        };
        return { none: run(false, false), wrap: run(true, false), both: run(true, true) };
      }, html);
      console.log('  ' + name.padEnd(17) + String(m.none.s).padEnd(9) + String(m.wrap.s).padEnd(9)
        + String(m.both.s).padEnd(13) + (!m.both.over));
    }

    /**
     * ── `anywhere` AS THE SINGLE INHERITED LEVER ─────────────────────────
     * globals.css already records the governing fact, from the article-table
     * round: `overflow-wrap: break-word` does NOT reduce a box's min-content
     * width (CSS Text 3 §5.5 — its soft wrap opportunities are not counted when
     * computing min-content); only `anywhere` counts. That is exactly why
     * break-words fixed the plain blocks and left every flex/grid case at a
     * min-content floor, and why min-w-0 on the wrapper did not rescue them.
     *
     * `anywhere` is inherited, so one declaration on the page wrapper reaches
     * every section AND reduces the min-content contribution that the tracks are
     * sized from. Applied inline here because no Tailwind utility emits it and
     * an unemitted class measures exactly like an inert one (round 60).
     */
    console.log('');
    console.log('### LEVER TEST 2: overflow-wrap:anywhere on the page wrapper, alone');
    console.log('type              none     anywhere   fixed');
    const anyBad = [];
    for (const [name, section] of CASES) {
      let html;
      try { html = draw(section); } catch { continue; }
      const m = await page.eval((h) => {
        const run = (css) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
          host.innerHTML = `<div style="${css}">${h}</div>`;
          document.body.appendChild(host);
          return { s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1 };
        };
        return { none: run(''), any: run('overflow-wrap:anywhere') };
      }, html);
      if (m.any.over) anyBad.push(name);
      console.log('  ' + name.padEnd(17) + String(m.none.s).padEnd(9) + String(m.any.s).padEnd(11) + (!m.any.over));
    }
    console.log('  STILL OVERFLOWING with anywhere: ' + JSON.stringify(anyBad));

    console.log('');
    console.log('### and all five two_column ratios under `anywhere` alone');
    for (const ratio of ['50-50', '40-60', '60-40', '30-70', '70-30']) {
      const sec = twoColumn(doc([RUN]));
      sec.layout = { ratio };
      const m = await page.eval((h) => {
        const run = (css) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.id = 'h';
          host.setAttribute('style', 'width:1200px');
          host.innerHTML = `<div style="${css}">${h}</div>`;
          document.body.appendChild(host);
          return { s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1 };
        };
        return { none: run(''), any: run('overflow-wrap:anywhere') };
      }, draw(sec));
      console.log('  ' + ratio.padEnd(8) + 'none ' + String(m.none.s).padEnd(7)
        + 'anywhere ' + String(m.any.s).padEnd(7) + 'fixed ' + (!m.any.over));
    }

    console.log('');
    console.log('### §G  Thai prose under `anywhere` — must be unchanged');
    for (const width of [1200, 380, 260]) {
      const m = await page.eval((h, w, needle) => {
        const run = (css) => {
          document.body.innerHTML = '';
          const host = document.createElement('div');
          host.setAttribute('style', `width:${w}px`);
          host.innerHTML = `<div style="${css}">${h}</div>`;
          document.body.appendChild(host);
          let node = null;
          const it = document.createNodeIterator(host, NodeFilter.SHOW_TEXT);
          for (let n = it.nextNode(); n; n = it.nextNode()) {
            if (n.textContent.includes(needle)) { node = n; break; }
          }
          const s = node.textContent;
          const COMBINING = /[ัิ-ฺ็-๎]/;
          const starts = []; let lastTop = null;
          for (let i = 0; i < s.length; i += 1) {
            const cr = document.createRange();
            cr.setStart(node, i); cr.setEnd(node, i + 1);
            const b = cr.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) continue;
            if (lastTop === null || Math.abs(b.top - lastTop) > 1) { starts.push(i); lastTop = b.top; }
          }
          return { lines: starts.length, bad: starts.slice(1).filter((i) => COMBINING.test(s[i])).length };
        };
        return { none: run(''), any: run('overflow-wrap:anywhere') };
      }, draw(richTextSection(doc([PROSE]))), width, PROSE.slice(0, 12));
      console.log('  ' + String(width).padEnd(6) + 'none lines ' + m.none.lines + ' bad ' + m.none.bad
        + '   anywhere lines ' + m.any.lines + ' bad ' + m.any.bad
        + '   identical ' + (m.none.lines === m.any.lines && m.any.bad === 0));
    }

    /**
     * ── §I / §K: THE REAL COMPONENTS, AFTER THE FIX ──────────────────────
     * PageBuilderView is an async server component, so its wrapper is rebuilt
     * here from the SAME two functions it uses (themeSurface().pageClass and
     * themeStyle()) plus the class this round adds — round 59 established that
     * technique. CanvasPanel carries the identical class, asserted in the test
     * file, so one measurement covers both.
     *
     * §K re-measures round 60's spacing in the same pass: it must not move.
     */
    console.log('');
    console.log('### §I  before/after, page wrapper, desktop and mobile');
    const PAGE_CLS_AFTER = 'bg-white text-9e-navy [overflow-wrap:anywhere]';
    const PAGE_CLS_BEFORE = 'bg-white text-9e-navy';
    console.log('width  ratio    before scrollW/clientW   after scrollW/clientW   fixed');
    for (const width of [1200, 390]) {
      for (const ratio of ['50-50', '40-60']) {
        const sec = twoColumn(doc([RUN]));
        sec.layout = { ratio };
        const html = draw(sec);
        const m = await page.eval((h, w, before, after) => {
          const run = (cls) => {
            document.body.innerHTML = '';
            const host = document.createElement('div');
            host.id = 'h';
            host.setAttribute('style', `width:${w}px`);
            host.innerHTML = `<div class="${cls}">${h}</div>`;
            document.body.appendChild(host);
            return { s: host.scrollWidth, c: host.clientWidth,
                     over: host.scrollWidth > host.clientWidth + 1 };
          };
          return { b: run(before), a: run(after) };
        }, html, width, PAGE_CLS_BEFORE, PAGE_CLS_AFTER);
        console.log('  ' + String(width).padEnd(6) + ratio.padEnd(8)
          + (m.b.s + '/' + m.b.c).padEnd(24) + (m.a.s + '/' + m.a.c).padEnd(24) + (!m.a.over));
      }
    }

    console.log('');
    console.log('### §K  round 60 spacing under the fix — p->p 16, li->li 4, outer edges 0');
    for (const cls of [PAGE_CLS_BEFORE, PAGE_CLS_AFTER]) {
      const html = draw(richTextSection({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าแรก' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าที่สอง' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ข' }] }] },
          ] },
        ],
      }));
      const m = await page.eval((h, c) => {
        document.body.innerHTML = '';
        const host = document.createElement('div');
        host.id = 'h';
        host.setAttribute('style', 'width:900px');
        host.innerHTML = `<div class="${c}">${h}</div>`;
        document.body.appendChild(host);
        const prose = host.querySelector('.prose');
        const ps = [...prose.querySelectorAll('p')].filter((p) => !p.closest('li'));
        const lis = [...prose.querySelectorAll('li')];
        const ul = prose.querySelector('ul');
        const gap = (a, b) => +(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom).toFixed(1);
        return {
          pp: gap(ps[0], ps[1]),
          lili: gap(lis[0], lis[1]),
          firstMt: getComputedStyle(prose.firstElementChild).marginTop,
          lastMb: getComputedStyle(prose.lastElementChild).marginBottom,
        };
      }, html, cls);
      console.log('  ' + (cls === PAGE_CLS_AFTER ? 'after ' : 'before') + '  p->p ' + m.pp
        + '  li->li ' + m.lili + '  firstMt ' + m.firstMt + '  lastMb ' + m.lastMb);
    }

    /**
     * ── END STATE: the real CLASS, not an inline style ───────────────────
     * Every section above through the wrapper class the components now carry.
     * This is the run that matters: it exercises the Tailwind-emitted rule, so
     * it would fail if the arbitrary property compiled to nothing — the failure
     * mode the compile guard registration exists for.
     */
    console.log('');
    console.log('### END STATE: every section type under the real page-wrapper class');
    const endBad = [];
    for (const [name, section] of CASES) {
      let html;
      try { html = draw(section); } catch { continue; }
      const m = await page.eval((h) => {
        document.body.innerHTML = '';
        const host = document.createElement('div');
        host.id = 'h';
        host.setAttribute('style', 'width:600px;--pb-accent-fill:#005CFF;--pb-accent-text:#005CFF;--pb-accent-on:#fff');
        host.innerHTML = `<div class="bg-white text-9e-navy [overflow-wrap:anywhere]">${h}</div>`;
        document.body.appendChild(host);
        return { s: host.scrollWidth, over: host.scrollWidth > host.clientWidth + 1 };
      }, html);
      if (m.over) endBad.push(name);
      console.log('  ' + name.padEnd(17) + 'scrollW ' + String(m.s).padEnd(7) + 'overflows ' + m.over);
    }
    console.log('  STILL OVERFLOWING: ' + JSON.stringify(endBad));
  } finally { await close(); }
}
main().catch((e) => { console.error('x ' + (e?.stack ?? e)); process.exit(1); });
