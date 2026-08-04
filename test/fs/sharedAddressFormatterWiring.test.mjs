import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('CONTROL: the reassembly pattern DOES match the in-house sites', () => {
  // Fired at the two files that legitimately still carry the pattern and are
  // explicitly out of scope. Double duty: it proves THAI_ARRAY_JOIN matches
  // real code — so the four "no longer reassembles" assertions above are not
  // vacuous — and it pins that the in-house flow was left untouched.
  for (const f of [
    'src/components/registration/InhouseForm.jsx',
    'src/app/api/registration/inhouse/route.js',
  ]) {
    assert.ok(THAI_ARRAY_JOIN.test(read(f)), `${f} still hand-rolls the address`);
  }
});

test('CONTROL: the in-house sites did NOT get the shared formatter', () => {
  // Separate feature, separate decision. If this goes red the change leaked.
  for (const f of [
    'src/components/registration/InhouseForm.jsx',
    'src/app/api/registration/inhouse/route.js',
  ]) {
    assert.ok(!read(f).includes('formatBillingAddress'), `${f} is out of scope`);
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

test('CONTROL: formatBillingAddress.js itself was not modified', () => {
  // The instruction was to adopt it, not to change it. Pinning the two branch
  // shapes is enough to catch an edit that "helpfully" reworked the prefixes.
  const src = read('src/lib/address/formatBillingAddress.js');
  assert.match(src, /a\.subDistrict && `แขวง\$\{a\.subDistrict\}`/);
  assert.match(src, /a\.district && `เขต\$\{a\.district\}`/);
  assert.match(src, /a\.subDistrict && `ตำบล\$\{a\.subDistrict\}`/);
  assert.match(src, /a\.district && `อำเภอ\$\{a\.district\}`/);
  assert.match(src, /province && `จังหวัด\$\{province\}`/);
});
