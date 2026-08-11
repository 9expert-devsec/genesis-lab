import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  lookupPostcode,
  isKnownPostcode,
  unambiguousLocation,
  POSTCODE_INDEX_STATS,
} from '@/lib/address/postcodeIndex';
import NESTED from '@/data/thailand_postcode_2026.json';
import DERIVED from '@/data/postcode-index.generated.json';
import {
  derivePostcodeIndex,
  serialiseIndex,
  readInputs,
  PATHS,
} from '../../scripts/derive-postcode-index.mjs';

/**
 * The 296 KB derived index had NO test. This file is that test.
 *
 * ── WHY THIS IS NOT WHAT `npm run check:postcodes` ALREADY DOES ─────────────
 * `--check` re-derives from the source and compares the bytes to the committed
 * file. It answers ONE question: is the committed index stale? It cannot answer
 * whether the derivation is CORRECT, because both sides of its comparison come
 * out of the same `derivePostcodeIndex`. Put an off-by-one in the interning and
 * `--check` confirms the committed file faithfully matches the buggy
 * derivation — green, and wrong. It is a tautology with respect to meaning.
 *
 * So the round-trip below compares the derived index against the NESTED SOURCE
 * instead: two independent readings of the same facts. And the staleness check
 * moves in here too (last test in this file), because a guard that only runs
 * when someone remembers to type an npm script is not a guard — CI runs
 * `npm test`, so that is where it belongs.
 *
 * ── WHAT AN OFF-BY-ONE WOULD DO ─────────────────────────────────────────────
 * The index stores [subDistrictName, districtIdx, provinceIdx] against two
 * string pools. Slip either index by one and a whole province's tambons bind to
 * the wrong district — silently, because every value still resolves to a real
 * Thai place name and nothing looks malformed. That is the SAME defect class
 * this task exists to fix (10110 filling เขตคลองเตย for a แขวง in เขตวัฒนา), so
 * the fix must not reintroduce it by a different route.
 */

/** Every (postcode, subdistrict, district, province) the NESTED source states. */
function triplesFromSource(source) {
  const out = new Set();
  let rows = 0;
  for (const [province, districts] of Object.entries(source)) {
    for (const [district, subs] of Object.entries(districts)) {
      for (const [subDistrict, postcode] of Object.entries(subs)) {
        out.add(`${postcode}␟${subDistrict}␟${district}␟${province}`);
        rows += 1;
      }
    }
  }
  return { set: out, rows };
}

/** The same facts, read back out through the component-facing reader. */
function triplesFromIndex(postcodes) {
  const out = new Set();
  let rows = 0;
  for (const postcode of postcodes) {
    for (const o of lookupPostcode(postcode)) {
      out.add(`${postcode}␟${o.subDistrict}␟${o.district}␟${o.province}`);
      rows += 1;
    }
  }
  return { set: out, rows };
}

const ALL_POSTCODES = Object.keys(DERIVED.byPostcode);

// ── B5: the round trip ──────────────────────────────────────────────────────

test('every postcode in the source survives into the index', () => {
  assert.equal(ALL_POSTCODES.length, 966);
  assert.equal(POSTCODE_INDEX_STATS.postcodes, 966);

  const sourcePostcodes = new Set();
  for (const districts of Object.values(NESTED)) {
    for (const subs of Object.values(districts)) {
      for (const code of Object.values(subs)) sourcePostcodes.add(code);
    }
  }
  assert.deepEqual(
    [...sourcePostcodes].sort(),
    [...ALL_POSTCODES].sort(),
    'the set of postcodes differs between source and index'
  );
});

test('all 966 postcodes round-trip: same triples, same count, nothing added or dropped', () => {
  const src = triplesFromSource(NESTED);
  const idx = triplesFromIndex(ALL_POSTCODES);

  // Count first: a set comparison alone would hide a duplicate row.
  assert.equal(idx.rows, src.rows, 'row COUNT differs between source and index');
  assert.equal(src.rows, 7436, 'the source no longer holds 7,436 subdistrict rows');

  const missing = [...src.set].filter((t) => !idx.set.has(t));
  const added = [...idx.set].filter((t) => !src.set.has(t));

  assert.deepEqual(missing, [], `${missing.length} triple(s) in the source are ABSENT from the index`);
  assert.deepEqual(added, [], `${added.length} triple(s) in the index are NOT in the source`);
  assert.equal(idx.set.size, src.set.size);
});

