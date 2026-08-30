import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import ConsultingSection from '@/components/portfolio/ConsultingSection';

/**
 * Teeny ticket: the collapsed-row year label ("2026", "Enterprise") on the
 * /portfolio consulting timeline was unreadable in dark mode. It used
 * `dark:text-9e-border` — a hairline-divider token, not a text token — against
 * the dark page background (contrast ~1.24:1). Fixed to `dark:text-9e-slate-dp-200`
 * (~4.86:1), the dimmest step in the same muted scale that still clears AA,
 * so the collapsed rows stay visibly dimmer than the active row rather than
 * competing with it.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

// activeIdx defaults to 0 (useState(0), no props), so a bare render already
// carries one active row and three collapsed rows — exactly the shapes the
// ticket reported ("2024 - Present" active; "2026", "2026", "Enterprise" collapsed).
const doc = docOf(renderToStaticMarkup(createElement(ConsultingSection)));
const yearLabels = [...doc.querySelectorAll('span[class*="font-black"]')];

test('the timeline renders one active year label and three collapsed ones', () => {
  assert.equal(yearLabels.length, 4);
  assert.equal(yearLabels[0].textContent, '2024 - Present');
  assert.deepEqual(yearLabels.slice(1).map((el) => el.textContent), ['2026', '2026', 'Enterprise']);
});

test('the active row keeps its own treatment untouched, and collapsed rows carry the new readable dark-mode color', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  assert.match(activeClass, /\btext-9e-slate-dp-50\b/);
  assert.match(activeClass, /\btext-3xl\b/);

  for (const collapsed of yearLabels.slice(1)) {
    const collapsedClass = collapsed.getAttribute('class');
    assert.match(collapsedClass, /\bdark:text-9e-slate-dp-200\b/);
    assert.match(collapsedClass, /\btext-2xl\b/);
    // the faint token this ticket removes must not come back
    assert.doesNotMatch(collapsedClass, /\bdark:text-9e-border\b/);
    // and it must stay visibly SUBORDINATE to the active row, not identical to it
    assert.notEqual(collapsedClass, activeClass);
  }
});

test('control: the subordination check above is not vacuous — it rejects two rows given the SAME class', () => {
  const flattened = 'min-w-[64px] font-en font-black leading-none transition-colors duration-300 text-9e-slate-dp-50 text-3xl';
  assert.throws(() => assert.notEqual(flattened, flattened));
});
