import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PER_SOURCE_PARAMS,
  SOURCE_VALUES,
  filterParamKey,
  isDefaultFilterValue,
  readSourceFilters,
} from '@/lib/registrations/filterScope';
import { buildRegistrationFilter } from '@/lib/registrations/listFilter';

/**
 * EACH SOURCE KEEPS ITS OWN FILTERS. SWITCHING CARRIES NOTHING ACROSS.
 *
 * ══ WHAT THIS TIER CAN PROVE, AND WHAT IT CANNOT ════════════════════════════
 *
 * The mechanism is three pure functions — `filterParamKey`, `readSourceFilters`
 * and `isDefaultFilterValue` — and a URL. All of that is testable here, exactly,
 * against real query strings.
 *
 * `applyNavigate` and `applySwitchSource` below MIRROR the client's two
 * navigators, and they are built out of THE REAL EXPORTED HELPERS rather than
 * re-deriving the prefix. So what is proved here is that the mechanism
 * preserves each side's values; that RegistrationsClient actually uses the
 * mechanism is a different claim, asserted at source in
 * fs/perSourceFilterWiring. Neither file is sufficient alone and both say so.
 *
 * A REAL CLICK on the toggle is a human check — see the round's checklist.
 */

// ── The two navigators, mirrored from the client through the real helpers ────

/** What `navigate` does: write the CURRENT source's namespace. */
function applyNavigate(search, source, values) {
  const params = new URLSearchParams(search);
  for (const [name, v] of Object.entries(values)) {
    const key = filterParamKey(name, source);
    if (v == null || isDefaultFilterValue(name, v)) params.delete(key);
    else params.set(key, String(v));
  }
  return params.toString();
}

/** What `switchSource` does: one key, and nothing else. */
function applySwitchSource(search, value) {
  const params = new URLSearchParams(search);
  if (value === 'public') params.delete('source');
  else params.set('source', value);
  return params.toString();
}

const sp = (search) => Object.fromEntries(new URLSearchParams(search).entries());

// ── 1. Both sets live in the URL at once ────────────────────────────────────

test('public takes the bare names and in-house is prefixed', () => {
  for (const name of PER_SOURCE_PARAMS) {
    assert.equal(filterParamKey(name, 'public'), name);
    assert.equal(filterParamKey(name, 'inhouse'), `inhouse.${name}`);
  }
});

test('a URL carries both sides, and each reads back only its own', () => {
  const search = 'source=inhouse&q=excel&status=paid&inhouse.q=acme&inhouse.status=new';

  assert.equal(readSourceFilters(sp(search), 'public').q, 'excel');
  assert.equal(readSourceFilters(sp(search), 'public').status, 'paid');
  assert.equal(readSourceFilters(sp(search), 'inhouse').q, 'acme');
  assert.equal(readSourceFilters(sp(search), 'inhouse').status, 'new');
});

test('a bare /admin/registrations leaves BOTH sides unfiltered', () => {
  // The settled question: no parameters at all means no filters anywhere, so
  // switching finds nothing left over from a previous visit.
  for (const source of SOURCE_VALUES) {
    // `legacy: ''` is "both kinds" — an imported row and a born-here row are
    // both shown when nobody has asked. It joined PER_SOURCE_PARAMS with the
    // Drupal import; the two real values are 'only' and 'exclude'.
    assert.deepEqual(readSourceFilters({}, source), {
      status: 'all', q: '', range: 'all', from: '', to: '', course: '', page: '1',
      legacy: '',
    });
  }
});

// ── 2. Switching preserves each side, in BOTH directions ────────────────────

