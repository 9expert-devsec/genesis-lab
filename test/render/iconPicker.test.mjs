import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as LucideIcons from 'lucide-react';

import { ICON_NAMES, isKnownIconName, lucideIcon } from '@/lib/pageBuilder/lucideIcon';
import {
  IconPickerBody, iconResults, matchesIconQuery, ICON_RESULT_CAP,
} from '@/components/pageBuilder/editor/IconPicker';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { readSource } from '../sourceScan.mjs';

/**
 * The icon picker, and the one property it must never lose: that what it OFFERS
 * and what `isKnownIconName` ACCEPTS are the same set.
 *
 * ── WHY THAT IS THE LOAD-BEARING CLAIM ─────────────────────────────────────
 * The picker exists so an author stops typing a PascalCase name from memory and
 * finding out it was wrong afterwards. It only delivers that if every name it
 * shows survives the validator — offer one the validator rejects and the author
 * has been walked into the failure by the tool that was supposed to prevent it.
 * The reverse gap is quieter but real too: a name the validator accepts and the
 * picker cannot reach is an icon nobody can choose without hand-editing JSON.
 *
 * `ICON_NAMES` is built by filtering the module's own exports THROUGH
 * `isKnownIconName`, so equality holds by construction. It is still asserted in
 * both directions, because "by construction" describes today's code and this
 * file's job is to notice when that stops being how it is built.
 *
 * ── WHAT THIS TIER CANNOT DO ───────────────────────────────────────────────
 * `IconPicker` puts its contents inside a Radix Dialog.Portal, which renders
 * nothing under renderToStaticMarkup (rounds 5/6/9). So the portal-free
 * `IconPickerBody` is what is rendered here, exactly as SectionPickerBody is —
 * and what is NOT proven is that the trigger opens the dialog, which stays a
 * source-level claim.
 */

const SRC = 'src/components/pageBuilder/editor/SectionContentEditor.jsx';

