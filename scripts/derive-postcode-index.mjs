/**
 * Derive the flat postcode lookup the address form uses. BUILD-TIME, PURE.
 *
 * Reads   src/data/thailand_postcode_2026.json   (nested, user-maintained)
 *         src/data/postcode-overrides.json       (explicit patch list)
 * Writes  src/data/postcode-index.generated.json (flat, committed, never hand-edited)
 *
 * Usage:  npm run derive:postcodes
 *         npm run derive:postcodes -- --check    (verify, write nothing)
 *
 * ── WHY BUILD-TIME AND NOT MODULE-LOAD ──────────────────────────────────────
 * Measured, not assumed. Deriving at module load would ship the NESTED source
 * (352 KB) to the browser and then pay JSON.parse + derive on every client that
 * opens a form with an address block: 5.5 ms + 1.8 ms on a warm dev desktop,
 * so roughly 20-40 ms of blocked main thread on a mid-range phone. Deriving
 * here ships 296 KB — LESS than the nested source — and costs the browser
 * nothing but the parse it would have paid anyway. Build-time wins on both
 * bytes and time, so there is no trade to weigh.
 *
 * ── WHY THE INTERNED SHAPE ──────────────────────────────────────────────────
 * Three shapes were measured on the real file:
 *
 *     nested source (what we would ship if the component read it)   352.0 KB
 *     verbose  postcode -> [{ name, district, province }]           925.6 KB
 *     interned dictionaries + [name, districtIdx, provinceIdx]      296.2 KB
 *
 * The verbose shape is the obvious one and it is nearly THREE TIMES the size,
 * because it repeats each of the 928 district names and 77 province names once
 * per subdistrict — 7,436 times over. The dictionaries below cost two small
 * arrays and one array-index each; resolving them at read time is a property
 * access on a handful of rows per postcode.
 *
 * ── THE OUTPUT IS COMMITTED, AND A TEST PINS IT ─────────────────────────────
 * The generated file is in git so `next build` needs no codegen step and CI
 * needs no ordering rule. That trades one hazard in: a stale commit. `--check`
 * re-derives and compares, and a test runs it, so editing the source without
 * regenerating reddens rather than shipping a silently old index.
 *
 * Output is DETERMINISTIC — keys sorted, no timestamp, no version stamp — or
 * `--check` would fail on every run and the staleness guard would be noise.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'src', 'data');

const SOURCE_PATH    = join(DATA_DIR, 'thailand_postcode_2026.json');
const OVERRIDES_PATH = join(DATA_DIR, 'postcode-overrides.json');
const OUTPUT_PATH    = join(DATA_DIR, 'postcode-index.generated.json');

const POSTCODE_RE = /^\d{5}$/;

/**
 * Build the interned index from the nested source plus the patch list.
 *
 * Exported so the test can derive in-memory and compare against the committed
 * file without shelling out or writing anything.
 *
 * @returns {{ index: object, warnings: string[], stats: object }}
 */
export function derivePostcodeIndex(source, overrides) {
  const provinces = [];
  const districts = [];
  const provinceIdx = new Map();
  const districtIdx = new Map();
  const byPostcode = {};
  const warnings = [];

  const internProvince = (name) => {
    if (!provinceIdx.has(name)) { provinceIdx.set(name, provinces.length); provinces.push(name); }
    return provinceIdx.get(name);
  };
  const internDistrict = (name) => {
    if (!districtIdx.has(name)) { districtIdx.set(name, districts.length); districts.push(name); }
    return districtIdx.get(name);
  };

  const add = (postcode, subDistrict, district, province, origin) => {
    if (!POSTCODE_RE.test(postcode)) {
      warnings.push(`${origin}: postcode ${JSON.stringify(postcode)} is not five digits — skipped`);
      return false;
    }
    const rows = (byPostcode[postcode] ??= []);
    // A duplicate is a real signal (the same tambon reached twice), not noise to
    // dedupe silently — but an override re-stating a row the source already has
    // is harmless, so it is reported rather than treated as an error.
    if (rows.some((r) => r[0] === subDistrict && districts[r[1]] === district)) {
      warnings.push(`${origin}: ${subDistrict} / ${district} already present under ${postcode} — skipped`);
      return false;
    }
    rows.push([subDistrict, internDistrict(district), internProvince(province)]);
    return true;
  };

  // ── The nested source ─────────────────────────────────────────────────────
  let subdistrictCount = 0;
  let districtInstances = 0;
  for (const [province, districtMap] of Object.entries(source)) {
    if (!districtMap || typeof districtMap !== 'object') {
      warnings.push(`source: province ${province} holds ${JSON.stringify(districtMap)} — skipped`);
      continue;
    }
    for (const [district, subMap] of Object.entries(districtMap)) {
      if (!subMap || typeof subMap !== 'object') {
        warnings.push(`source: district ${province}/${district} holds ${JSON.stringify(subMap)} — skipped`);
        continue;
      }
      districtInstances += 1;
      for (const [subDistrict, postcode] of Object.entries(subMap)) {
        subdistrictCount += 1;
        add(String(postcode), subDistrict, district, province, `source ${province}/${district}`);
      }
    }
  }

  // ── The patch list ────────────────────────────────────────────────────────
  // An entry applies only when postcode, district and province are ALL present.
  // Anything else is UNRESOLVED: reported, skipped, and explicitly not an error.
  // `candidate` is documentation and is never read here — see the file's _readme.
  let applied = 0;
  const unresolved = [];
  for (const entry of overrides?.additions ?? []) {
    const { subDistrict, district, province, postcode } = entry;
    if (!postcode || !district || !province) {
      unresolved.push(entry);
      continue;
    }
    if (add(String(postcode), subDistrict, district, province, `override ${subDistrict}`)) applied += 1;
  }

  // Sorted for determinism — `--check` compares bytes.
  const sortedPostcodes = Object.keys(byPostcode).sort();
  const sorted = {};
  for (const code of sortedPostcodes) sorted[code] = byPostcode[code];

  const index = { provinces, districts, byPostcode: sorted };

  // ── Census, for the report ────────────────────────────────────────────────
  let multiDistrict = 0;
  let multiProvince = 0;
  for (const rows of Object.values(sorted)) {
    if (new Set(rows.map((r) => r[1])).size > 1) multiDistrict += 1;
    if (new Set(rows.map((r) => r[2])).size > 1) multiProvince += 1;
  }

  return {
    index,
    warnings,
    stats: {
      provinces: provinces.length,
      districts: districts.length,
      districtInstances,
      subdistrictsRead: subdistrictCount,
      postcodes: sortedPostcodes.length,
      overridesApplied: applied,
      overridesUnresolved: unresolved,
      multiDistrict,
      multiProvince,
    },
  };
}

