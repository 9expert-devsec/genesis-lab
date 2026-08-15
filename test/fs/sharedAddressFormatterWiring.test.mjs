import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubSource } from '../sourceScan.mjs';

/**
 * All four public-registration address sites must go through the shared
 * formatter. Two of them (buildInvoiceDisplay, InvoiceView) are pinned
 * behaviourally elsewhere; the other two cannot be: the API route imports
 * next/headers + a live dbConnect, and RegistrationDetailClient's read view is
 * a non-exported inner component of a large admin client. Source-level is the
 * only guard available for those, so all four are pinned here uniformly.
 *
 * ANCHORED ON THE CALL, not on the absence of a bracket. Three of these files
 * still contain legitimate array joins — the international address row, an
 * EMPTY_THAI_ADDR literal, a failure-reason join — so a blanket "no .join(" or
 * "no subDistrict" guard would either be vacuous or red for the wrong reason.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const SITES = [
  { file: 'src/app/api/registration/public/route.js', arg: 'data.invoice', quote: "'" },
  { file: 'src/lib/registration/build-public.js', arg: 'data.invoice', quote: "'" },
  { file: 'src/components/registration/PreviewRows.jsx', arg: 'invoice', quote: '"' },
  { file: 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx', arg: 'invoice', quote: "'" },
];

/**
 * The reassembly pattern: an array literal that lists subDistrict and then
 * province, fed into a .join(). This is what replaced the formatter at each
 * site. `[^[\]]*` keeps it to one flat array so an unrelated nested literal
 * cannot bridge two separate expressions into a false match.
 */
const THAI_ARRAY_JOIN = /\[[^[\]]*\bsubDistrict\b[^[\]]*\bprovince\b[^[\]]*\][\s\S]{0,60}?\.join\(/;

/**
 * The in-house sites, brought into the shared formatter this round. They were
 * previously pinned OUT of it by two controls below, which are reversed rather
 * than deleted so the change of decision stays on the record.
 */
const INHOUSE_SITES = [
  'src/components/registration/InhouseForm.jsx',
  'src/app/api/registration/inhouse/route.js',
];

for (const { file, arg, quote } of SITES) {
  const src = read(file);

  test(`${file} imports the shared formatter`, () => {
    assert.ok(
      src.includes(`import { formatBillingAddress } from ${quote}@/lib/address/formatBillingAddress${quote}`),
      'imported from the shared module'
    );
  });

  test(`${file} calls formatBillingAddress with the whole invoice`, () => {
    assert.ok(src.includes(`formatBillingAddress(${arg})`), `calls formatBillingAddress(${arg})`);
  });

  test(`${file} never passes thaiAddress alone to the formatter`, () => {
    // The formatter reads invoice.country to choose its branch. Handing it
    // invoice.thaiAddress would take the Thai path for a foreign address and
    // return '' — silently, with no error anywhere.
    assert.ok(
      !/formatBillingAddress\(\s*[\w.?]*\.(thaiAddress|internationalAddress)/.test(src),
      'the argument must be the invoice, not an address sub-object'
    );
  });

  test(`${file} no longer reassembles the Thai address inline`, () => {
    assert.ok(!THAI_ARRAY_JOIN.test(src), 'no [.. subDistrict .. province ..].join( remains');
  });
}

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: THAI_ARRAY_JOIN matches the reassembly it exists to catch', () => {
  /**
   * FIRED AT A SYNTHETIC FIXTURE, NOT AT A REAL FILE — and that is the point.
   *
   * This control used to fire at InhouseForm.jsx and inhouse/route.js, on the
   * grounds that they legitimately still hand-rolled the address. It was doing
   * double duty: proving THAI_ARRAY_JOIN matches real code (so the four "no
   * longer reassembles" assertions above are not vacuous) AND pinning that the
   * in-house flow was out of scope.
   *
   * Both of those expired together. The in-house flow now uses the shared
   * formatter, so there may be NO file left in the repo carrying the pattern —
   * and a control that depends on some other file staying broken dies the day
   * that file is fixed. Which is exactly what happened.
   *
   * The fixture is the pre-migration in-house route body, verbatim, so the
   * subject stays recognisable.
   */
  const reassembly = `
    const quotationAddress = [
      data.thaiAddress?.addressLine,
      data.thaiAddress?.subDistrict,
      data.thaiAddress?.district,
      data.thaiAddress?.province,
      data.thaiAddress?.postalCode,
    ].filter(Boolean).join(' ');`;
  assert.ok(THAI_ARRAY_JOIN.test(reassembly), 'the pattern must match the join it describes');
});

test('CONTROL: THAI_ARRAY_JOIN does NOT match near misses', () => {
  /**
   * The inverse half. Without it a regex of /./ would satisfy the control
   * above, and every "no longer reassembles" assertion would be unfalsifiable.
   *
   * Each of these is one property away from matching: the field order reversed
   * (the pattern is anchored on subDistrict BEFORE province), an object literal
   * rather than an array fed to a join, the two names split across separate
   * arrays, and an array with no join at all.
   */
  const nearMisses = [
    "[a.province, a.subDistrict].filter(Boolean).join(' ')",
    "const EMPTY = { addressLine: '', subDistrict: '', district: '', province: '' };",
    "[x.subDistrict].concat([x.province]).join(' ')",
    '[a.addressLine, a.subDistrict, a.district, a.province, a.postalCode]',
  ];
  for (const s of nearMisses) {
    assert.equal(THAI_ARRAY_JOIN.test(s), false, `false positive on: ${s}`);
  }
});

