/**
 * ROUND 70 §A/§B/§C then §H/§I — WHICH ELEMENT STOPS AT CONTENT HEIGHT?
 *
 * The observation is that a selected card's outline is full row height while
 * the card surface inside it is not. Between those two there are three
 * elements, and `h-full` on the wrong one does nothing at all — `price_card`
 * already carries `flex h-full flex-col` and still does not fill, which is the
 * evidence that guessing has been tried. So this names the element by MEASURING
 * every link in the chain rather than reading the source and reasoning.
 *
 * The chain, per grid item, as SectionRenderer composes it:
 *
 *   <section>                       the grid ITEM        (stretches?)
 *     <div class="mx-auto px-4 …">  the container        (stretches?)
 *       <div class="rounded-9e-lg">the card SURFACE      (stretches?)
 *
 * ── WHAT IS RENDERED ──────────────────────────────────────────────────────
 * Real sections through the real SectionRenderer — not a hand-built
 * approximation — in five arrangements: `card_grid` holding each of the four
 * card types that can sit in one (icon_card / price_card / stat_card /
 * instructor_card), `highlight_grid` holding icon_cards (§C: round 29 found it
 * wraps each child in its own bordered box, so the grid ITEM is a different
 * element there), and a `two_column` slot (§I: the fix must not depend on being
 * inside a card_grid).
 *
 * Every group uses FOUR different label lengths AND four different image
 * aspect ratios, because a height that tracks content is the whole defect.
 *
 * ── BEFORE / AFTER, FROM ONE SCRIPT ───────────────────────────────────────
 * `BASE_REF=<sha>` pulls the pre-change component files out of git into a
 * sibling tree and renders those instead, so the same instrument produces both
 * columns of §H's table. With no BASE_REF it measures the working tree.
 *
 * Tailwind is compiled over the rendered markup (test/twCompile.mjs) and
 * inlined, so the page is styled by the REAL stylesheet. Output goes under
 * `public/_round70/` — outside all three of tailwind.config.js's content globs,
 * so a watching dev server does not rebuild CSS over it — and is removed in a
 * finally.
 *
 * Needs the dev server (test/browser/cdp.mjs conventions: FC_PORT / FC_ORIGIN).
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round70-grid-fill.mjs
 *   BASE_REF=25da63c … (renders the pre-change components)
 */
import { writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile } from '../test/twCompile.mjs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = process.cwd();
/** picture name -> data: URI, filled in below. Nothing touches the filesystem. */
const PIC_URL = {};
const BASE_REF = process.env.BASE_REF ?? '';

// ── the files whose composition decides the answer ─────────────────────────
const TRACKED = [
  'src/components/pageBuilder/SectionRenderer.jsx',
  'src/components/pageBuilder/sections/card_grid.jsx',
  'src/components/pageBuilder/sections/highlight_grid.jsx',
  'src/components/pageBuilder/sections/two_column.jsx',
  'src/components/pageBuilder/sections/icon_card.jsx',
  'src/components/pageBuilder/sections/price_card.jsx',
  'src/components/pageBuilder/sections/stat_card.jsx',
  'src/components/pageBuilder/sections/instructor_card.jsx',
];
const SHADOW = path.join(ROOT, 'src/components/_round70_baseline');

// ── a minimal PNG writer (round 69's, reused verbatim) ─────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PICTURES = { portrait: [200, 600], landscape: [600, 200], square: [400, 400], verywide: [1200, 150] };
const TINTS = [[219, 68, 55], [15, 157, 88], [66, 133, 244], [244, 180, 0]];

// ── the four labels: deliberately four different heights ───────────────────
const LABELS = [
  { title: 'เอกสาร', description: '' },
  { title: 'ใบประกาศนียบัตร', description: 'มอบให้ผู้เข้าอบรม' },
  {
    title: 'อาหารว่างและเครื่องดื่มตลอดการอบรมทั้งเช้าและบ่าย',
    description: 'พร้อมอาหารกลางวันที่โรงแรม และของว่างระหว่างพัก ทั้งช่วงเช้าและช่วงบ่ายของทุกวัน',
  },
  { title: 'ที่ปรึกษา', description: 'หลังการอบรม 3 เดือน' },
];
const RATIOS = Object.keys(PICTURES);

const sect = (id, type, content, extra = {}) => ({
  id, type, enabled: true, content, style: { cardStyle: 'shadow' },
  settings: { spacingTop: 'none', spacingBottom: 'none', containerWidth: 'full' },
  ...extra,
});

