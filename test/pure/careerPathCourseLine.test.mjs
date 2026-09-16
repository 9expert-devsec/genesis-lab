import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerPathCourseLine } from '@/lib/chat/careerPathCourseLine';

/**
 * The career-path chat card's courses line: "<count> หลักสูตร: A, B, C" with
 * the first three names, "และอีก n หลักสูตร" for the rest, nothing at all
 * for an empty path. Pure; no clock, no env.
 */

const course = (i) => ({ code: `C-${i}`, name: `Course ${i}` });
const item = (n, over = {}) => ({ courses: Array.from({ length: n }, (_, i) => course(i + 1)), course_count: n, ...over });

test('0 courses → null (the card omits the line)', () => {
  assert.equal(careerPathCourseLine(item(0)), null);
  assert.equal(careerPathCourseLine({ courses: [], course_count: 0 }), null);
  assert.equal(careerPathCourseLine({}), null);
  assert.equal(careerPathCourseLine(null), null);
});

test('3 courses → all three names, no "และอีก"', () => {
  assert.equal(careerPathCourseLine(item(3)), '3 หลักสูตร: Course 1, Course 2, Course 3');
});

test('6 courses → the first three names and "และอีก 3 หลักสูตร"', () => {
  assert.equal(careerPathCourseLine(item(6)), '6 หลักสูตร: Course 1, Course 2, Course 3 และอีก 3 หลักสูตร');
});

test('1, 2, 4 and 5 courses — the boundary on each side of three', () => {
  assert.equal(careerPathCourseLine(item(1)), '1 หลักสูตร: Course 1');
  assert.equal(careerPathCourseLine(item(2)), '2 หลักสูตร: Course 1, Course 2');
  assert.equal(careerPathCourseLine(item(4)), '4 หลักสูตร: Course 1, Course 2, Course 3 และอีก 1 หลักสูตร');
  assert.equal(careerPathCourseLine(item(5)), '5 หลักสูตร: Course 1, Course 2, Course 3 และอีก 2 หลักสูตร');
});

test('the live Prompt Engineer path reads as the widget will show it', () => {
  const live = {
    courses: [
      { code: 'PYTHON-L1', name: 'Python Programming' }, { code: 'PYTHON-L2', name: 'Machine Learning using Python' },
      { code: 'GEN-AI-L1', name: 'Generative AI for Business Transformation' }, { code: 'COPILOT-STU', name: 'AI Agents with Microsoft Copilot Studio' },
      { code: 'N8N-L1', name: 'Workflow Automation with n8n' },
    ],
    course_count: 5,
  };
  assert.equal(careerPathCourseLine(live), '5 หลักสูตร: Python Programming, Machine Learning using Python, Generative AI for Business Transformation และอีก 2 หลักสูตร');
});

test('course_count is the count the line states; names come from courses — a name-less entry falls back to its code, whitespace collapses', () => {
  assert.equal(careerPathCourseLine({ courses: [{ code: 'MSE-L1', name: '  ' }, { name: ' Power  BI ' }], course_count: 2 }), '2 หลักสูตร: MSE-L1, Power BI');
  // course_count missing → the array length is the count
  assert.equal(careerPathCourseLine({ courses: [course(1), course(2), course(3), course(4)] }), '4 หลักสูตร: Course 1, Course 2, Course 3 และอีก 1 หลักสูตร');
  // a count with no names at all still states the number
  assert.equal(careerPathCourseLine({ courses: [], course_count: 4 }), '4 หลักสูตร');
});
