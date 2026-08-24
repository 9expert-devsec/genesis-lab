/**
 * ROUND 59 §I/§J — what `promo` actually paints, in the REAL page shape, in
 * BOTH themes, on all three readers.
 *
 * §J: `two_column` carrying a custom two-stop gradient background with a
 * `price_card` in its right slot — the shape the target page uses — rendered
 * through SectionRenderer so the section wrapper, the custom background and the
 * card surface all come from the real code path rather than a hand-built div.
 *
 * §I: `stat_card` and `icon_card` get `promo` in their dropdown the moment it is
 * declared (2C.3 derives controls from SECTION_STYLE_CAPS, which is per-PROP not
 * per-VALUE). This renders both under it and reports the painted result, so
 * "sensible rather than broken" is a measurement instead of an expectation.
 *
 * Dark mode is `.dark` on the root element — tailwind.config.js sets
 * `darkMode: 'class'` and next-themes writes that class via ThemeProvider. The
 * probe sets it directly, which is the same switch.
 *
 * THE LIVENESS CONTROL runs first, because a class absent from src/ measures
 * exactly like a class that exists and does nothing (commit 1 nearly shipped a
 * wrong number that way). A deliberately fake class proves it can fire.
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   FC_PORT=3001 node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round59-promo-surface.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';
import { SectionRenderer } from '../src/components/pageBuilder/SectionRenderer.jsx';
import { CARD_STYLES } from '../src/lib/schemas/sections/base.js';

/** The real page shape: two_column, custom gradient, price_card on the right. */
const section = (cardStyle) => ({
  id: 'tc', type: 'two_column', name: '', enabled: true, sortOrder: 0,
  settings: {
    containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium',
    background: 'default', visibility: 'all',
    backgroundMode: 'custom',
    backgroundCustom: { from: '#ffcb5c', to: '#fff8e0', direction: 'to_bottom_left' },
  },
  layout: { ratio: '50-50' },
  style: {},
  advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  content: {
    left: [],
    right: [{
      id: 'pc', type: 'price_card', name: '', enabled: true, sortOrder: 0,
      settings: { containerWidth: 'large', spacingTop: 'none', spacingBottom: 'none', background: 'default', visibility: 'all' },
      layout: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
      style: cardStyle ? { cardStyle } : {},
      content: {
        title: 'ราคาพิเศษสำหรับรอบนี้', price: '15,120 บาท', period: '',
        features: ['เอกสารประกอบการอบรม'], ribbon: 'Early Bird ลด 20%',
        footnote: '* ราคาดังกล่าวยังไม่รวม VAT 7%',
        originalPrice: '18,900 บาท', discountBadge: 'ลด 20%',
      },
    }],
  },
});

const drawSection = (cardStyle) => renderToStaticMarkup(
  SectionRenderer({ section: section(cardStyle), path: null, resolvedData: undefined }),
);

function measure(html, dark) {
  document.documentElement.classList.toggle('dark', dark);
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0');
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:1200px;--pb-accent-fill:#005CFF;--pb-accent-on:#F8FAFD;--pb-accent-text:#005CFF');
  host.innerHTML = html;
  document.body.appendChild(host);

  const card = host.querySelector('[data-pb-ribbon]')?.parentElement
    ?? host.querySelector('.rounded-9e-lg');
  if (!card) return { error: 'no card found' };
  const cs = getComputedStyle(card);
  const parent = host.querySelector('section');
  const ps = parent ? getComputedStyle(parent) : null;
  return {
    cardBackgroundColor: cs.backgroundColor,
    cardBackgroundImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 60),
    opaque: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none',
    borderTopWidth: cs.borderTopWidth,
    borderTopColor: cs.borderTopColor,
    boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 44),
    sectionBackgroundImage: ps ? ps.backgroundImage.slice(0, 52) : null,
  };
}

