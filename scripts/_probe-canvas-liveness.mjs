/**
 * ROUND 45 — does an ADD or an EDIT reach the canvas without a save?
 *
 * The report was "adding a section, or editing one, does not show in the canvas
 * until the page is saved and reopened". Reading the prop chain refutes the
 * obvious cause — CanvasPanel takes `page` from useEditor(), EditorProvider
 * spreads `...state`, so the canvas already renders the reducer's working tree
 * — which means the answer is not in the data flow and has to be MEASURED.
 *
 * Not a test — a probe. It renders the REAL CanvasPanel with react-dom/client
 * into JSDOM so effects actually run (renderToStaticMarkup runs none, and the
 * frame document only exists because of an effect), dispatches real actions
 * through the real reducer, and reports what is inside the frame after each one.
 *
 * Run BOTH modes — they answer different questions and round 45 measured
 * different answers:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-canvas-liveness.mjs seeded
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-canvas-liveness.mjs empty
 *
 * WHAT IT CANNOT SHOW: JSDOM has no layout and no CSS cascade, so nothing here
 * says a section was VISIBLE — only whether it was rendered into the frame's
 * document at all. That is the question the report turns on.
 */
import { JSDOM } from 'jsdom';

const MODE = process.argv[2] === 'empty' ? 'empty' : 'seeded';

const dom = new JSDOM(
  '<!doctype html><html class="__variable_x"><head></head><body><div id="root"></div></body></html>',
  { url: 'http://localhost:3000/admin/pages/builder/1/edit', pretendToBeVisual: true }
);
global.window = dom.window;
global.document = dom.window.document;
// Node 22 defines `navigator` as a getter-only global, so it is redefined
// rather than assigned; react-dom reads it during hydration checks.
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.getComputedStyle = dom.window.getComputedStyle;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { EditorProvider, useEditor } = await import('@/components/pageBuilder/editor/EditorProvider');
const { CanvasPanel } = await import('@/components/pageBuilder/editor/CanvasPanel');

const SAVED = {
  id: 's0', type: 'heading', enabled: true, sortOrder: 0,
  content: { text: 'หัวข้อที่บันทึกไว้แล้ว' },
};
const PAGE = {
  _id: 'p1', title: 'T', slug: 't', theme: 'default',
  sections: MODE === 'empty' ? [] : [SAVED],
};

let api = null;
const Probe = () => { api = useEditor(); return null; };

const container = document.getElementById('root');
const root = createRoot(container);

function report(label) {
  const frame = container.querySelector('iframe');
  const fdoc = frame ? frame.contentDocument : null;
  const html = fdoc ? fdoc.body.innerHTML : null;
  console.log(`\n── ${label}`);
  console.log(`   sections in the working tree : ${(api.page.sections ?? []).length}`);
  console.log(`   empty-state message shown    : ${container.textContent.includes('หน้านี้ยังว่างอยู่')}`);
  console.log(`   <iframe> mounted             : ${Boolean(frame)}`);
  console.log(`   canvas portalled into frame  : ${Boolean(html && html.includes('data-pb-canvas'))}`);
  console.log(`   [data-pb-path] nodes in frame: ${fdoc ? fdoc.querySelectorAll('[data-pb-path]').length : 'n/a'}`);
  // The injected selection/hover rules live in a <style> INSIDE the canvas, so
  // body.textContent would report CSS as if it were page copy.
  const visible = fdoc
    ? [...fdoc.body.querySelectorAll('[data-pb-path]')]
        .map((el) => `${el.getAttribute('data-pb-path')}=${JSON.stringify(el.textContent.trim())}`)
    : [];
  console.log(`   what each section shows      : ${visible.join('  |  ') || '(nothing)'}`);
}

await act(async () => {
  root.render(
    h(EditorProvider, {
      page: PAGE, pageId: 'p1', updatedAt: null,
      tier: { canUseAdvanced: true, canPublish: true, canManagePreview: true },
      currentUserName: 'ผู้ทดสอบ',
    }, h(Probe), h(CanvasPanel))
  );
});
report(`0. on mount (${MODE} page)`);

await act(async () => {
  api.dispatch({
    type: 'ADD_SECTION', parentPath: ['sections'], index: (api.page.sections ?? []).length,
    section: { id: 'added', type: 'heading', enabled: true, sortOrder: 99, content: { text: '' } },
  });
});
report('1. after ADD_SECTION — a heading with no text yet');

await act(async () => {
  api.dispatch({
    type: 'PATCH_SECTION_KEY',
    path: ['sections', (api.page.sections ?? []).length - 1],
    key: 'content', patch: { text: 'พิมพ์แล้ว' },
  });
});
report('2. after typing into the section just added');

await act(async () => {
  api.dispatch({ type: 'SAVE_START' });
});
report('3. while the autosave is in flight');

await act(async () => {
  api.dispatch({ type: 'SAVE_OK', domains: ['content'], dirtyDuring: [], updatedAt: '2026-08-29T00:00:00.000Z', at: 0 });
});
report('4. after the autosave lands');

if (MODE === 'seeded') {
  await act(async () => {
    api.dispatch({
      type: 'PATCH_SECTION_KEY', path: ['sections', 0],
      key: 'content', patch: { text: 'แก้ไขข้อความเดิม' },
    });
  });
  report('5. after editing the ALREADY-SAVED section');
}