test('CONTROL: a one-off district index IS caught by the round trip above', () => {
  // Exactly the failure the round trip exists to catch, injected deliberately:
  // shift one row's district pointer by one. Every value still resolves to a
  // real Thai district, so nothing looks malformed — which is the point.
  const [code] = ALL_POSTCODES;
  const [name, districtIdx, provinceIdx] = DERIVED.byPostcode[code][0];
  const corrupted = {
    ...DERIVED,
    byPostcode: {
      ...DERIVED.byPostcode,
      [code]: [[name, (districtIdx + 1) % DERIVED.districts.length, provinceIdx],
        ...DERIVED.byPostcode[code].slice(1)],
    },
  };

  const readCorrupted = (postcode) =>
    (corrupted.byPostcode[postcode] ?? []).map(([sub, di, pi]) => (
      `${postcode}␟${sub}␟${corrupted.districts[di]}␟${corrupted.provinces[pi]}`
    ));

  const src = triplesFromSource(NESTED);
  const drifted = readCorrupted(code).filter((t) => !src.set.has(t));
  assert.equal(drifted.length, 1, 'the corrupted row should NOT match the source — the check has teeth');

  // …and the resolved district really did change, i.e. the corruption is real.
  assert.notEqual(
    corrupted.districts[(districtIdx + 1) % DERIVED.districts.length],
    DERIVED.districts[districtIdx]
  );
});

test('the string pools cannot merge two real districts', () => {
  // อำเภอเฉลิมพระเกียรติ exists in FIVE provinces and is pooled ONCE, which is
  // why the district dictionary holds 924 names for 928 province/district
  // pairs. Each row still carries its own province index; this pins that the
  // pooling is a string optimisation and not a merge.
  const provincesForName = new Map();
  for (const rows of Object.values(DERIVED.byPostcode)) {
    for (const [, di, pi] of rows) {
      const d = DERIVED.districts[di];
      if (d !== 'อำเภอเฉลิมพระเกียรติ') continue;
      if (!provincesForName.has(d)) provincesForName.set(d, new Set());
      provincesForName.get(d).add(DERIVED.provinces[pi]);
    }
  }
  assert.equal(provincesForName.get('อำเภอเฉลิมพระเกียรติ').size, 5);
  assert.equal(DERIVED.districts.length, 924);
  assert.equal(DERIVED.provinces.length, 77);
});

// ── C1: the acceptance test for the whole task ──────────────────────────────

test('C1: 10570 resolves to อำเภอบางเสาธง, สมุทรปราการ — the reported customer', () => {
  const options = lookupPostcode('10570');
  assert.deepEqual(
    options.map((o) => o.subDistrict).sort(),
    ['บางเสาธง', 'ศีรษะจรเข้น้อย', 'ศีรษะจรเข้ใหญ่'].sort()
  );
  for (const o of options) {
    assert.equal(o.district, 'อำเภอบางเสาธง');
    assert.equal(o.province, 'สมุทรปราการ');
  }
  // One district, so it auto-fills on the fifth digit with no choice required.
  assert.deepEqual(unambiguousLocation('10570'), {
    district: 'อำเภอบางเสาธง',
    province: 'สมุทรปราการ',
  });
});

test('C1 control: 10570 is NOT filed under 10540, which is where thai-data put it', () => {
  const under10540 = lookupPostcode('10540').map((o) => o.subDistrict);
  for (const wrong of ['บางเสาธง', 'ศีรษะจรเข้น้อย', 'ศีรษะจรเข้ใหญ่']) {
    assert.ok(!under10540.includes(wrong), `${wrong} is still under 10540`);
  }
});

// ── C2: a multi-district postcode ───────────────────────────────────────────

test('C2: 10110 spans เขตคลองเตย and เขตวัฒนา, and each แขวง keeps its OWN district', () => {
  const options = lookupPostcode('10110');
  const byName = new Map(options.map((o) => [o.subDistrict, o]));

  // The exact pair from the bug report: the old code filled เขตคลองเตย for all
  // six, including the three that are in เขตวัฒนา.
  assert.equal(byName.get('แขวงคลองเตย').district, 'เขตคลองเตย');
  assert.equal(byName.get('แขวงพระโขนงเหนือ').district, 'เขตวัฒนา');
  assert.equal(byName.get('แขวงคลองเตยเหนือ').district, 'เขตวัฒนา');
  assert.equal(byName.get('แขวงคลองตันเหนือ').district, 'เขตวัฒนา');

  for (const o of options) assert.equal(o.province, 'กรุงเทพมหานคร');
  assert.equal(new Set(options.map((o) => o.district)).size, 2);
});

test('C2: picking from the SECOND district does not yield the first', () => {
  const chosen = lookupPostcode('10110').find((o) => o.subDistrict === 'แขวงพระโขนงเหนือ');
  assert.notEqual(chosen.district, 'เขตคลองเตย', 'this is the exact bug: first-district wins');
  assert.equal(chosen.district, 'เขตวัฒนา');
});

// ── C3: a multi-province postcode ───────────────────────────────────────────

test('C3: 13240 spans TWO provinces and each แขวง keeps its own', () => {
  const options = lookupPostcode('13240');
  const byName = new Map(options.map((o) => [o.subDistrict, o]));

  assert.equal(byName.get('บ้านแพรก').province, 'พระนครศรีอยุธยา');
  assert.equal(byName.get('บ้านแพรก').district, 'อำเภอบ้านแพรก');
  assert.equal(byName.get('โก่งธนู').province, 'ลพบุรี');
  assert.equal(byName.get('โก่งธนู').district, 'อำเภอเมืองลพบุรี');

  assert.equal(new Set(options.map((o) => o.province)).size, 2);
});

