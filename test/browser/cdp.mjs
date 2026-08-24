/**
 * The CDP driver every script in this directory is built on.
 *
 * ── WHY THERE IS NO PUPPETEER HERE ──────────────────────────────────────────
 * This repo has no browser-automation dependency and this tier does not add
 * one. Node 22 ships a global WebSocket, which is the whole of what a Chrome
 * DevTools Protocol client needs — a socket, a request id, and a map of pending
 * promises. That is ~120 lines below, against ~200MB of node_modules and a
 * bundled Chromium download that would then need pinning, caching in CI, and
 * updating. The tier is opt-in and never runs in `npm test`, so a dependency
 * that heavy would be carried by everyone to be used by almost nobody.
 *
 * ── WHAT IS CONFIGURABLE, AND WHY ───────────────────────────────────────────
 * NOTHING about the machine is hardcoded. This harness has already been
 * rebuilt three times because it lived in a temp directory, and the previous
 * copies each pinned a port that was dead by the next session (3004, then
 * 3010). Both the origin and the Chrome binary come from the environment with
 * a discovered fallback.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where the dev server is.
 *
 *   FC_ORIGIN=http://localhost:4000   full override, wins over everything
 *   FC_PORT=3010                      port only, on 127.0.0.1
 *   PORT=3010                         the variable `next dev` itself reads
 *   (nothing)                         3000, which is `next dev`'s own default
 *
 * 127.0.0.1 rather than localhost: on a machine where localhost resolves to
 * ::1 first, Next's dev server may only be listening on IPv4 and every request
 * fails in a way that looks like the page is broken.
 */
export const ORIGIN =
  process.env.FC_ORIGIN
  ?? `http://127.0.0.1:${process.env.FC_PORT ?? process.env.PORT ?? 3000}`;

/**
 * Chrome, found rather than assumed.
 *
 * CHROME_PATH is honoured first — it is the variable puppeteer, playwright and
 * lighthouse all read, so a machine already set up for any of them needs no
 * new configuration. Otherwise the usual install locations per platform, in
 * order, taking the first that exists. Edge is last on Windows because it is
 * Chromium and speaks the same protocol; a machine with neither gets a message
 * naming the variable instead of a spawn error.
 */
const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
};

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of CANDIDATES[process.platform] ?? []) {
    if (p && existsSync(p)) return p;
  }
  throw new Error(
    'No Chrome found. Set CHROME_PATH to the browser executable.\n'
    + `Looked in:\n  ${(CANDIDATES[process.platform] ?? []).join('\n  ')}`
  );
}

/**
 * A debugging port unique to THIS process.
 *
 * Two scripts running at once share one port otherwise, the second Chrome
 * fails to bind it, and the second run silently attaches to the FIRST
 * browser — where its `Runtime.evaluate` calls hang against a page it never
 * navigated. That failure reads as "the carousel is broken". It is not.
 */
const DEFAULT_PORT = 9300 + (process.pid % 600);

