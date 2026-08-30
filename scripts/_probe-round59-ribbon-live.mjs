/**
 * ROUND 59 §A/§B/§C — the REAL component, measured through the dev server.
 *
 * The injection probes could not validate the in-flow design: half its classes
 * (`self-end`, `-mr-6`, `rounded-tr-9e-lg`) were absent from src/, so Tailwind's
 * JIT had never emitted them and an injected element measured as if they did
 * nothing. Once the component uses them the JIT emits them, so this renders
 * PriceCardSection itself and asks the browser about the result.
 *
 * The class-liveness control runs FIRST and is the thing that caught the
 * problem above: a class that changes no computed property is reported, and a
 * deliberately fake class proves the check can fire.
 *
 * READ-ONLY. Needs the dev server (which must have recompiled) and Chrome.
 *   FC_PORT=3001 node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round59-ribbon-live.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';
import { PriceCardSection } from '../src/components/pageBuilder/sections/price_card.jsx';

const TEXTS = ['20%', 'Early Bird', 'Early Bird ลด 20%', 'Early Bird ลด 20% วันนี้เท่านั้น'];
const WIDTHS = [320, 445, 640];

function paint(html, cardW) {
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'background:#e2e8f0;margin:0');
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style',
    'position:absolute;left:20px;top:20px;width:' + cardW + 'px;'
    + '--pb-accent-fill:#005CFF;--pb-accent-on:#F8FAFD;');
  host.innerHTML = html;
  document.body.appendChild(host);

  const card = host.firstElementChild;
  const c = card.getBoundingClientRect();
  const rib = card.querySelector('[data-pb-ribbon]');
  const h3 = card.querySelector('h3');
  const out = { cardW: +c.width.toFixed(0), cardH: +c.height.toFixed(1),
                hasRibbonEl: !!rib, cardClass: card.className };
  if (!rib) return out;
  const r = rib.getBoundingClientRect();
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
  let overlap = 0;
  if (h3) {
    const tr = document.createRange(); tr.selectNodeContents(h3);
    for (const b of tr.getClientRects()) {
      const ox = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
      const oy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      if (ox > 0 && oy > 0) overlap = Math.max(overlap, ox * oy);
    }
  }
  const cs = getComputedStyle(rib);
  return { ...out, chars: s.length, lost, titleOverlap: +overlap.toFixed(0),
    ribW: +r.width.toFixed(1), ribH: +r.height.toFixed(1),
    flushTop: +(r.top - c.top).toFixed(1), flushRight: +(c.right - r.right).toFixed(1),
    fontSize: cs.fontSize, transform: cs.transform, position: cs.position,
    radiusTR: cs.borderTopRightRadius, radiusBL: cs.borderBottomLeftRadius };
}

const BODY = {
  title: 'ราคาพิเศษสำหรับรอบนี้',
  price: '15,120 บาท',
  period: '',
  features: ['เอกสารประกอบการอบรม'],
  footnote: '* ราคาดังกล่าวยังไม่รวม VAT 7%',
};
const mk = (ribbon) => renderToStaticMarkup(
  PriceCardSection({ content: { ...BODY, ribbon }, style: { cardStyle: 'gradient' } }),
);
const mkNoRibbonKey = () => renderToStaticMarkup(
  PriceCardSection({ content: { ...BODY }, style: { cardStyle: 'gradient' } }),
);

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1440, height: 900 });
    await page.send('Page.navigate', { url: ORIGIN + '/promotions' });
    await new Promise((r) => setTimeout(r, 8000));

    const dead = await page.eval((classes) => {
      const el = document.createElement('div');
      el.textContent = 'x';
      document.body.appendChild(el);
      const base = { ...getComputedStyle(el) };
      const out = [];
      for (const c of classes) {
        el.className = c;
        const now = getComputedStyle(el);
        let moved = false;
        for (const k of Object.keys(base)) {
          if (Number.isNaN(Number(k)) && base[k] !== now[k]) { moved = true; break; }
        }
        if (!moved) out.push(c);
      }
      el.remove();
      return out;
    }, ['self-end', '-mr-6', '-mt-6', 'mb-4', 'px-4', 'py-2', 'text-sm', 'font-bold',
        'leading-tight', 'overflow-hidden', 'rounded-bl-9e-lg', 'rounded-tr-9e-lg',
        'not-a-real-class-control']);
    console.log('DEAD classes (control expects exactly the fake one): ' + JSON.stringify(dead));
    if (dead.length !== 1 || dead[0] !== 'not-a-real-class-control') {
      console.log('!! dev server has not recompiled with the new classes — numbers below are NOT valid');
    }

    console.log('');
    console.log('### live PriceCardSection, cardStyle=gradient');
    console.log('cardW  chars  lost  titleOverlap   ribW   ribH  flushTop  flushRight  cardH  fontSize   transform  position');
    for (const w of WIDTHS) {
      for (const t of TEXTS) {
        const m = await page.eval(paint, mk(t), w);
        console.log(
          String(m.cardW).padStart(5) + String(m.chars).padStart(7) + String(m.lost).padStart(6)
          + String(m.titleOverlap).padStart(14) + String(m.ribW).padStart(7)
          + String(m.ribH).padStart(7) + String(m.flushTop).padStart(10)
          + String(m.flushRight).padStart(12) + String(m.cardH).padStart(7)
          + String(m.fontSize).padStart(10) + String(m.transform).padStart(12)
          + String(m.position).padStart(10));
      }
    }
    const one = await page.eval(paint, mk('Early Bird ลด 20%'), 445);
    console.log('');
    console.log('radius TR/BL: ' + one.radiusTR + ' / ' + one.radiusBL);

    console.log('');
    console.log('### §C — an EMPTY ribbon costs no layout, and emits no element');
    for (const w of WIDTHS) {
      const empty = await page.eval(paint, mk(''), w);
      const absent = await page.eval(paint, mkNoRibbonKey(), w);
      console.log('w=' + w + '  empty: h=' + empty.cardH + ' el=' + empty.hasRibbonEl
        + '   absent: h=' + absent.cardH + ' el=' + absent.hasRibbonEl
        + '   sameHeight=' + (empty.cardH === absent.cardH)
        + '   sameClass=' + (empty.cardClass === absent.cardClass));
    }

    await page.eval(paint, mk('Early Bird ลด 20%'), 445);
    const clip = await page.eval(() => {
      const c = document.getElementById('h').firstElementChild.getBoundingClientRect();
      return { x: Math.round(c.left + scrollX) - 30, y: Math.round(c.top + scrollY) - 30,
               width: Math.round(c.width) + 60, height: Math.round(c.height) + 60 };
    });
    const out = (process.env.TEMP || '.') + '/round59-ribbon-after.png';
    await page.screenshot(out, { clip });
    console.log('');
    console.log('shot: ' + out);
  } finally { await close(); }
}
main().catch((e) => { console.error('✖ ' + (e?.stack ?? e)); process.exit(1); });