test('CONTROL: the in-house sites DID get the shared formatter', () => {
  /**
   * REVERSED THIS ROUND. This assertion used to read "the in-house sites did
   * NOT get the shared formatter — separate feature, separate decision. If this
   * goes red the change leaked." The decision is reversed: the in-house flow
   * mailed customers `เชียงยืน เมืองอุดรธานี อุดรธานี 41000`, with no prefixes
   * and no way to tell the ตำบล from the อำเภอ, because the prefix rule was
   * reachable only through a function named for invoices.
   *
   * Kept as an assertion rather than deleted, with the polarity flipped: the
   * risk now is a site silently reverting to a hand-rolled join, which is what
   * the pairing with the sweep below catches.
   */
  for (const f of INHOUSE_SITES) {
    assert.ok(
      /formatBillingAddress|formatThaiAddress/.test(read(f)),
      `${f} must reach the prefix rule through src/lib/address`
    );
  }
});

test('the in-house sites no longer reassemble the Thai address inline', () => {
  for (const f of INHOUSE_SITES) {
    assert.ok(!THAI_ARRAY_JOIN.test(read(f)), `${f} still hand-rolls the address`);
  }
});

test('the VENUE sites never route through the billing formatter', () => {
  /**
   * A venue is not a billing address. Round 3 shipped a bug where the billing
   * address rendered under a สถานที่จัดอบรม heading, and the fix was to keep
   * the two apart BY NAME — so the venue calls formatThaiAddress directly.
   * Routing it through formatBillingAddress would produce the right string and
   * put the wrong name back on the call, which is how that bug returns.
   *
   * Anchored on the CALL, not on the import: two of these files legitimately
   * import both, because they render a billing address as well as a venue.
   */
  const VENUE_CALLS = [
    ['src/lib/email/models/inhouseRegistrationModel.js', 'formatThaiAddress(d.onsiteVenue)'],
    ['src/components/registration/InhouseForm.jsx', 'formatThaiAddress(data.onsiteVenue)'],
    ['src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx', 'formatThaiAddress(v)'],
  ];
  for (const [file, call] of VENUE_CALLS) {
    const src = read(file);
    assert.ok(src.includes(call), `${file} must call ${call}`);
    assert.equal(
      /formatBillingAddress\(\s*\{?\s*(country:\s*)?[\w.]*onsiteVenue/i.test(src),
      false,
      `${file} must not send a venue through the billing formatter`
    );
  }
});

test('CONTROL: the pattern does NOT match unrelated joins in the same files', () => {
  // The trap this guard was written around. RegistrationDetailClient contains
  // an international-address join, an EMPTY_THAI_ADDR object literal listing
  // subDistrict, and a failure-reason join — none of which is the Thai
  // reassembly. If THAI_ARRAY_JOIN were loose enough to catch any of them, the
  // per-site assertions would be red right now instead of green.
  const admin = read(SITES[3].file);
  assert.ok(admin.includes("EMPTY_THAI_ADDR = { addressLine: '', subDistrict: ''"), 'the object literal is still there');
  assert.ok(admin.includes(".filter(Boolean).join(' · ')"), 'the failure-reason join is still there');
  assert.ok(/internationalAddress\.line1[\s\S]{0,400}?\.join\(', '\)/.test(admin), 'the international join is still there');
  assert.ok(!THAI_ARRAY_JOIN.test(admin), 'and none of them trips the guard');
});

test('CONTROL: the prefix rule is intact — now in formatThaiAddress', () => {
  /**
   * RE-POINTED THIS ROUND, not weakened. This used to read "formatBillingAddress
   * .js itself was not modified", pinning the five prefix expressions in that
   * file — the instruction then was to adopt the formatter, not change it.
   *
   * The prefix rule has since been EXTRACTED to ./formatThaiAddress so callers
   * holding a bare address (an in-house quotation address, a training venue)
   * can reach it without describing their data as an invoice. The five
   * expressions moved verbatim; the assertions follow them. What they catch is
   * unchanged: an edit that "helpfully" reworked the prefixes.
   */
  const src = read('src/lib/address/formatThaiAddress.js');
  assert.match(src, /a\.subDistrict && `แขวง\$\{a\.subDistrict\}`/);
  assert.match(src, /a\.district && `เขต\$\{a\.district\}`/);
  assert.match(src, /a\.subDistrict && `ตำบล\$\{a\.subDistrict\}`/);
  assert.match(src, /a\.district && `อำเภอ\$\{a\.district\}`/);
  assert.match(src, /province && `จังหวัด\$\{province\}`/);
});

test('CONTROL: formatBillingAddress still owns the invoice shape, and delegates', () => {
  /**
   * The other half of the extraction. Without this, moving the prefixes out
   * and forgetting to call the new function would leave the test above green
   * while every Thai billing address rendered empty.
   */
  const src = read('src/lib/address/formatBillingAddress.js');
  assert.match(src, /formatThaiAddress\(invoice\.thaiAddress\)/, 'delegates its Thai branch');
  assert.match(src, /\(invoice\.country \?\? 'TH'\) === 'OTHER'/, 'still owns the country branch');
  assert.match(src, /\[a\.line1, a\.line2, a\.city, a\.state, a\.postalCode, a\.country\]/, 'still owns the international field order');
  // COMMENTS STRIPPED, per the standing rule in this suite: the docstring here
  // legitimately NAMES the prefixes while explaining where they went, and
  // matching raw text would fail on the explanation rather than on the code.
  assert.equal(
    /แขวง|ตำบล|จังหวัด/.test(scrubSource(src)),
    false,
    'the prefix rule must live in exactly one place'
  );
});
