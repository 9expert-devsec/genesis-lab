import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * สระอำ must be the COMPOSED codepoint U+0E33, never the decomposed
 * นิคหิต U+0E4D followed by สระอา U+0E32.
 *
 * ── WHY THIS NEEDS A TEST AND NOT JUST CARE ─────────────────────────────────
 * The two forms render near-identically. In most fonts you cannot tell them
 * apart at body size, and no linter, compiler or type system has an opinion
 * about either. The failure they produce is silent in both directions:
 *
 *   · A search for `จำกัด` does not match `จํากัด`, so a decomposed company
 *     name is invisible to grep, to a find-and-replace during a rename, and to
 *     any equality check in code.
 *   · Conversely nothing LOOKS wrong on the page, so it survives review.
 *
 * This is not hypothetical and it is not a typo anyone made here. The live site
 * at 9experttraining.com/privacy-policy writes the company name with the
 * DECOMPOSED form — three occurrences, all of them `จํากัด`, while all 18 other
 * สระอำ on that page are composed. The privacy content on /privacy-policy was
 * ported from that page. Copying it verbatim would have imported the
 * decomposed form into this repo invisibly, and this test is the thing standing
 * between that and a company name nobody can find.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 * All of src/. The trap is not specific to the policy pages — it arrives with
 * any Thai text pasted from the old site, which is most Thai text in this repo.
 * Scoping it to the legal centre would guard the one place that already knows.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** U+0E4D THAI CHARACTER NIKHAHIT — the decomposed half of สระอำ. */
const NIKHAHIT = 'ํ';

/** U+0E33 THAI CHARACTER SARA AM — the composed form, the only allowed one. */
const SARA_AM = 'ำ';

const SOURCE_EXT = /\.(js|jsx|mjs|json|css|md)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every offence as `relative/path:line`, so a failure names the exact spot. */
function findNikhahit(files) {
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes(NIKHAHIT)) continue;
    text.split('\n').forEach((line, i) => {
      if (line.includes(NIKHAHIT)) {
        hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    });
  }
  return hits;
}

test('no decomposed นิคหิต (U+0E4D) anywhere in src/', () => {
  const hits = findNikhahit(walk(path.join(ROOT, 'src')));
  assert.deepEqual(
    hits,
    [],
    'Decomposed สระอำ found. Replace U+0E4D + U+0E32 with the single '
      + `codepoint U+0E33 (${SARA_AM}) at:\n  ${hits.join('\n  ')}`,
  );
});

test('the legal entity name is written with composed สระอำ', () => {
  const site = readFileSync(path.join(ROOT, 'src/config/site.js'), 'utf8');
  const match = site.match(/nameFull:\s*'([^']+)'/);

  assert.ok(match, 'siteConfig.nameFull not found — did the key move?');
  const name = match[1];

  assert.ok(
    name.includes(SARA_AM),
    `nameFull should contain the composed สระอำ U+0E33, got: ${JSON.stringify(name)}`,
  );
  assert.ok(
    !name.includes(NIKHAHIT),
    'nameFull contains the DECOMPOSED form U+0E4D. It renders the same and '
      + 'matches nothing.',
  );
  assert.equal(
    name,
    'บริษัท นายน์เอ็กซ์เพิร์ท จำกัด',
    'The legal entity name changed. It appears on five legal pages via '
      + 'POLICY_ENTITY — confirm this is deliberate.',
  );
});

/**
 * THE CONTROL. Without it, a detector that never fires is indistinguishable
 * from a codebase that is clean — and the first is the failure mode this whole
 * file exists to prevent, since a scan for a character that renders invisibly
 * is exactly the kind of check nobody notices has broken.
 */
test('CONTROL: the scan detects the decomposed form when it is present', () => {
  const decomposed = `บริษัท นายน์เอ็กซ์เพิร์ท จ${NIKHAHIT}ากัด`;
  const composed = 'บริษัท นายน์เอ็กซ์เพิร์ท จำกัด';

  // The premise: these are different strings that look the same.
  assert.notEqual(decomposed, composed, 'the two forms must not be equal');
  assert.ok(decomposed.includes(NIKHAHIT), 'the fixture must be decomposed');
  assert.ok(!composed.includes(NIKHAHIT), 'the fixture must be composed');

  // And the detector fires on one and not the other.
  assert.equal(decomposed.includes(NIKHAHIT), true);
  assert.equal(composed.includes(NIKHAHIT), false);
});

/**
 * ── NORMALISATION DOES NOT FIX THIS, AND TWO FORMS ACTIVELY CAUSE IT ────────
 *
 * The reflex on being told "this text is in a decomposed form" is
 * `.normalize('NFC')`. It does nothing here. The reflex after that — "then use
 * the compatibility form" — is actively destructive. Both are pinned below so
 * the next person finds out in a second rather than after shipping.
 *
 * Measured behaviour of U+0E33 SARA AM vs the sequence U+0E4D + U+0E32:
 *
 *            composed (ำ)          decomposed (U+0E4D U+0E32)
 *   NFC      unchanged             unchanged
 *   NFD      unchanged             unchanged
 *   NFKC     → DECOMPOSED          unchanged
 *   NFKD     → DECOMPOSED          unchanged
 *
 * So U+0E33 has no CANONICAL decomposition — NFC and NFD are the identity on
 * both spellings and can never repair one — but it does have a COMPATIBILITY
 * decomposition, which means NFKC and NFKD take correct text and rewrite it
 * into the broken form.
 *
 * Two consequences worth stating plainly:
 *
 *   1. There is no normalisation call that repairs a decomposed string. The
 *      only repair is an explicit replacement of the two-codepoint sequence.
 *   2. NEVER run NFKC/NFKD over Thai content in this repo. A "let's normalise
 *      everything" pass would manufacture this exact defect across every Thai
 *      string at once, and the scan above would light up with hundreds of hits
 *      that nobody typed.
 *
 * If this test goes red, the Unicode data has changed and the guidance above
 * needs re-deriving — do not just update the expectation.
 */
test('NFC/NFD cannot repair the decomposed sequence; NFKC/NFKD cause it', () => {
  const decomposed = `จ${NIKHAHIT}ากัด`;
  const composed = 'จำกัด';

  // Canonical forms: identity on both. They never fix and never break.
  for (const form of ['NFC', 'NFD']) {
    assert.equal(
      decomposed.normalize(form),
      decomposed,
      `${form} altered the decomposed sequence — Unicode data changed`,
    );
    assert.notEqual(
      decomposed.normalize(form),
      composed,
      `${form} appeared to repair the decomposed form. It does not.`,
    );
    assert.equal(
      composed.normalize(form),
      composed,
      `${form} altered the composed form — Unicode data changed`,
    );
  }

  // Compatibility forms: they rewrite GOOD text into the broken spelling.
  for (const form of ['NFKC', 'NFKD']) {
    assert.equal(
      composed.normalize(form),
      decomposed,
      `${form} no longer decomposes สระอำ — re-derive the guidance above`,
    );
    assert.ok(
      composed.normalize(form).includes(NIKHAHIT),
      `${form} is expected to INTRODUCE U+0E4D into correct text`,
    );
  }

  // The only thing that actually repairs it.
  assert.equal(
    decomposed.replace(new RegExp(`${NIKHAHIT}า`, 'g'), SARA_AM),
    composed,
  );
});
