/**
 * ROUND 59 §G — THE TWO THEME AXES, and whether `promo` can land text on a
 * surface of the same colour.
 *
 * There are two independent switches and they are easy to conflate:
 *
 *   SITE theme   `.dark` on the root element (tailwind darkMode:'class',
 *                written by next-themes). It is what `--surface`,
 *                `--surface-border` and `--shadow-color` answer to.
 *   PAGE theme   `page.theme` -> THEME[t].pageClass, applied by
 *                PageBuilderView. `corporate_navy` is the one dark entry and it
 *                paints `bg-9e-navy text-9e-ice` REGARDLESS of `.dark`.
 *
 * So a card's SURFACE can follow one axis while the text it inherits follows
 * the other. This renders the real page wrapper at every combination and reads
 * the computed pair, so the answer is measured rather than argued.
 *
 * NOT a promo-only question — `filled` (#F8FAFD) and `gradient` are literal
 * light hexes and answer NEITHER axis, so they are in the table too. Whatever
 * this finds, it is a property of the enum that predates this commit.
 *
 * Contrast is reported as a WCAG ratio so "readable" is a number, not a look.
 *
 * READ-ONLY. Needs the dev server and Chrome.
 *   FC_PORT=3001 node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round59-theme-axes.mjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';
import { createElement } from 'react';
import { SectionRenderer } from '../src/components/pageBuilder/SectionRenderer.jsx';
import { themeSurface, themeStyle } from '../src/lib/pageBuilder/presets.js';
import { CARD_STYLES } from '../src/lib/schemas/sections/base.js';
import { PAGE_THEMES } from '../src/lib/schemas/pageBuilder.js';

const card = (cardStyle) => ({
  id: 'pc', type: 'price_card', name: '', enabled: true, sortOrder: 0,
  settings: { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium', background: 'default', visibility: 'all' },
  layout: {}, advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
  style: cardStyle ? { cardStyle } : {},
  content: { title: 'ราคาพิเศษ', price: '15,120 บาท', period: '', features: ['เอกสาร'] },
});

/**
 * PageBuilderView is an ASYNC server component (it awaits resolveSectionData),
 * so the sync renderer cannot call it. Its wrapper is reproduced here from the
 * SAME two functions it uses — themeSurface().pageClass and themeStyle() — so
 * the page-theme axis is resolved by the real code and not by a copy of its
 * output. price_card is self-contained, so the data hoist it skips is not one
 * this measurement needs.
 */
const drawPage = (theme, cardStyle) => renderToStaticMarkup(
  createElement(
    'div',
    { className: themeSurface(theme).pageClass, style: themeStyle(theme), 'data-pb-theme': theme },
    SectionRenderer({ section: card(cardStyle), depth: 0, path: null, resolvedData: undefined }),
  ),
);

function measure(html, dark) {
  document.documentElement.classList.toggle('dark', dark);
  document.body.innerHTML = '';
  document.body.setAttribute('style', 'margin:0');
  const host = document.createElement('div');
  host.id = 'h';
  host.innerHTML = html;
  document.body.appendChild(host);
  const el = host.querySelector('.rounded-9e-lg');
  if (!el) return { error: 'no card' };
  const h3 = el.querySelector('h3');
  const cs = getComputedStyle(el);
  const ts = getComputedStyle(h3 ?? el);

  const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const alpha = (s) => { const m = s.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
  // An unpainted card shows the page surface through it — that is what the
  // text is really sitting on, so composite before measuring contrast.
  const pageEl = host.firstElementChild;
  const pageBg = rgb(getComputedStyle(pageEl).backgroundColor);
  const own = rgb(cs.backgroundColor);
  const a = alpha(cs.backgroundColor);
  const effective = cs.backgroundImage !== 'none'
    ? null
    : own.map((c, i) => Math.round((a * c) + ((1 - a) * (pageBg[i] ?? 255))));

  const lum = (c) => {
    const f = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return (0.2126 * f[0]) + (0.7152 * f[1]) + (0.0722 * f[2]);
  };
  const text = rgb(ts.color);
  let ratio = null;
  if (effective) {
    const l1 = lum(text); const l2 = lum(effective);
    ratio = +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2);
  }
  return {
    cardBg: cs.backgroundImage !== 'none' ? 'gradient' : `rgb(${effective.join(',')})`,
    textColor: `rgb(${text.join(',')})`,
    contrast: ratio,
  };
}

async function main() {
  const { browser, close } = await launch();
  try {
    const page = await openPage(browser, { width: 1440, height: 900 });
    await page.send('Page.navigate', { url: ORIGIN + '/promotions' });
    await new Promise((r) => setTimeout(r, 8000));

    console.log('page themes: ' + JSON.stringify(PAGE_THEMES));
    for (const theme of ['default', 'corporate_navy']) {
      for (const dark of [false, true]) {
        console.log('');
        console.log(`### page.theme=${theme}   site .dark=${dark}`);
        console.log('cardStyle    cardBg (composited)     text            contrast');
        for (const v of [null, ...CARD_STYLES]) {
          const m = await page.eval(measure, drawPage(theme, v), dark);
          const flag = m.contrast != null && m.contrast < 4.5 ? '   <-- below WCAG AA 4.5:1' : '';
          console.log(
            String(v ?? '<absent>').padEnd(12)
            + String(m.cardBg).padEnd(24)
            + String(m.textColor).padEnd(16)
            + String(m.contrast ?? 'n/a (gradient)') + flag);
        }
      }
    }
  } finally { await close(); }
}
main().catch((e) => { console.error('✖ ' + (e?.stack ?? e)); process.exit(1); });