export async function launch({ debugPort = DEFAULT_PORT } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'fc-cdp-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      // Layout numbers are asserted in CSS px; a host at 125% scaling would
      // otherwise report everything 1.25x.
      '--force-device-scale-factor=1',
    ],
    { stdio: 'ignore', detached: false }
  );

  // Poll /json/version rather than sleeping — the port IS the readiness signal.
  let target = null;
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (r.ok) { target = (await r.json()).webSocketDebuggerUrl; break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!target) {
    try { proc.kill(); } catch { /* already gone */ }
    throw new Error(`Chrome never opened its debugging port (${debugPort})`);
  }

  const browser = await connect(target);
  return {
    browser,
    async close() {
      // RACE, DO NOT AWAIT. `Browser.close` is a command the browser answers by
      // dying, so its reply is never delivered and a bare await here hangs the
      // process AFTER a green run — which is exactly how this first went wrong.
      await Promise.race([
        browser.send('Browser.close').catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      try { browser.close(); } catch { /* socket already down */ }
      try { proc.kill(); } catch { /* already gone */ }
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* win lock */ }
    },
    debugPort,
  };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.data ?? ''})`));
        else res(msg.result);
        return;
      }
      for (const fn of listeners) fn(msg);
    });
    ws.addEventListener('error', reject);
    ws.addEventListener('open', () =>
      resolve({
        send(method, params, sessionId) {
          id += 1;
          const mine = id;
          const payload = { id: mine, method, params: params ?? {} };
          if (sessionId) payload.sessionId = sessionId;
          ws.send(JSON.stringify(payload));
          // A DEADLINE ON EVERY CALL, not only on the one known to be
          // unanswerable. Any command whose target dies mid-flight leaves a
          // promise that never settles, and the symptom is a run that has
          // already printed its results and then simply does not exit.
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(mine);
              rej(new Error(`CDP timeout: ${method}`));
            }, 30000);
            pending.set(mine, {
              resolve: (v) => { clearTimeout(timer); res(v); },
              reject: (e) => { clearTimeout(timer); rej(e); },
            });
          });
        },
        on(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
        close() { ws.close(); },
      })
    );
  });
}

/**
 * A page at a fixed viewport, with the network log recording.
 *
 * `width`/`height` go through Emulation.setDeviceMetricsOverride rather than a
 * window size, so 375 really is 375 CSS px whatever the host window manager
 * does to a headless window.
 */
export async function openPage(browser, { width, height = 900, mobile = false,
  reducedMotion = false } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Network.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile,
    screenWidth: width, screenHeight: height,
  });

  // ── prefers-reduced-motion IS EMULATED, NOT LEFT TO THE DEFAULT ───────────
  // Headless Chrome answers `(prefers-reduced-motion: reduce)` TRUE unless told
  // otherwise, and `--force-prefers-reduced-motion=0` on the command line does
  // NOT change it. Left alone, the carousel correctly refuses to auto-start and
  // every timing assertion reads `data-fc-paused="reduced-motion"` — the
  // component being right and the harness testing the wrong branch. Worse, a
  // test written the other way round ("it does not advance") would PASS here
  // for entirely the wrong reason.
  await s('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion',
      value: reducedMotion ? 'reduce' : 'no-preference' }],
  });

  // Touch emulation, but deliberately NOT `setEmitTouchEventsForMouse`. With
  // that on, Input.dispatchMouseEvent is swallowed and never acknowledged — the
  // command simply never returns, and without the deadline above the run hangs.
  // Taps are dispatched through `tap()` below instead.
  if (mobile) {
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }

  const requests = [];
  browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  });

  return {
    sessionId,
    requests,
    send: s,
    async goto(path, { waitMs = 2500 } = {}) {
      await s('Page.navigate', { url: ORIGIN + path });
      await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(fn, ...args) {
      const expr = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
      const { result, exceptionDetails } = await s('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value;
    },
    /**
     * Screenshot, optionally clipped.
     *
     * `clip` IS IN PAGE COORDINATES, not viewport coordinates. Passing a
     * `getBoundingClientRect()` straight in silently photographs whatever is
     * that far down the DOCUMENT — which once produced a confident "band at the
     * seam" that was the hero mascot 3000px above it. Add scrollX/scrollY.
     */
    async screenshot(path, { clip = null } = {}) {
      const params = { format: 'png' };
      if (clip) params.clip = { ...clip, scale: 1 };
      const { data } = await s('Page.captureScreenshot', params);
      writeFileSync(path, Buffer.from(data, 'base64'));
      return path;
    },
    /**
     * A press-and-release at a viewport point.
     *
     * MOUSE, EVEN ON THE EMULATED PHONE. A raw touchStart/touchEnd pair over
     * CDP does not go through the gesture recogniser, so it never synthesises
     * the click an anchor needs — measured: 0 navigations from a touch pair, 1
     * from this. Touch emulation stays on so the page still reports a touch
     * device; only the activation is dispatched as a pointer press.
     */
    async tap(x, y) {
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      for (const type of ['mousePressed', 'mouseReleased']) {
        await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    /** A real finger drag, for the swipe path. */
    async swipe(from, to, steps = 8) {
      await s('Input.dispatchTouchEvent', { type: 'touchStart',
        touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
      for (let i = 1; i <= steps; i += 1) {
        await s('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
          x: Math.round(from.x + ((to.x - from.x) * i) / steps),
          y: Math.round(from.y + ((to.y - from.y) * i) / steps), id: 1 }] });
      }
      await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async wait(ms) { await new Promise((r) => setTimeout(r, ms)); },
    async close() { await browser.send('Target.closeTarget', { targetId }); },
  };
}

/**
 * Assertion tape: collects rather than throwing, so one run reports every
 * failure instead of stopping at the first.
 *
 * The closing line is `[name] passed/total` and run.mjs parses exactly that,
 * so the shape is load-bearing — a script that changes it still runs but stops
 * contributing a count.
 */
export function tape(name) {
  const rows = [];
  return {
    ok(cond, label, detail) { rows.push({ pass: Boolean(cond), label, detail }); },
    eq(actual, expected, label, detail) {
      const pass = actual === expected;
      rows.push({
        pass,
        label,
        detail: pass ? (detail ?? '')
          : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
      });
    },
    near(actual, expected, tol, label) {
      const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
      rows.push({ pass, label, detail: pass ? `${actual}` : `got ${actual}, want ${expected}±${tol}` });
    },
    report() {
      const passed = rows.filter((r) => r.pass).length;
      for (const r of rows) {
        console.log(`${r.pass ? '  ok' : 'FAIL'}  ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
      }
      console.log(`\n[${name}] ${passed}/${rows.length}`);
      return { passed, total: rows.length, ok: passed === rows.length };
    },
  };
}
