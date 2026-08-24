/**
 * ROUND 69 §F — the illustration's BOX, measured in a real browser.
 *
 * §F is a requirement, not a guess: an author's upload is any size and any
 * ratio, four cards in a row must not become four heights, and the picture must
 * not swamp the label. §C measured the failure this avoids — `ImageSection`
 * renders at width 1600 with `h-auto w-full`, so a 512x512 PNG becomes a
 * full-cell tile. So this does not reason about `object-contain`; it renders
 * the real component with real PNG files of four different aspect ratios and
 * reads `getBoundingClientRect()` out of headless Chrome.
 *
 * ── WHAT IT MEASURES ──────────────────────────────────────────────────────
 *   1. the box, in px (44 in round 69, 80 from round 70), and the ICON card's
 *      box beside it — both branches share it, so the swap must not
 *      move the card's height, or it is a layout change wearing a content
 *      change's clothes
 *   2. portrait / landscape / square / very-wide, each one's rendered picture
 *      inside that box: no distortion means the drawn aspect ratio equals the
 *      file's
 *   3. a 2000x2000 upload: what the browser fetched vs what it drew
 *   4. four cards, four ratios, ONE height
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * A second grid rendered from the same components with the box size STRIPPED
 * off the wrapper — the size constraint removed and nothing else. Its four
 * heights must DIVERGE. Four equal heights in both grids would mean the
 * measurement cannot see the constraint at all, and every number above would be
 * worth nothing.
 *
 * ── HOW IT RUNS ───────────────────────────────────────────────────────────
 * Tailwind is compiled over the rendered markup (test/twCompile.mjs, the same
 * instrument test/fs/tailwindArbitraryValueRules uses) and inlined, so the page
 * is styled by the REAL stylesheet rather than by a hand-written approximation.
 * The page and its PNGs are written under `public/_round69/` — outside all
 * three of tailwind.config.js's content globs, so a watching dev server does
 * not rebuild CSS over them — and removed in a finally.
 *
 * Needs the dev server (test/browser/cdp.mjs conventions: FC_PORT / FC_ORIGIN).
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round69-icon-card-box.mjs
 */

import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { compile } from '../test/twCompile.mjs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = process.cwd();
/** picture name -> data: URI, filled in below. Nothing touches the filesystem. */
const PIC_URL = {};

// ── a minimal PNG writer: signature + IHDR + IDAT + IEND ───────────────────
// Real raster files, because `object-contain` is decided by the DECODED
// intrinsic size and an <svg> or a data: rectangle would not exercise it the
// same way.
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
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** name → [w, h]. Four ratios, plus the very large upload. */
const PICTURES = {
  portrait: [200, 600],
  landscape: [600, 200],
  square: [400, 400],
  verywide: [1200, 150],
  huge: [2000, 2000],
};
const TINTS = [[219, 68, 55], [15, 157, 88], [66, 133, 244], [244, 180, 0], [155, 89, 182]];

const report = {};
// No try/finally: with the page injected into about:blank and every picture a
// data: URI, this harness creates no file and has nothing to clean up.
Object.entries(PICTURES).forEach(([name, [w, h]], i) => {
  PIC_URL[name] = 'data:image/png;base64,' + png(w, h, TINTS[i % TINTS.length]).toString('base64');
});

// ── the markup: the real component, four ratios, plus an icon card ───────
const card = (content) => renderToStaticMarkup(IconCardSection({ content, style: {} }));
const cards = [
  card({ imageSrc: PIC_URL['portrait'], title: 'เอกสารประกอบการอบรม', description: 'ตัวอย่างคำอธิบาย' }),
  card({ imageSrc: PIC_URL['landscape'], title: 'ใบประกาศนียบัตร', description: 'ตัวอย่างคำอธิบาย' }),
  card({ imageSrc: PIC_URL['square'], title: 'อาหารว่างและเครื่องดื่ม', description: 'ตัวอย่างคำอธิบาย' }),
  card({ imageSrc: PIC_URL['verywide'], title: 'ที่ปรึกษาหลังการอบรม', description: 'ตัวอย่างคำอธิบาย' }),
];
const iconCard = card({ icon: 'FileText', title: 'เอกสารประกอบการอบรม', description: 'ตัวอย่างคำอธิบาย' });
const hugeCard = card({ imageSrc: PIC_URL['huge'], title: 'อัปโหลดใหญ่มาก' });

// THE CONTROL: the same markup with the size constraint stripped off the
// wrapper, and nothing else changed.
const stripped = cards.map((m) => m.replace('mb-3 inline-flex h-20 w-20 items-center', 'mb-3 inline-flex items-center'));

const grid = (id, items) =>
  `<div id="${id}" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start">`
  + items.map((m, i) => `<div data-cell="${id}-${i}">${m}</div>`).join('') + '</div>';