const iconCards = () => LABELS.map((l, i) => sect(`ic${i}`, 'icon_card', {
  ...l, imageSrc: PIC_URL[RATIOS[i]],
}));
const priceCards = () => LABELS.map((l, i) => sect(`pc${i}`, 'price_card', {
  title: l.title, price: `฿${(i + 1) * 1000}`, features: l.description ? [l.description] : [],
}));
const statCards = () => LABELS.map((l, i) => sect(`sc${i}`, 'stat_card', {
  value: `${i + 1}0`, label: l.title, icon: 'Rocket',
}));
const instructorCards = () => LABELS.map((l, i) => sect(`in${i}`, 'instructor_card', { instructorId: `i${i}` }));
const INSTRUCTOR_DATA = Object.fromEntries(LABELS.map((l, i) => [`in${i}`, {
  name: 'อาจารย์ตัวอย่าง', title: l.title, bio: l.description, image_url: '', specialties: [],
}]));

const GROUPS = (SR) => [
  ['card_grid/icon_card', createElement(SR, {
    section: sect('g1', 'card_grid', { children: iconCards() }, { layout: { columns: 4 } }),
  })],
  ['card_grid/price_card', createElement(SR, {
    section: sect('g2', 'card_grid', { children: priceCards() }, { layout: { columns: 4 } }),
  })],
  ['card_grid/stat_card', createElement(SR, {
    section: sect('g3', 'card_grid', { children: statCards() }, { layout: { columns: 4 } }),
  })],
  ['card_grid/instructor_card', createElement(SR, {
    section: sect('g4', 'card_grid', { children: instructorCards() }, { layout: { columns: 4 } }),
    resolvedData: INSTRUCTOR_DATA,
  })],
  ['highlight_grid/icon_card', createElement(SR, {
    section: sect('g5', 'highlight_grid', { children: iconCards() }, { layout: { columns: 4 } }),
  })],
  ['two_column/icon_card', createElement(SR, {
    section: sect('g6', 'two_column', { left: iconCards().slice(0, 2), right: iconCards().slice(2) },
      { layout: { ratio: '50-50' } }),
  })],
  ['card_grid/one_column_single', createElement(SR, {
    section: sect('g7', 'card_grid', { children: [iconCards()[0]] }, { layout: { columns: 1 } }),
  })],
  // Two rows in one grid: a fill that resolved against the whole GRID instead
  // of the ROW would make every card as tall as both rows together.
  ['card_grid/two_rows', createElement(SR, {
    section: sect('g8', 'card_grid', { children: [...iconCards(), ...LABELS.map((l, i) => sect('z' + i, 'icon_card', { title: 'สั้น', imageSrc: PIC_URL['square'] }))] }, { layout: { columns: 4 } }),
  })],
  // An ICON card, no image, so F's "what does the bigger chip do to it" is measured.
  ['toplevel/stat_card', createElement('div', null, ...statCards().map((c, i) => createElement(SR, { key: i, section: c })))],
  ['toplevel/instructor_card', createElement('div', null, ...instructorCards().map((c, i) => createElement(SR, { key: i, section: c, resolvedData: INSTRUCTOR_DATA })))],
  ['toplevel/icon_card', createElement('div', null, ...iconCards().map((c, i) => createElement(SR, { key: i, section: c })))],
  ['card_grid/icon_branch', createElement(SR, {
    section: sect('g9', 'card_grid', { children: LABELS.map((l, i) => sect('ib' + i, 'icon_card', { ...l, icon: 'Rocket' })) }, { layout: { columns: 4 } }),
  })],
];