function bodyDoc({ query = '', value = '' } = {}) {
  return new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(IconPickerBody, {
    query, value, onQueryChange: () => {}, onPick: () => {}, onClear: () => {},
  }))}</body>`).window.document;
}

const offered = (doc) => [...doc.querySelectorAll('[data-testid="icon-option"]')]
  .map((b) => b.getAttribute('data-icon'));

// ── 1. the two sets are the same set ───────────────────────────────────────

test('every name the picker can enumerate is accepted by isKnownIconName', () => {
  const rejected = ICON_NAMES.filter((n) => !isKnownIconName(n));
  assert.deepEqual(rejected, [],
    `The picker offers ${rejected.length} name(s) the validator rejects, e.g. `
    + `${rejected.slice(0, 5).join(', ')}. Choosing one would store a value that immediately `
    + 'warns — the picker would be walking the author into the error it exists to prevent.');
});

test('every name isKnownIconName accepts is reachable in the picker', () => {
  /**
   * The other direction, computed from the module's exports rather than from
   * ICON_NAMES — deriving both sides from the same array would make this
   * assertion a tautology instead of a check.
   */
  const acceptedByValidator = Object.keys(LucideIcons).filter(isKnownIconName);
  const offeredSet = new Set(ICON_NAMES);
  const unreachable = acceptedByValidator.filter((n) => !offeredSet.has(n));
  assert.deepEqual(unreachable, [],
    `${unreachable.length} valid icon name(s) cannot be chosen in the picker, e.g. `
    + `${unreachable.slice(0, 5).join(', ')}. They are only settable by hand-editing.`);
  // Exact set equality, both directions, in one statement.
  assert.deepEqual([...ICON_NAMES].sort(), acceptedByValidator.sort());
});

test('the sets are not vacuously equal — both are large and hold known icons', () => {
  // `[] === []` would satisfy both directions above.
  assert.ok(ICON_NAMES.length > 1000, `ICON_NAMES holds only ${ICON_NAMES.length} names`);
  for (const known of ['Rocket', 'Users', 'ShieldCheck']) {
    assert.ok(ICON_NAMES.includes(known), `${known} is missing from the enumerated list`);
    assert.ok(isKnownIconName(known));
  }
  // …and the non-icon exports the validator screens out are in NEITHER set.
  for (const helper of ['createLucideIcon', 'icons', 'default']) {
    assert.equal(ICON_NAMES.includes(helper), false, `${helper} leaked into the picker`);
    assert.equal(isKnownIconName(helper), false);
  }
});

test('CONTROL: the equality check CATCHES a divergence added to either side', () => {
  /**
   * Discrimination. The comparison the two tests above make, run over a list
   * with one extra name and over one with a name removed, must come out the
   * other way — otherwise those tests would pass on any pair of lists.
   */
  const validator = Object.keys(LucideIcons).filter(isKnownIconName);

  // A curated list that gained a name the validator does not accept.
  const withExtra = [...ICON_NAMES, 'NotAnIcon_zz'];
  assert.notDeepEqual([...withExtra].sort(), [...validator].sort());
  assert.deepEqual(withExtra.filter((n) => !isKnownIconName(n)), ['NotAnIcon_zz']);

  // A curated list that dropped one the validator accepts.
  const withMissing = ICON_NAMES.filter((n) => n !== 'Rocket');
  assert.notDeepEqual([...withMissing].sort(), [...validator].sort());
  const set = new Set(withMissing);
  assert.deepEqual(validator.filter((n) => !set.has(n)), ['Rocket']);
});

test('the list is derived by CALLING the validator, not by restating the rule', () => {
  /**
   * The structural half. The assertions above compare two sets today; this is
   * what stops them being satisfied tomorrow by a second hand-maintained copy
   * that happens to match at the moment it is written.
   */
  const lib = readSource('src/lib/pageBuilder/lucideIcon.js').code;
  assert.match(lib, /export const ICON_NAMES = Object\.freeze\(Object\.keys\(LucideIcons\)\.filter\(isKnownIconName\)\)/,
    'ICON_NAMES is no longer Object.keys filtered THROUGH isKnownIconName. However it is '
    + 'built now, it is a second definition of "which names are valid" and will drift.');
});

// ── 2. search, and the cap ─────────────────────────────────────────────────

test('search narrows to exactly the names containing the query, case-insensitively', () => {
  const q = 'rocket';
  const expected = ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  assert.ok(expected.length > 0 && expected.length < ICON_RESULT_CAP, 'fixture query is unsuitable');
  assert.deepEqual(offered(bodyDoc({ query: q })), expected);
  // Same answer whatever the case of the query.
  assert.deepEqual(offered(bodyDoc({ query: 'ROCKET' })), expected);
  assert.deepEqual(offered(bodyDoc({ query: 'Rocket' })), expected);
});

test('a query matching nothing offers nothing, and says so', () => {
  const doc = bodyDoc({ query: 'zzzznotaniconzzzz' });
  assert.deepEqual(offered(doc), []);
  assert.equal(
    doc.querySelector('[data-testid="icon-picker-count"]').textContent.trim(),
    'ไม่พบไอคอนที่ตรงกับคำค้นหา',
  );
});

test('CONTROL: the empty result is reachable only through the query', () => {
  // Same component, one prop apart, opposite answers — otherwise the assertion
  // above would pass on a body that rendered no options at all.
  assert.equal(offered(bodyDoc({ query: 'zzzznotaniconzzzz' })).length, 0);
  assert.ok(offered(bodyDoc({ query: '' })).length > 0);
});

test('the cap draws at most ICON_RESULT_CAP options and COUNTS the rest rather than hiding them', () => {
  /**
   * Silent truncation would read as "these are all the icons" — the author
   * would conclude their icon does not exist. The count comes from the full
   * match list, so the message is true.
   */
  const doc = bodyDoc({ query: '' });
  const drawn = offered(doc);
  assert.equal(drawn.length, ICON_RESULT_CAP, 'the unfiltered view is not capped');
  assert.ok(ICON_NAMES.length > ICON_RESULT_CAP, 'fixture assumption broken: nothing is being held back');
  assert.equal(
    doc.querySelector('[data-testid="icon-picker-count"]').textContent.trim(),
    `แสดง ${ICON_RESULT_CAP} จาก ${ICON_NAMES.length} ไอคอน — พิมพ์เพิ่มเพื่อค้นหาให้แคบลง`,
  );
});

test('iconResults reports the FULL match count, not the drawn count', () => {
  const { total, shown } = iconResults('');
  assert.equal(total, ICON_NAMES.length);
  assert.equal(shown.length, ICON_RESULT_CAP);
  // A narrow query is drawn whole, and then total === shown.
  const narrow = iconResults('rocket');
  assert.equal(narrow.total, narrow.shown.length);
  assert.ok(narrow.total > 0);
});

test('matchesIconQuery ignores surrounding whitespace and empty queries match everything', () => {
  assert.equal(matchesIconQuery('Rocket', ''), true);
  assert.equal(matchesIconQuery('Rocket', '   '), true);
  assert.equal(matchesIconQuery('Rocket', ' rock '), true);
  assert.equal(matchesIconQuery('Rocket', 'ket'), true, 'matching is substring, not prefix');
  assert.equal(matchesIconQuery('Rocket', 'zzz'), false);
});

test('every option the picker draws actually resolves to a component', () => {
  // The glyph is the point of the picker; a name that draws no icon is a blank
  // tile the author cannot tell from a working one.
  for (const name of iconResults('rocket').shown) {
    assert.ok(lucideIcon(name), `${name} is offered but resolves to no component`);
  }
});

// ── 3. the stored value is still judged the old way ────────────────────────

test('a stored-but-INVALID icon name still produces the existing warning', () => {
  /**
   * The picker changes how a name is chosen, not how a stored one is judged. A
   * value from an older save, an import, or a lucide rename must still warn —
   * exact text, because Thai qualifies by prefix and a substring check here
   * would match other warnings in the same panel.
   */
  for (const type of ['stat_card', 'icon_card']) {
    const doc = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(SectionContentEditor, {
      type, content: { icon: 'NotAnIcon_zz', value: '1', label: 'x', title: 't', description: 'd' },
      patch: () => {}, advanced: {}, resolved: null,
    }))}</body>`).window.document;
    const warnings = [...doc.querySelectorAll('p')].map((p) => p.textContent.trim());
    assert.ok(
      warnings.includes('ไม่รู้จักไอคอนชื่อนี้ — การ์ดจะแสดงโดยไม่มีไอคอน'),
      `${type}: the unknown-icon warning is gone after the picker change`,
    );
  }
});

