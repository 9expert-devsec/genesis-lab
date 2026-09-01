import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseObjectives } from '@/app/(public)/[...slug]/_components/CourseObjectives';
import { CourseTarget } from '@/app/(public)/[...slug]/_components/CourseTarget';
import { CoursePrerequisites } from '@/app/(public)/[...slug]/_components/CoursePrerequisites';
import { CourseRequirements } from '@/app/(public)/[...slug]/_components/CourseRequirements';

/**
 * Section 6 is FOUR independent field pairs, not one switch. Each of
 * courseObjectivesRich.test.mjs / courseTargetRich.test.mjs /
 * coursePrerequisitesRich.test.mjs / courseRequirementsRich.test.mjs proves
 * its OWN field's fallback in isolation; this file proves the thing a
 * per-field test cannot: that giving ONE field rich content does not flip
 * the other three off their plain lists, and that a course with no
 * CourseExtension row at all still renders every one of the four plain
 * lists without throwing.
 */

const COURSE = {
  course_name: 'Power BI',
  course_objectives: ['Plain objective'],
  course_target_audience: ['Plain target'],
  course_prerequisites: ['Plain prerequisite'],
  course_system_requirements: ['Plain requirement'],
};

const FIELDS = [
  ['objectivesRich', CourseObjectives, 'Plain objective', 'objective rich'],
  ['targetAudienceRich', CourseTarget, 'Plain target', 'target rich'],
  ['prerequisitesRich', CoursePrerequisites, 'Plain prerequisite', 'prerequisite rich'],
  ['systemRequirementsRich', CourseRequirements, 'Plain requirement', 'requirement rich'],
];

const renderAll = (extension) =>
  FIELDS.map(([, Comp]) =>
    renderToStaticMarkup(createElement(Comp, { course: COURSE, extension }))
  );

test('a course with no CourseExtension row renders all four plain lists and does not throw', () => {
  // Reaching the assertions below at all IS the "does not throw" — an
  // uncaught exception in renderAll would fail this test on its own.
  const htmls = renderAll(null);
  for (const [i, [, , plainText]] of FIELDS.entries()) {
    assert.ok(htmls[i].includes(plainText), `field ${i} (${FIELDS[i][0]}) did not render its plain list`);
    assert.ok(!htmls[i].includes('article-content'), `field ${i} (${FIELDS[i][0]}) rendered a rich body with no extension row`);
  }
});

for (const [richField, , , richMarker] of FIELDS) {
  test(`ONE field rich (${richField}) leaves the other three on their fallback`, () => {
    const extension = { [richField]: `<ul><li>${richMarker}</li></ul>` };
    const htmls = FIELDS.map(([, Comp]) =>
      renderToStaticMarkup(createElement(Comp, { course: COURSE, extension }))
    );

    for (const [i, [field, , plainText]] of FIELDS.entries()) {
      if (field === richField) {
        assert.ok(htmls[i].includes(richMarker), `${field} should render its OWN rich content`);
        assert.ok(!htmls[i].includes(plainText), `${field} should not also render its plain list`);
      } else {
        assert.ok(htmls[i].includes(plainText), `${field} was pushed off its fallback by ${richField} going rich`);
        assert.ok(!htmls[i].includes('article-content'), `${field} rendered a rich body it does not own`);
      }
    }
  });
}

test('ALL FOUR rich still renders each one independently, none leaking into another', () => {
  const extension = {
    objectivesRich: '<ul><li>objective rich</li></ul>',
    targetAudienceRich: '<ul><li>target rich</li></ul>',
    prerequisitesRich: '<ul><li>prerequisite rich</li></ul>',
    systemRequirementsRich: '<ul><li>requirement rich</li></ul>',
  };
  const htmls = renderAll(extension);
  const markers = ['objective rich', 'target rich', 'prerequisite rich', 'requirement rich'];

  for (const [i] of FIELDS.entries()) {
    assert.ok(htmls[i].includes(markers[i]), `field ${i} did not render its own rich content`);
    for (const [j, marker] of markers.entries()) {
      if (j === i) continue;
      assert.ok(!htmls[i].includes(marker), `field ${i} leaked field ${j}'s rich content`);
    }
  }
});
