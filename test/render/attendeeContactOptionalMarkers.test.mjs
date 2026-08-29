import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { AttendeesList } from '@/components/registration/AttendeesList';

/**
 * 5.3 (Nutto ticket 5): the red `*` required-marker is gone from attendee
 * อีเมล/เบอร์โทร, and stays on ชื่อ/นามสกุล. Same Harness pattern as
 * attendeesListOptOut.test.mjs — count 2 so a real AttendeeBlock renders.
 */

function Harness({ defaultValues }) {
  const { control, register, watch, setValue, formState: { errors } } = useForm({ defaultValues });
  return createElement(AttendeesList, { control, register, watch, setValue, errors });
}

// `attendees` must ALREADY hold entries matching attendeesCount: the effect
// that syncs the field array to the count never runs in renderToStaticMarkup
// (no effects run in static rendering at all), so an empty default here would
// render zero AttendeeBlocks regardless of attendeesCount.
const html = renderToStaticMarkup(
  createElement(Harness, {
    defaultValues: {
      coordinator: { firstName: '', lastName: '', email: '', phone: '', isAttending: false },
      attendeesCount: 2,
      attendeesListProvided: true,
      attendees: [
        { firstName: '', lastName: '', email: '', phone: '' },
        { firstName: '', lastName: '', email: '', phone: '' },
      ],
    },
  })
);

/** The <label>…</label> block whose own text starts with `fieldLabel`. */
function labelBlock(out, fieldLabel) {
  const marker = `>${fieldLabel}`;
  const start = out.indexOf(marker);
  assert.notEqual(start, -1, `no label starting with "${fieldLabel}" was found on the page`);
  const openTagStart = out.lastIndexOf('<label', start);
  const closeTagEnd = out.indexOf('</label>', start) + '</label>'.length;
  return out.slice(openTagStart, closeTagEnd);
}

test('อีเมล has no required asterisk on an attendee', () => {
  assert.ok(!labelBlock(html, 'อีเมล').includes('*'), 'the asterisk is still there');
});

test('เบอร์โทร has no required asterisk on an attendee', () => {
  assert.ok(!labelBlock(html, 'เบอร์โทร').includes('*'), 'the asterisk is still there');
});

test('ชื่อ and นามสกุล KEEP their required asterisk on an attendee', () => {
  assert.ok(labelBlock(html, 'ชื่อ').includes('*'), 'firstName lost its asterisk');
  assert.ok(labelBlock(html, 'นามสกุล').includes('*'), 'lastName lost its asterisk');
});

test('CONTROL: the asterisk marker itself is real markup, not a probe that always fails', () => {
  // If `*` could never be found by this probe shape, the two "KEEP" assertions
  // above would be worthless passes for the wrong reason.
  assert.match(labelBlock(html, 'ชื่อ'), /<span[^>]*>\*<\/span>/);
});