const report = { baseRef: BASE_REF || '(working tree)' };
try {
  Object.entries(PICTURES).forEach(([name, [w, h]], i) => {
    PIC_URL[name] = 'data:image/png;base64,' + png(w, h, TINTS[i % TINTS.length]).toString('base64');
  });

  // ── pick the component tree: working copy, or a shadow copy from git ─────
  let SR;
  if (BASE_REF) {
    rmSync(SHADOW, { recursive: true, force: true });
    cpSync(path.join(ROOT, 'src/components/pageBuilder'), path.join(SHADOW, 'pageBuilder'), { recursive: true });
    for (const rel of TRACKED) {
      const dest = path.join(SHADOW, rel.replace('src/components/', ''));
      writeFileSync(dest, execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8' }), 'utf8');
    }
    ({ SectionRenderer: SR } = await import('@/components/_round70_baseline/pageBuilder/SectionRenderer'));
  } else {
    ({ SectionRenderer: SR } = await import('@/components/pageBuilder/SectionRenderer'));
  }

  const body = GROUPS(SR).map(([name, el]) =>
    `<div data-group="${name}" style="margin-bottom:32px">${renderToStaticMarkup(el)}</div>`).join('\n');

  const css = await compile([{ raw: body, extension: 'html' }]);
  const page_html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>*{box-sizing:border-box}body{margin:0;padding:24px;width:1440px;font-family:sans-serif}</style>',
    `<style>${css}</style>`,
    '</head><body>', body, '</body></html>',
  ].join('\n');

  const { browser, close } = await launch();
  const page = await openPage(browser, { width: 1600, height: 1400 });
  try {
    await page.eval((html) => { document.open(); document.write(html); document.close(); }, page_html);
    // Every picture must be DECODED before anything is measured, or an
    // object-contain box reports the placeholder size instead of the fit.
    await page.eval(() => Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))));

    const measured = await page.eval(() => {
      const h = (el) => (el ? +el.getBoundingClientRect().height.toFixed(2) : null);
      const w = (el) => (el ? +el.getBoundingClientRect().width.toFixed(2) : null);
      const out = {};
      for (const group of document.querySelectorAll('[data-group]')) {
        // The grid is the innermost element carrying `display:grid` that holds
        // the card sections — read it rather than assuming a nesting depth.
        const grids = [...group.querySelectorAll('div')]
          .filter((d) => getComputedStyle(d).display === 'grid' && d.querySelector(':scope > section, :scope > div > section'));
        const grid = grids[0] ?? null;
        const items = grid ? [...grid.children] : [...group.querySelectorAll('section')].filter((el) => !el.parentElement.closest('section'));
        out[group.dataset.group] = {
          gridDisplay: grid ? getComputedStyle(grid).display : null,
          alignItems: grid ? getComputedStyle(grid).alignItems : null,
          items: items.map((item) => {
            const section = item.tagName === 'SECTION' ? item : item.querySelector('section');
            const container = section ? section.firstElementChild : null;
            const surface = container ? container.firstElementChild : null;
            const img = item.querySelector('img');
            return {
              itemTag: item.tagName.toLowerCase(),
              gridItem: h(item),
              section: h(section),
              container: h(container),
              surface: h(surface),
              surfaceW: w(surface),
              img: img ? { w: w(img), h: h(img), natural: { w: img.naturalWidth, h: img.naturalHeight } } : null,
              surfaceTextAlign: surface ? getComputedStyle(surface).textAlign : null,
            };
          }),
        };
      }
      return out;
    });

    const uniq = (xs) => [...new Set(xs)];
    report['-- THE CHAIN, PER GROUP --'] = '';
    for (const [name, g] of Object.entries(measured)) {
      report[name] = {
        grid: `${g.gridDisplay} / align-items:${g.alignItems}`,
        gridItemHeights: g.items.map((i) => i.gridItem),
        sectionHeights: g.items.map((i) => i.section),
        containerHeights: g.items.map((i) => i.container),
        surfaceHeights: g.items.map((i) => i.surface),
        DISTINCT_SURFACE_HEIGHTS: uniq(g.items.map((i) => i.surface)).length,
        imageBoxes: g.items.map((i) => (i.img ? `${i.img.w}x${i.img.h} (from ${i.img.natural.w}x${i.img.natural.h})` : null)),
        textAlign: uniq(g.items.map((i) => i.surfaceTextAlign)),
      };
    }

    report['-- THE ANSWER: WHICH LINK STOPS AT CONTENT HEIGHT --'] = '';
    const cg = measured['card_grid/icon_card'];
    report.stretchChain_card_grid = cg.items.map((i) => ({
      gridItem: i.gridItem, section: i.section, container: i.container, surface: i.surface,
    }));
    report.firstLinkThatDoesNotMatchTheGridItem = (() => {
      const i = cg.items[0];
      if (i.section !== i.gridItem) return 'section';
      if (i.container !== i.section) return 'container (SectionRenderer mx-auto px-4)';
      if (i.surface !== i.container) return 'surface (the card component root)';
      return 'none — the whole chain fills';
    })();
  } finally {
    await page.close().catch(() => {});
    await close().catch(() => {});
  }
} finally {
  if (existsSync(SHADOW)) rmSync(SHADOW, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