test('CONTROL: that warning is ABSENT for a valid name and for no name at all', () => {
  // Otherwise the assertion above would pass on an editor that always warns.
  const warn = 'ไม่รู้จักไอคอนชื่อนี้ — การ์ดจะแสดงโดยไม่มีไอคอน';
  for (const icon of ['Rocket', '']) {
    const doc = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(SectionContentEditor, {
      type: 'stat_card', content: { icon, value: '1', label: 'x' },
      patch: () => {}, advanced: {}, resolved: null,
    }))}</body>`).window.document;
    const warnings = [...doc.querySelectorAll('p')].map((p) => p.textContent.trim());
    assert.equal(warnings.includes(warn), false, `a card with icon="${icon}" warned about it`);
  }
});

test('the trigger shows the stored name even when it is invalid, so the warning has a subject', () => {
  // A control that displayed a placeholder over a bad stored value would hide
  // the very thing the warning underneath is about.
  const doc = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(SectionContentEditor, {
    type: 'icon_card', content: { icon: 'NotAnIcon_zz', title: 't' },
    patch: () => {}, advanced: {}, resolved: null,
  }))}</body>`).window.document;
  const trigger = doc.querySelector('[data-testid="icon-picker-trigger"]');
  assert.ok(trigger, 'the icon field is no longer a picker trigger');
  assert.ok(trigger.textContent.includes('NotAnIcon_zz'), 'the stored value is not shown');
  assert.equal(trigger.getAttribute('aria-invalid'), 'true', 'the trigger is not marked invalid');
});

test('both card editors use the picker, and neither still takes a typed icon name', () => {
  const code = readSource(SRC).code;
  const pickers = code.split('<IconPicker value={content?.icon}').length - 1;
  assert.equal(pickers, 2, 'expected exactly two icon fields (stat_card and icon_card) on the picker');
  assert.equal(code.includes('<TextInput value={content?.icon}'), false,
    'an icon field is still a free-text input — the author can still type a name that does '
    + 'not exist, which is what this round removed');
});