test('switching away and back finds what you left — public → in-house → public', () => {
  let search = '';

  // Filter public, then switch to in-house and filter it differently.
  search = applyNavigate(search, 'public', { q: 'excel', status: 'paid', range: 'today' });
  search = applySwitchSource(search, 'inhouse');
  search = applyNavigate(search, 'inhouse', { q: 'acme', status: 'new', range: 'month' });

  // In-house is what was just typed…
  assert.deepEqual(pick(readSourceFilters(sp(search), 'inhouse')), { q: 'acme', status: 'new', range: 'month' });
  // …and public still holds what it was left with.
  assert.deepEqual(pick(readSourceFilters(sp(search), 'public')), { q: 'excel', status: 'paid', range: 'today' });

  // Switch back: public is intact and in-house is untouched.
  search = applySwitchSource(search, 'public');
  assert.deepEqual(pick(readSourceFilters(sp(search), 'public')), { q: 'excel', status: 'paid', range: 'today' });
  assert.deepEqual(pick(readSourceFilters(sp(search), 'inhouse')), { q: 'acme', status: 'new', range: 'month' });
});

test('switching away and back finds what you left — in-house → public → in-house', () => {
  // The OTHER direction, because a namespace bug is easy to make asymmetric:
  // public's keys are bare, so a write that forgot the prefix would pass the
  // test above (it would clobber public, which the test above never re-reads
  // after the in-house write) and fail here.
  let search = 'source=inhouse';

  search = applyNavigate(search, 'inhouse', { q: 'acme', course: 'ZZTEST-EXCEL-01' });
  search = applySwitchSource(search, 'public');
  search = applyNavigate(search, 'public', { q: 'excel', course: 'PBI-101' });

  assert.deepEqual(pick(readSourceFilters(sp(search), 'public'), ['q', 'course']), { q: 'excel', course: 'PBI-101' });
  assert.deepEqual(pick(readSourceFilters(sp(search), 'inhouse'), ['q', 'course']), { q: 'acme', course: 'ZZTEST-EXCEL-01' });

  search = applySwitchSource(search, 'inhouse');
  assert.deepEqual(pick(readSourceFilters(sp(search), 'inhouse'), ['q', 'course']), { q: 'acme', course: 'ZZTEST-EXCEL-01' });
});

test('switching moves NO value — only `source` changes', () => {
  /**
   * The property the whole namespace design was chosen for. Keying on source
   * IDENTITY rather than on active/inactive means a toggle click cannot lose a
   * filter, because no filter is in flight.
   */
  const before = 'q=excel&status=paid&inhouse.q=acme&inhouse.page=3';
  const after  = applySwitchSource(before, 'inhouse');

  const b = sp(before);
  const a = sp(after);
  delete a.source;
  assert.deepEqual(a, b, 'a value moved during a source switch');
});

test('every per-source parameter is independent, one at a time', () => {
  // Not just `q`: the leak this round fixes applied to every filter, and a
  // partial namespace is the likely half-done version of this change.
  for (const name of PER_SOURCE_PARAMS) {
    const value = name === 'page' ? '4' : 'AAA';
    const search = applyNavigate('', 'inhouse', { [name]: value });
    assert.equal(readSourceFilters(sp(search), 'inhouse')[name], value, `${name} did not survive`);
    assert.notEqual(readSourceFilters(sp(search), 'public')[name], value,
      `${name} leaked from in-house into public`);
  }
});

// ── 3. Neither side's value reaches the other side's QUERY ──────────────────

test("one side's term never reaches the other side's Mongo filter", () => {
  /**
   * The end of the chain, and the claim that actually matters: not merely that
   * the URL keeps two values, but that the two values produce two queries.
   *
   * Both filters are built from the SAME URL, each from its own namespace, which
   * is exactly what page.jsx does.
   */
  const search = 'source=inhouse&q=excel&inhouse.q=acme';
  const state = sp(search);

  const publicFilter  = buildRegistrationFilter({ source: 'public',  ...readSourceFilters(state, 'public') });
  const inhouseFilter = buildRegistrationFilter({ source: 'inhouse', ...readSourceFilters(state, 'inhouse') });

  const terms = (f) => (f.$or ?? []).map((c) => Object.values(c)[0]?.$regex).filter(Boolean);
  assert.deepEqual([...new Set(terms(publicFilter))], ['excel']);
  assert.deepEqual([...new Set(terms(inhouseFilter))], ['acme']);
});

