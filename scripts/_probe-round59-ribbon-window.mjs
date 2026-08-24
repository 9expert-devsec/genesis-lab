/**
 * ROUND 59 §A/§B — the corner window is a FIXED SIZE, and that is the defect.
 *
 * Sweeps ribbon text length against card width for both geometries and reports
 * characters lost. If the rotated band's loss is independent of card width, the
 * cause is not "the card is too small" — it is that a 144px band is placed
 * across a corner whose usable chord is shorter than 144px, always.
 *
 * Also measures whether the un-rotated candidate COLLIDES with the card title,
 * which the rotated band did not have to worry about.
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   FC_PORT=3001 node scripts/_probe-round59-ribbon-window.mjs
 */
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';

const CARD_BASE = 'flex h-full flex-col rounded-9e-lg p-6';
const NOW =
  'pointer-events-none absolute -right-10 top-4 w-36 rotate-45 py-1 text-center '
  + 'text-[11px] font-bold text-[var(--pb-accent-on)] bg-[color:var(--pb-accent-fill)]';
const FIX =
  'pointer-events-none absolute right-0 top-0 rounded-bl-9e-lg rounded-tr-9e-lg '
  + 'px-4 py-2 text-sm font-bold leading-tight '
  + 'text-[var(--pb-accent-on)] bg-[color:var(--pb-accent-fill)]';

function probe(cardCls, ribbonCls, text, cardW, titleText, extraCard) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'background:#e2e8f0;margin:0');
  const host = document.createElement('div');
  host.setAttribute('style',
    'position:absolute;left:20px;top:20px;width:' + cardW + 'px;'
    + '--pb-accent-fill:#005CFF;--pb-accent-on:#F8FAFD;');
  host.innerHTML =
    '<div id="c" class="' + cardCls + ' ' + extraCard + ' bg-9e-gradient-subtle relative overflow-hidden">'
    + '<span id="r" class="' + ribbonCls + '">' + text + '</span>'
    + '<h3 id="t" class="font-heading text-lg font-bold">' + titleText + '</h3>'
    + '<p class="mt-2 font-heading text-3xl font-bold">15,120 บาท</p>'
    + '</div>';
  document.body.appendChild(host);

  const c = document.getElementById('c').getBoundingClientRect();
  const rib = document.getElementById('r');
  // The TITLE'S TEXT, not its block box. An h3 is full-width, so a box-overlap
  // test against a corner element is always true and says nothing.
  const tr = document.createRange();
  tr.selectNodeContents(document.getElementById('t'));
  const tRects = [...tr.getClientRects()];
  const node = rib.firstChild;
  const s = node.textContent;
  let lost = 0;
  for (let i = 0; i < s.length; i += 1) {
    const rg = document.createRange();
    rg.setStart(node, i); rg.setEnd(node, i + 1);
    const b = rg.getBoundingClientRect();
    const cx = (b.left + b.right) / 2; const cy = (b.top + b.bottom) / 2;
    if (!(cx >= c.left && cx <= c.right && cy >= c.top && cy <= c.bottom)) lost += 1;
  }
  const r = rib.getBoundingClientRect();
  // Does the ribbon's box overlap the title's box?
  let overlap = 0;
  for (const b of tRects) {
    const ox = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
    const oy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
    if (ox > 0 && oy > 0) overlap = Math.max(overlap, ox * oy);
  }
  return { chars: s.length, lost, overlapArea: +overlap.toFixed(0), titleLines: tRects.length,
           cardW: +c.width.toFixed(0), cardH: +c.height.toFixed(0) };
}

const TEXTS = ['20%', 'Early Bird', 'Early Bird ลด 20%', 'Early Bird ลด 20% วันนี้เท่านั้น'];
const WIDTHS = [320, 445, 640];

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1440, height: 900 });
    await page.send('Page.navigate', { url: ORIGIN + '/promotions' });
    await new Promise((r) => setTimeout(r, 6000));

    for (const [label, cls, extra] of [
      ['NOW rotated band            ', NOW, ''],
      ['FIX flush rect, p-6         ', FIX, ''],
      ['FIX flush rect, pt-14 reserve', FIX, 'pt-14'],
    ]) {
      console.log('\n### ' + label);
      console.log('cardW  text(chars)  charsLost  titleOverlapArea  titleLines');
      for (const w of WIDTHS) {
        for (const txt of TEXTS) {
          const m = await page.eval(probe, CARD_BASE, cls, txt, w, 'ราคาพิเศษสำหรับรอบนี้', extra);
          console.log(
            String(m.cardW).padStart(5) + '  ' + String(m.chars).padStart(11)
            + '  ' + String(m.lost).padStart(9) + '  ' + String(m.overlapArea).padStart(16)
            + '  ' + String(m.titleLines).padStart(10),
          );
        }
      }
    }
  } finally { await close(); }
}
main().catch((e) => { console.error('✖ ' + (e?.stack ?? e)); process.exit(1); });