test('exactly 168 postcodes span >1 district and exactly 11 span >1 province', () => {
  let multiDistrict = 0;
  let multiProvince = 0;
  for (const rows of Object.values(DERIVED.byPostcode)) {
    if (new Set(rows.map((r) => r[1])).size > 1) multiDistrict += 1;
    if (new Set(rows.map((r) => r[2])).size > 1) multiProvince += 1;
  }
  assert.equal(multiDistrict, 168);
  assert.equal(multiProvince, 11);
});

// ── B3: blank beats wrong ───────────────────────────────────────────────────

test('B3: an ambiguous postcode fills NOTHING; an unambiguous one still auto-fills', () => {
  assert.equal(unambiguousLocation('10110'), null, 'multi-district must not guess');
  assert.equal(unambiguousLocation('13240'), null, 'multi-province must not guess');
  assert.deepEqual(unambiguousLocation('10570'), {
    district: 'อำเภอบางเสาธง',
    province: 'สมุทรปราการ',
  });

  const fills = ALL_POSTCODES.filter((c) => unambiguousLocation(c) !== null).length;
  const blanks = ALL_POSTCODES.length - fills;
  assert.equal(fills, 798, 'the auto-fill population moved');
  assert.equal(blanks, 168, 'the blank-until-chosen population moved');
});

// ── absent vs incomplete ────────────────────────────────────────────────────

test('an absent postcode yields no options and is not "known"', () => {
  assert.equal(isKnownPostcode('99999'), false);
  assert.deepEqual(lookupPostcode('99999'), []);
});

test('fewer than five digits is never treated as a lookup', () => {
  for (const partial of ['', '1', '105', '1057']) {
    assert.equal(isKnownPostcode(partial), false);
    assert.deepEqual(lookupPostcode(partial), []);
  }
});

test('every key in this dataset holds at least one subdistrict', () => {
  // thai-data had 24 keys carrying nulls, which is why `miss_route` used to
  // distinguish absent from present-but-empty. Nothing here can be
  // present-but-empty, so that distinction has no second value to report.
  const hollow = ALL_POSTCODES.filter((c) => lookupPostcode(c).length === 0);
  assert.deepEqual(hollow, [], 'a hollow record exists — miss_route needs its second value back');
});

// ── A3 / C4: the override mechanism ─────────────────────────────────────────

test('C4: the five unresolved tambons are ABSENT until someone resolves them', () => {
  const { overrides } = readInputs();
  const unresolved = overrides.additions.filter((e) => !e.postcode || !e.district || !e.province);
  assert.equal(unresolved.length, 5, 'the patch list no longer holds five unresolved entries');

  // None of them leaked in under a guessed postcode — in particular, none was
  // silently taken from the `candidate` block.
  for (const entry of unresolved) {
    const candidate = entry.candidate?.postcode;
    if (!candidate) continue;
    const names = lookupPostcode(candidate).map((o) => o.subDistrict);
    assert.ok(
      !names.includes(entry.subDistrict),
      `${entry.subDistrict} was applied from its thai-data candidate — those are leads, not answers`
    );
  }
});

test('C4: a RESOLVED override does land in the index', () => {
  // Drives the real derivation with one entry completed, so the empty slots are
  // demonstrably a data gap and not a broken mechanism.
  const { source } = readInputs();
  const { index, stats } = derivePostcodeIndex(source, {
    additions: [
      { subDistrict: 'สบโขง', district: 'อำเภออมก๋อย', province: 'เชียงใหม่', postcode: '50310' },
    ],
  });
  assert.equal(stats.overridesApplied, 1);
  assert.equal(stats.overridesUnresolved.length, 0);

  const rows = index.byPostcode['50310'];
  const landed = rows.find(([name]) => name === 'สบโขง');
  assert.ok(landed, 'the resolved override did not reach the index');
  assert.equal(index.districts[landed[1]], 'อำเภออมก๋อย');
  assert.equal(index.provinces[landed[2]], 'เชียงใหม่');
});

// ── B6: staleness, moved out of the npm script and into the suite ───────────

test('B6: the committed index is exactly what the current source derives', () => {
  const { source, overrides } = readInputs();
  const { index } = derivePostcodeIndex(source, overrides);
  const fresh = serialiseIndex(index);
  const committed = readFileSync(PATHS.OUTPUT_PATH, 'utf8');

  // Line endings normalised on both sides: .gitattributes marks *.json `text`
  // and Windows checkouts get CRLF, so a byte compare would fail on a file
  // nobody touched. The payload is one line, so this only touches the trailing
  // newline and cannot mask a content change.
  assert.equal(
    committed.replace(/\r\n/g, '\n'),
    fresh.replace(/\r\n/g, '\n'),
    'postcode-index.generated.json is STALE — run: npm run derive:postcodes'
  );
});
