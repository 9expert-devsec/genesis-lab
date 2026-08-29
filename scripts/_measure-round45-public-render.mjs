/**
 * ROUND 45 — is the PUBLIC render of SectionRenderer byte-identical after the
 * editor-only empty marker?
 *
 * The commit adds a branch to a component the published site renders through.
 * "It is gated on `path`, and public callers pass none" is an argument; this is
 * the measurement. The pre-change file is read out of git, written beside the
 * current one so its relative imports resolve to the same modules, and BOTH are
 * rendered over the same corpus with `path: null`. Every pair must match byte
 * for byte.
 *
 * ── THE CONTROL, WHICH IS THE POINT ───────────────────────────────────────
 * "0 differences" and "the comparison never ran" print the same number. So the
 * same corpus is rendered a second time with `path` SET, and those pairs must
 * DIFFER — for the empty sections, by the marker; for every section, by
 * data-pb-path. A run where both columns report zero is a broken harness, not a
 * clean result, and it says so.
 *
 * READ-ONLY apart from one temp file it creates and removes under src/.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round45-public-render.mjs
 *   BASE_REF=<sha> node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round45-public-render.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';
import { slotsOf } from '@/lib/pageBuilder/containerSlots';

const ROOT = process.cwd();
const TARGET = 'src/components/pageBuilder/SectionRenderer.jsx';
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const BASELINE = path.join(ROOT, 'src/components/pageBuilder/_baseline_SectionRenderer.jsx');

const before = execFileSync('git', ['show', `${BASE_REF}:${TARGET}`], { encoding: 'utf8' });
writeFileSync(BASELINE, before, 'utf8');

let report;
try {
  const { SectionRenderer: Now } = await import('@/components/pageBuilder/SectionRenderer');
  const { SectionRenderer: Then } = await import('@/components/pageBuilder/_baseline_SectionRenderer');

  /**
   * The corpus. Every type whose component returns null outright (the ones
   * sectionRendersEmpty mirrors) in its EMPTY form, each of those in a FILLED
   * form, and a spread of wrapper options — spacing, container width, custom
   * class, an anchor id, scoped css and custom html — because the marker was
   * added inside that wrapper and the wrapper is what the public page renders.
   */
  const CORPUS = [
    { id: 'a', type: 'heading', enabled: true, content: { text: '' } },
    { id: 'b', type: 'heading', enabled: true, content: { text: 'หัวข้อจริง', level: 2 } },
    { id: 'c', type: 'notice', enabled: true, content: { text: '' } },
    { id: 'd', type: 'notice', enabled: true, content: { text: 'ประกาศ' } },
    { id: 'e', type: 'image', enabled: true, content: { src: '' } },
    { id: 'f', type: 'image', enabled: true, content: { src: '/a.jpg', alt: 'ก' } },
    { id: 'g', type: 'checklist', enabled: true, content: { items: [] } },
    { id: 'h', type: 'checklist', enabled: true, content: { items: [{ text: 'ข้อหนึ่ง' }] } },
    { id: 'i', type: 'rich_text', enabled: true, content: { doc: { type: 'doc', content: [] } } },
    { id: 'j', type: 'price_card', enabled: true, content: { title: '', price: '', features: [] } },
    { id: 'k', type: 'price_card', enabled: true, content: { title: 'แพ็กเกจ', price: '9,900', features: ['ก'] } },
    { id: 'l', type: 'stat_card', enabled: true, content: { value: '', label: '' } },
    { id: 'm', type: 'stat_card', enabled: true, content: { value: '73', label: 'หลักสูตร' } },
    { id: 'n', type: 'icon_card', enabled: true, content: { icon: '', title: '', description: '' } },
    { id: 'o', type: 'custom_html', enabled: true, content: { html: '' } },
    { id: 'p', type: 'custom_html', enabled: true, content: { html: '<p>สวัสดี</p>' } },
    { id: 'q', type: 'custom_css', enabled: true, content: { css: '' } },
    { id: 'r', type: 'embed', enabled: true, content: { provider: 'iframe', html: '' } },
    { id: 's', type: 'debug_json', enabled: true, content: { json: '' } },
    { id: 't', type: 'course_card', enabled: true, content: { courseId: '' } },
    { id: 'u', type: 'course_list', enabled: true, content: { source: 'manual', courseIds: [] } },
    { id: 'v', type: 'container', enabled: true, content: { children: [] } },
    {
      id: 'w', type: 'container', enabled: true,
      content: { children: [{ id: 'w1', type: 'heading', enabled: true, content: { text: '' } }] },
    },
    { id: 'x', type: 'cta', enabled: true, content: { label: '', href: '' } },
    {
      id: 'y', type: 'heading', enabled: true, content: { text: '' },
      settings: { spacingTop: 'large', spacingBottom: 'none', containerWidth: 'small', background: 'dark' },
      advanced: { customClass: 'my-own-class', sectionId: 'anchor-one', customCss: 'p{color:red}', customHtml: '<b>x</b>' },
      style: {},
    },
    {
      id: 'z', type: 'heading', enabled: true, content: { text: '' },
      settings: { visibility: 'mobile_only' },
    },
  ];

  const draw = (Component, section, p) =>
    renderToStaticMarkup(createElement(Component, { section, depth: 0, path: p, resolvedData: null }));

  /**
   * The marker RECURSES, because SectionRenderer does. A container that is not
   * itself empty still changes in the editor when one of its children is —
   * fixture `w` is exactly that, and the control read as broken until it said
   * so. This is the rule the editor render actually follows.
   */
  const anyEmpty = (section) => {
    if (sectionRendersEmpty(section)) return true;
    const slots = slotsOf(section?.type);
    if (!slots) return false;
    return slots.some((slot) => {
      const arr = section?.content?.[slot];
      return Array.isArray(arr) && arr.some(anyEmpty);
    });
  };

  const publicDiffs = [];
  const editorChanged = [];
  const mismatched = [];
  for (const section of CORPUS) {
    const a = draw(Then, section, null);
    const b = draw(Now, section, null);
    if (a !== b) publicDiffs.push({ id: section.id, type: section.type, before: a, after: b });

    const ea = draw(Then, section, ['sections', 0]);
    const eb = draw(Now, section, ['sections', 0]);
    const changedInEditor = ea !== eb;
    const shouldChange = anyEmpty(section);
    if (changedInEditor !== shouldChange) {
      mismatched.push(`${section.id}:${section.type} changedInEditor=${changedInEditor} rendersEmpty=${shouldChange}`);
    }
    if (changedInEditor) editorChanged.push(`${section.id}:${section.type}`);
  }

  report = {
    baseRef: BASE_REF,
    corpusSize: CORPUS.length,

    '── THE ANSWER ──': '',
    PUBLIC_RENDERS_DIFFERING: publicDiffs.length,
    publicDiffs,

    '── CONTROL: the comparison CAN report a difference, and only where it should ──': '',
    // A zero above says either “nothing changed” or “nothing was compared”, and
    // those are the same number. So the SAME corpus is compared with `path` set:
    // the editor render must differ for EXACTLY the sections sectionRendersEmpty
    // calls empty (or that CONTAIN one), and match for every other one. Both
    // directions, one list.
    editorRendersDIFFERING: editorChanged,
    editorRendersDIFFERINGCount: editorChanged.length,
    disagreeWithTheEmptyRule: mismatched,
    controlDiscriminates: editorChanged.length > 0 && mismatched.length === 0,
  };
} finally {
  rmSync(BASELINE, { force: true });
}

console.log(JSON.stringify(report, null, 2));