/** Deterministic serialisation, used by both the writer and `--check`. */
export function serialiseIndex(index) {
  return `${JSON.stringify(index, null, 0)}\n`;
}

/**
 * Compare ignoring line endings — and this is a correctness fix, not laziness.
 *
 * `.gitattributes` marks `*.json text` and this machine has core.autocrlf=true,
 * so the COMMITTED index checks out with CRLF while this script writes LF. A
 * byte comparison therefore reports "stale" on every fresh clone on Windows,
 * for a file nobody touched — the guard would cry wolf until someone disabled
 * it, which is worse than not having it.
 *
 * The payload is a single line, so this only ever normalises the trailing
 * newline. It cannot mask a real difference: any actual content change alters
 * the JSON body, which contains no newlines at all.
 */
function sameContent(a, b) {
  if (a == null || b == null) return false;
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

export function readInputs() {
  return {
    source:    JSON.parse(readFileSync(SOURCE_PATH, 'utf8')),
    overrides: JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')),
  };
}

export const PATHS = { SOURCE_PATH, OVERRIDES_PATH, OUTPUT_PATH };

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const checkOnly = process.argv.includes('--check');
  const { source, overrides } = readInputs();
  const { index, warnings, stats } = derivePostcodeIndex(source, overrides);
  const payload = serialiseIndex(index);

  console.log('');
  console.log('── derive-postcode-index ────────────────────────────────────');
  console.log(`  provinces           : ${stats.provinces}`);
  // DISTINCT NAMES, not (province, district) pairs — the source has 928 pairs
  // and 924 distinct names, because อำเภอเฉลิมพระเกียรติ exists in five
  // provinces and the dictionary is a string pool. Each row still carries its
  // OWN province index, so the pooling cannot merge two real districts.
  console.log(`  district names      : ${stats.districts}  (distinct; ${stats.districtInstances} province/district pairs)`);
  console.log(`  subdistricts read   : ${stats.subdistrictsRead}`);
  console.log(`  postcodes           : ${stats.postcodes}`);
  console.log(`  spanning >1 district: ${stats.multiDistrict}`);
  console.log(`  spanning >1 province: ${stats.multiProvince}`);
  console.log(`  overrides applied   : ${stats.overridesApplied}`);
  console.log(`  output size         : ${(Buffer.byteLength(payload, 'utf8') / 1024).toFixed(1)} KB`);

  if (stats.overridesUnresolved.length) {
    console.log('');
    console.log(`  ⚠ ${stats.overridesUnresolved.length} override(s) UNRESOLVED — not in the index:`);
    for (const e of stats.overridesUnresolved) {
      const missing = ['postcode', 'district', 'province'].filter((k) => !e[k]);
      const cand = e.candidate
        ? ` | candidate (${e.candidate.source}, NOT applied): ${e.candidate.postcode} / ${e.candidate.district}`
        : '';
      console.log(`      ${e.subDistrict} (${e.province ?? '?'}) — missing: ${missing.join(', ')}${cand}`);
    }
    console.log('      These tambons are absent from the index until someone resolves them.');
  }

  if (warnings.length) {
    console.log('');
    console.log(`  ⚠ ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 20)) console.log(`      ${w}`);
    if (warnings.length > 20) console.log(`      … and ${warnings.length - 20} more`);
  }

  if (checkOnly) {
    let current = null;
    try { current = readFileSync(OUTPUT_PATH, 'utf8'); } catch { /* missing */ }
    if (sameContent(current, payload)) {
      console.log('\n  ✓ committed index is up to date.\n');
    } else {
      console.error(`\n  ✖ ${OUTPUT_PATH} is STALE or missing. Run: npm run derive:postcodes\n`);
      process.exit(1);
    }
  } else {
    writeFileSync(OUTPUT_PATH, payload, 'utf8');
    console.log(`\n  ✓ wrote ${OUTPUT_PATH}\n`);
  }
}