// ── 4. Degrading, per source, at the BUILDER — round 2's two-layer rule ─────

test('an unknown value degrades to unfiltered PER SOURCE, at the builder', () => {
  /**
   * ── WHY THIS IS ASSERTED AT THE BUILDER AND NOT ONLY AT THE PAGE ─────────
   * `listRegistrations` is a `'use server'` export and therefore a POST endpoint
   * that need not pass through page.jsx at all. Round 2 established that both
   * layers degrade independently for exactly that reason — the page normalises
   * so the CHROME agrees with the rows, and the builder degrades so the QUERY is
   * safe when there is no chrome.
   *
   * Per source, because the two vocabularies are different subsets: `paid` is
   * public-only, and an in-house query for it must show everything rather than
   * nothing.
   */
  const retired = buildRegistrationFilter({ status: 'closed-won', source: 'inhouse' });
  assert.equal('status' in retired, false, 'a retired in-house status filtered to an empty list');

  const wrongSide = buildRegistrationFilter({ status: 'paid', source: 'inhouse' });
  assert.equal('status' in wrongSide, false, 'a public-only status filtered in-house to an empty list');

  // …and the SAME value on its own side is honoured, so the test above is not
  // passing because the builder ignores status entirely.
  const honoured = buildRegistrationFilter({ status: 'paid', source: 'public' });
  assert.deepEqual(honoured.status, { $in: ['paid'] });

  // An unparseable date and an unknown range degrade the same way, per source.
  for (const source of SOURCE_VALUES) {
    assert.equal('createdAt' in buildRegistrationFilter({ range: 'fortnight', source }), false);
    assert.equal('createdAt' in buildRegistrationFilter({ from: 'not-a-date', source }), false);
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the mirrored navigators really would carry a value across', () => {
  /**
   * Every preservation test above passes trivially if `applyNavigate` writes
   * nothing. So: the UNNAMESPACED writer — which is what shipped before this
   * round — is built here and shown to produce the defect.
   */
  const naive = (search, values) => {
    const params = new URLSearchParams(search);
    for (const [k, v] of Object.entries(values)) {
      if (v === '' || v == null) params.delete(k);
      else params.set(k, String(v));
    }
    return params.toString();
  };

  let search = naive('', { q: 'excel' });          // filter public
  search = applySwitchSource(search, 'inhouse');   // switch
  // THE DEFECT: in-house now reads public's term, because there is one `q`.
  assert.equal(sp(search).q, 'excel');
  assert.equal(new URLSearchParams(search).has('inhouse.q'), false);

  // And the real writer does not do that.
  const namespaced = applyNavigate(applySwitchSource(applyNavigate('', 'public', { q: 'excel' }), 'inhouse'),
    'inhouse', { q: 'acme' });
  assert.equal(readSourceFilters(sp(namespaced), 'inhouse').q, 'acme');
  assert.equal(readSourceFilters(sp(namespaced), 'public').q, 'excel');
});

test('CONTROL: the enumeration is real, and defaults are genuinely absent', () => {
  assert.ok(PER_SOURCE_PARAMS.length >= 7, `only ${PER_SOURCE_PARAMS.length} per-source parameters`);
  assert.ok(!PER_SOURCE_PARAMS.includes('source'),
    '`source` is in the per-source list — it selects the namespace and cannot live inside one');

  // A default value is deleted, not written as an empty key — otherwise the
  // "switching moves no value" test would compare two differently-padded URLs
  // and pass for the wrong reason.
  assert.equal(applyNavigate('q=x', 'public', { q: '' }), '');
  assert.equal(applyNavigate('inhouse.status=new', 'inhouse', { status: 'all' }), '');
  assert.equal(applyNavigate('inhouse.page=3', 'inhouse', { page: '1' }), '');
});

/** Just the keys under test, so a failure prints the three that matter. */
function pick(filters, names = ['q', 'status', 'range']) {
  return Object.fromEntries(names.map((n) => [n, filters[n]]));
}
