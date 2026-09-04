/**
 * Measure the Advanced HTML editor column on the RUNNING dev server.
 *
 *   node --env-file=.env.local scripts/measure-editor-column.mjs
 *
 * Two numbers, captured before and after the slug row is removed from the main
 * column:
 *   1. the vertical gap from the BOTTOM of the H1 textarea to the TOP of the
 *      editor body (the ProseMirror surface, or the source-mode textarea);
 *   2. every element that sits BETWEEN those two, with its height and whether it
 *      renders anything — which is how "no empty container was left behind" is
 *      answered with a measurement rather than a reading of the diff.
 *
 * ── WHY IT MINTS A SESSION COOKIE ─────────────────────────────────────────
 * /admin/pages/<id>/edit is behind requirePage('pages'), so an unauthenticated
 * headless Chrome measures the sign-in page and reports a confident, wrong
 * number. The cookie is signed with the LOCAL dev AUTH_SECRET, is valid for 30
 * minutes, and is never written anywhere: the script only reads geometry.
 *
 * It is NOT in test/browser/ and NOT in that runner's SCRIPTS list, deliberately.
 * It asserts nothing — it is a tool for producing evidence, the same reason
 * shot.mjs is excluded there.
 */
import { encode } from 'next-auth/jwt';
import { launch, openPage, ORIGIN } from '../test/browser/cdp.mjs';

const COOKIE = 'authjs.session-token';

const secret = process.env.AUTH_SECRET;
if (!secret) {
  console.error('AUTH_SECRET is not set. Run with: node --env-file=.env.local');
  process.exit(1);
}

const token = await encode({
  token: {
    id: 'measure-bot',
    name: 'Measure Bot',
    roleKey: 'superadmin',
    roleName: 'Superadmin',
    isSuperadmin: true,
    pages: null,
    tier: 'developer',
  },
  secret,
  salt: COOKIE,
  maxAge: 60 * 30,
});

const { browser, close } = await launch();
try {
  const page = await openPage(browser, { width: 1440, height: 900 });

  await page.send('Network.setCookie', {
    name: COOKIE,
    value: token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });

  // 1. find an edit URL from the admin list
  await page.goto('/admin/pages', { waitMs: 4000 });
  const found = await page.eval(() => ({
    path: location.pathname,
    hrefs: [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => /^\/admin\/pages\/[^/]+\/edit$/.test(h)),
  }));

  if (!found.hrefs.length) {
    console.error(`no edit links at ${found.path} — not authenticated, or no pages exist`);
    process.exit(1);
  }
  const editHref = found.hrefs[0];

  // 2. the edit page. Tiptap mounts client-side, so this waits generously.
  await page.goto(editHref, { waitMs: 9000 });

  const out = await page.eval(() => {
    const h1 = document.querySelector('textarea[placeholder]');
    if (!h1) return { error: 'H1 textarea not found — page did not render' };
    const scroller = h1.parentElement;

    const body = document.querySelector('.ProseMirror')
      || [...document.querySelectorAll('textarea')].find((t) => t !== h1);
    if (!body) return { error: 'editor body not found' };

    const hb = h1.getBoundingClientRect();
    const bb = body.getBoundingClientRect();

    /**
     * Everything between the H1 and the editor body, measured.
     *
     * `rendersNothing` is what answers "is an empty container left behind".
     * SELF-DRAWING tags are excluded from that verdict — an <hr> paints a rule
     * with no text and no children, and counting it as empty would report the
     * divider as debris. querySelectorAll searches DESCENDANTS only, so the
     * element's own tag has to be checked separately; without that the <hr>
     * flagged itself, which is how a measurement lies in your favour.
     */
    const SELF_DRAWING = new Set(['hr', 'img', 'svg', 'input', 'textarea', 'canvas', 'video']);
    const between = [];
    for (const el of scroller.children) {
      const r = el.getBoundingClientRect();
      if (r.top >= hb.bottom - 1 && r.bottom <= bb.top + 1) {
        const tag = el.tagName.toLowerCase();
        between.push({
          tag,
          cls: String(el.className || '').slice(0, 70),
          height: Math.round(r.height),
          text: (el.textContent || '').trim().slice(0, 40),
          rendersNothing: (el.textContent || '').trim() === ''
            && !SELF_DRAWING.has(tag)
            && el.querySelectorAll('input,textarea,img,svg,hr,canvas,video').length === 0,
        });
      }
    }

    return {
      h1Bottom: Math.round(hb.bottom),
      bodyTop: Math.round(bb.top),
      gapPx: Math.round(bb.top - hb.bottom),
      slugInputPresent: !!document.querySelector('input[placeholder="my-page-slug"]'),
      siteUrlPrefixPresent: document.body.innerText.includes('https://9experttraining.com/'),
      between,
    };
  });

  console.log(`measured: ${editHref}`);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await close();
}