const body = [
  grid('real', cards),
  `<div id="icononly" style="width:280px">${iconCard}</div>`,
  `<div id="huge" style="width:280px">${hugeCard}</div>`,
  grid('control', stripped),
].join('\n');

const css = await compile([{ raw: body, extension: 'html' }]);
const page_html = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<style>*{box-sizing:border-box}body{margin:0;padding:24px;width:1280px;font-family:sans-serif}</style>',
  `<style>${css}</style>`,
  '</head><body>', body, '</body></html>',
].join('\n');

// ── measure ─────────────────────────────────────────────────────────────
const { browser, close } = await launch();
const page = await openPage(browser, { width: 1440, height: 1200 });
try {
  await page.eval((html) => { document.open(); document.write(html); document.close(); }, page_html);
  // Every picture must be DECODED before anything is measured, or an
  // object-contain box reports the placeholder size instead of the fit.
  await page.eval(() => Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))));

  const measured = await page.eval(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
    const cellsOf = (id) => [...document.querySelectorAll(`[data-cell^="${id}-"]`)].map((cell) => {
      const img = cell.querySelector('img');
      const wrap = img ? img.parentElement : cell.querySelector('div > div');
      // The DRAWN picture inside an object-fit box, not the element box.
      let drawn = null;
      if (img && img.naturalWidth) {
        const b = img.getBoundingClientRect();
        const scale = Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight);
        drawn = { w: +(img.naturalWidth * scale).toFixed(2), h: +(img.naturalHeight * scale).toFixed(2) };
      }
      return {
        src: img ? img.getAttribute('src') : null,
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        wrapper: wrap ? box(wrap) : null,
        imgBox: img ? box(img) : null,
        objectFit: img ? getComputedStyle(img).objectFit : null,
        drawn,
        cardH: +cell.firstElementChild.getBoundingClientRect().height.toFixed(2),
      };
    });
    const iconChip = document.querySelector('#icononly div > div');
    const hugeImg = document.querySelector('#huge img');
    return {
      real: cellsOf('real'),
      control: cellsOf('control'),
      iconChip: box(iconChip),
      iconCardH: +document.querySelector('#icononly > div').getBoundingClientRect().height.toFixed(2),
      huge: {
        natural: { w: hugeImg.naturalWidth, h: hugeImg.naturalHeight },
        box: box(hugeImg),
        cardH: +document.querySelector('#huge > div').getBoundingClientRect().height.toFixed(2),
      },
    };
  });

  const ratio = (o) => (o ? +(o.w / o.h).toFixed(3) : null);
  const uniq = (xs) => [...new Set(xs)];

  report['-- 1. THE BOX --'] = '';
  report.iconChipBox = measured.iconChip;
  report.imageWrapperBoxes = measured.real.map((c) => c.wrapper);
  report.boxesAllEqualToIconChip = measured.real.every(
    (c) => c.wrapper.w === measured.iconChip.w && c.wrapper.h === measured.iconChip.h);
  report.cardHeight_iconBranch = measured.iconCardH;
  report.cardHeight_imageBranch = uniq(measured.real.map((c) => c.cardH));
  report.swapMovesCardHeight = !measured.real.every((c) => c.cardH === measured.iconCardH);

  report['-- 2. ASPECT RATIO, THREE (FOUR) SHAPES --'] = '';
  report.perPicture = measured.real.map((c) => ({
    src: c.src,
    naturalRatio: ratio(c.natural),
    objectFit: c.objectFit,
    elementBox: c.imgBox,
    drawnPicture: c.drawn,
    drawnRatio: ratio(c.drawn),
    distorted: Math.abs(ratio(c.natural) - ratio(c.drawn)) > 0.01,
    fitsInsideBox: c.drawn.w <= c.imgBox.w + 0.5 && c.drawn.h <= c.imgBox.h + 0.5,
  }));
  report.anyDistorted = report.perPicture.some((p) => p.distorted);

  report['-- 3. A VERY LARGE UPLOAD --'] = '';
  report.huge = measured.huge;
  report.hugeDownscaleFactor = +(measured.huge.natural.w / measured.huge.box.w).toFixed(1);

  report['-- 4. FOUR RATIOS, ONE HEIGHT --'] = '';
  report.fourCardHeights = measured.real.map((c) => c.cardH);
  report.distinctHeights = uniq(measured.real.map((c) => c.cardH)).length;
  report.FOUR_CARDS_ONE_HEIGHT = uniq(measured.real.map((c) => c.cardH)).length === 1;

  report['-- CONTROL: strip h-11 w-11 and the heights must diverge --'] = '';
  report.controlCardHeights = measured.control.map((c) => c.cardH);
  report.controlDistinctHeights = uniq(measured.control.map((c) => c.cardH)).length;
  report.controlDiscriminates = uniq(measured.control.map((c) => c.cardH)).length > 1;
} finally {
  await page.close().catch(() => {});
  await close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