function measureCards(html, dark) {
  document.documentElement.classList.toggle('dark', dark);
  document.body.innerHTML = '';
  const host = document.createElement('div');
  host.id = 'h';
  host.setAttribute('style', 'width:400px;--pb-accent-fill:#005CFF;--pb-accent-on:#F8FAFD;--pb-accent-text:#005CFF');
  host.innerHTML = html;
  document.body.appendChild(host);
  const card = host.querySelector('.rounded-9e-lg');
  if (!card) return { error: 'no card' };
  const cs = getComputedStyle(card);
  const r = card.getBoundingClientRect();
  return {
    backgroundColor: cs.backgroundColor,
    borderTopWidth: cs.borderTopWidth,
    boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 40),
    color: cs.color,
    w: +r.width.toFixed(0), h: +r.height.toFixed(0),
    textVisible: cs.color !== cs.backgroundColor,
  };
}

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1440, height: 1000 });
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
    }, ['bg-[var(--surface)]', 'border-[var(--surface-border)]', 'shadow-9e-lg',
        'bg-9e-ice', 'bg-9e-gradient-subtle', 'shadow-9e-md', 'not-a-real-class-control']);
    console.log('DEAD classes (expect exactly the fake one): ' + JSON.stringify(dead));

    console.log('');
    console.log('### §J  two_column(custom gradient #ffcb5c -> #fff8e0, to_bottom_left) + price_card');
    for (const dark of [false, true]) {
      console.log('--- ' + (dark ? 'DARK' : 'LIGHT') + ' ---');
      for (const v of [null, ...CARD_STYLES]) {
        const m = await page.eval(measure, drawSection(v), dark);
        console.log(
          String(v ?? '<absent>').padEnd(11)
          + ' bg=' + String(m.cardBackgroundColor).padEnd(22)
          + ' img=' + String(m.cardBackgroundImage).padEnd(30)
          + ' opaque=' + String(m.opaque).padEnd(6)
          + ' border=' + String(m.borderTopWidth).padEnd(4)
          + ' shadow=' + String(m.boxShadow));
      }
      const s = await page.eval(measure, drawSection('promo'), dark);
      console.log('  section background: ' + s.sectionBackgroundImage);
      console.log('  promo border colour: ' + s.borderTopColor);
    }

    console.log('');
    console.log('### §I  the other two readers under `promo`');
    const { StatCardSection } = await import('../src/components/pageBuilder/sections/stat_card.jsx');
    const { IconCardSection } = await import('../src/components/pageBuilder/sections/icon_card.jsx');
    const others = [
      ['stat_card', () => StatCardSection({ content: { value: '1,200+', label: 'ผู้เรียนจบหลักสูตร', icon: 'Users' }, style: { cardStyle: 'promo' } })],
      ['icon_card', () => IconCardSection({ content: { title: 'เอกสารประกอบการอบรม', description: 'ไฟล์ PDF พร้อมดาวน์โหลด', icon: 'FileText' }, style: { cardStyle: 'promo' } })],
    ];
    for (const dark of [false, true]) {
      console.log('--- ' + (dark ? 'DARK' : 'LIGHT') + ' ---');
      for (const [name, render] of others) {
        const m = await page.eval(measureCards, renderToStaticMarkup(render()), dark);
        console.log('  ' + name.padEnd(10) + JSON.stringify(m));
      }
    }

    // Evidence: the real shape, promo, both themes.
    for (const dark of [false, true]) {
      await page.eval(measure, drawSection('promo'), dark);
      const clip = await page.eval(() => {
        const s = document.querySelector('#h section').getBoundingClientRect();
        return { x: Math.round(s.left + scrollX), y: Math.round(s.top + scrollY),
                 width: Math.round(s.width), height: Math.round(s.height) };
      });
      const out = (process.env.TEMP || '.') + '/round59-promo-' + (dark ? 'dark' : 'light') + '.png';
      await page.screenshot(out, { clip });
      console.log('shot: ' + out);
    }
  } finally { await close(); }
}
main().catch((e) => { console.error('✖ ' + (e?.stack ?? e)); process.exit(1); });
