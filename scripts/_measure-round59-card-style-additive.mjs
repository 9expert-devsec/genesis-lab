/**
 * ROUND 59 §H/§I — is the sixth `cardStyle` value ADDITIVE?
 *
 * ── WHY THIS IS A SECOND HARNESS, NOT A FLAG ON THE FIRST ────────────────
 * `_measure-round59-price-card.mjs` baselines `price_card.jsx`. Commit 3 does
 * not touch that file — it adds one key to CARD_STYLE_CLASS in presets.js and
 * one value to CARD_STYLES in base.js. Run against that harness, BOTH sides
 * import the same (new) presets module, so even a `cardStyle: 'promo'` fixture
 * comes out identical. That run reported controlDiscriminates FALSE, which is
 * the harness correctly refusing to certify a comparison it cannot make. The
 * changed axis is the RESOLUTION CHAIN, so that is what this baselines.
 *
 * ── BOTH FILES, OR THE BASELINE WILL NOT LOAD ────────────────────────────
 * presets.js asserts at module load that CARD_STYLE_CLASS covers every value in
 * CARD_STYLES. Loading the OLD five-key map against the NEW six-value enum
 * throws — which is `assertComplete` working, and it means the baseline must
 * carry its own copy of the enum. The pulled source has its `base` import
 * rewritten to the baseline copy for exactly that reason.
 *
 * ── WHAT IS PROVED ───────────────────────────────────────────────────────
 * `cardSurfaceClass` over the FULL cross-product of (every reader + two
 * non-readers) x (every pre-existing value + absent + null + unknown). Every
 * one of those must be byte-identical, because that is the whole surface
 * through which a stored section reaches a class.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * `promo` itself: '' at the baseline, a composed class now, on all three
 * readers and still '' on the non-readers. If those fail to differ the
 * comparison is not running and every zero above is meaningless.
 *
 * READ-ONLY apart from two temp files at src/ root, removed in a finally.
 * (src/ root is covered by none of tailwind.config.js's three content globs —
 * a temp file under src/components is scanned by a watching dev server and its
 * deletion breaks the CSS build. Learned the hard way in commit 2.)
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round59-card-style-additive.mjs
 *   BASE_REF=<sha> ... (defaults to HEAD)
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const PRESETS_SRC = 'src/lib/pageBuilder/presets.js';
const BASE_SRC = 'src/lib/schemas/sections/base.js';
const PRESETS_TMP = path.join(ROOT, 'src/_baseline_presets.generated.js');
const BASE_TMP = path.join(ROOT, 'src/_baseline_base.generated.js');

const show = (p) => execFileSync('git', ['show', `${BASE_REF}:${p}`], { encoding: 'utf8' });

writeFileSync(BASE_TMP, show(BASE_SRC), 'utf8');
writeFileSync(
  PRESETS_TMP,
  show(PRESETS_SRC).replace("from '@/lib/schemas/sections/base'", "from '@/_baseline_base.generated.js'"),
  'utf8',
);

const report = { baseRef: BASE_REF };
try {
  const now = await import('@/lib/pageBuilder/presets');
  const then = await import('@/_baseline_presets.generated.js');
  const { CARD_STYLES: NOW_VALUES } = await import('@/lib/schemas/sections/base');
  const { CARD_STYLES: THEN_VALUES } = await import('@/_baseline_base.generated.js');

  report['── THE ENUM ──'] = '';
  report.valuesBefore = THEN_VALUES;
  report.valuesAfter = NOW_VALUES;
  report.added = NOW_VALUES.filter((v) => !THEN_VALUES.includes(v));
  report.removed = THEN_VALUES.filter((v) => !NOW_VALUES.includes(v));

  /** Every type that could reach cardSurfaceClass, readers and non-readers. */
  const TYPES = ['price_card', 'stat_card', 'icon_card', 'heading', 'cta', 'course_card'];
  /** Every style shape a stored section can actually be in. */
  const SHAPES = [
    ['style absent', undefined],
    ['style null', null],
    ['style {}', {}],
    ['other style keys only', { accentColor: 'brand_blue', buttonStyle: 'outline' }],
    ['cardStyle undefined', { cardStyle: undefined }],
    ['unknown value', { cardStyle: 'no-such-style' }],
    ...THEN_VALUES.map((v) => [`cardStyle ${v}`, { cardStyle: v }]),
  ];

  const rows = {}; const differing = [];
  for (const type of TYPES) {
    for (const [name, style] of SHAPES) {
      const a = then.cardSurfaceClass(type, style);
      const b = now.cardSurfaceClass(type, style);
      const key = `${type} / ${name}`;
      rows[key] = { before: a, after: b, identical: a === b };
      if (a !== b) differing.push(key);
    }
  }
  report['── EVERY PRE-EXISTING INPUT ──'] = '';
  report.inputsCompared = Object.keys(rows).length;
  report.perInput = rows;
  report.PRE_EXISTING_INPUTS_DIFFERING = differing;

  const control = {}; const failedToDiffer = [];
  for (const type of TYPES) {
    const a = then.cardSurfaceClass(type, { cardStyle: 'promo' });
    const b = now.cardSurfaceClass(type, { cardStyle: 'promo' });
    const isReader = now.sectionSupportsStyle(type, 'cardStyle');
    control[type] = { before: a, after: b, differs: a !== b, declaresCardStyle: isReader };
    // A reader MUST change; a non-reader must NOT (it is gated out either way).
    if (isReader && a === b) failedToDiffer.push(type);
    if (!isReader && a !== b) failedToDiffer.push(`${type} (non-reader changed!)`);
  }
  report['── CONTROL: the new value, on readers and non-readers ──'] = '';
  report.promoPerType = control;
  report.controlFailures = failedToDiffer;
  report.controlDiscriminates = failedToDiffer.length === 0;
  report.controlIsMeaningful = differing.length === 0
    ? 'yes — no pre-existing input differs, so the control flag carries information'
    : 'NO — pre-existing inputs differ, so controlDiscriminates says nothing (round 41)';
} finally {
  rmSync(PRESETS_TMP, { force: true });
  rmSync(BASE_TMP, { force: true });
}

console.log(JSON.stringify(report, null, 2));
