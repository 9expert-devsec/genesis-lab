import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The short-description input's cap, and the two clamps it is not.
 *
 * ── WHY THE OLD NUMBER WAS WRONG ──────────────────────────────────────────
 * `maxLength={200}` was a genesis-side limit on a field MSDB stores without
 * one. Measured 2026-08-31 across all 80 upstream courses: the stored values
 * run 131 to 686 characters, median 336, and SEVENTY of the 80 already exceed
 * 200. The input was refusing copy that the data it edits is full of — and
 * `maxLength` truncates a paste SILENTLY, so an admin pasting an existing
 * 400-character teaser back into the box lost half of it with no message.
 *
 * ── THE PART THIS FILE EXISTS TO STOP ─────────────────────────────────────
 * Two DISPLAY clamps read the same field downstream: the meta description at
 * slice(0, 160) and the JSON-LD description at slice(0, 300). They are not
 * input caps and must not be dragged along by a future edit that sees three
 * numbers and decides to make them agree. A cap on input and a clamp on
 * display answer different questions, and both are pinned here so the
 * distinction survives.
 */

const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');
const CAP = 800;

test('the teaser input caps at 800', () => {
  // Matched as an ATTRIBUTE, never as a bare number: `200` and `800` appear in
  // Tailwind class names, timings and unrelated props all over this file.
  assert.match(
    FORM.code,
    new RegExp(`maxLength=\\{${CAP}\\}`),
    `the course form no longer carries maxLength={${CAP}}`
  );
});

test('the old 200 cap is gone from the form entirely', () => {
  assert.doesNotMatch(
    FORM.code,
    /maxLength=\{200\}/,
    'a maxLength={200} is back — measured, 70 of 80 stored teasers exceed it'
  );
});

test('CONTROL: the matcher is an attribute match, not a number search', () => {
  // If it searched for a bare `800` this would pass on any file mentioning the
  // number, and the assertion above would prove nothing.
  const decoy = 'className="max-w-[800px] duration-200" rows={2}';
  assert.doesNotMatch(decoy, new RegExp(`maxLength=\\{${CAP}\\}`));
  assert.match('maxLength={800}', new RegExp(`maxLength=\\{${CAP}\\}`));
});

test('the visible hint states the same number the attribute enforces', () => {
  // The two disagreeing is the quiet failure: the label promises one limit and
  // the box enforces another, and the admin only finds out by losing text.
  const hint = FORM.code.match(/hint="สูงสุด (\d+) ตัวอักษร[^"]*"/);
  assert.ok(hint, 'the teaser hint no longer states a character limit');
  assert.equal(Number(hint[1]), CAP, 'the hint and maxLength disagree');
});

test('there is still no zod schema or server-side validator capping this field', () => {
  // The article-form lesson: when a form cap and a schema cap both exist,
  // changing two of three files is a silent no-op — the form saves green and
  // the value is rejected between parse and write. Checked here so that if a
  // validator is ever added, this test names the second place to change.
  const ACTIONS = readSource('src/lib/actions/courses.js');
  assert.doesNotMatch(ACTIONS.code, /course_teaser[\s\S]{0,120}?\.max\(/, 'a zod cap appeared on course_teaser');
  assert.doesNotMatch(ACTIONS.code, /safeParse|z\.object\(/, 'the course write path gained a schema — re-check the cap');
});

test('the DISPLAY clamps are untouched — they are a different concern', () => {
  const PAGE = readSource('src/app/(public)/[...slug]/page.jsx');
  const JSONLD = readSource('src/lib/courses/buildCourseJsonLd.js');
  assert.match(
    PAGE.code,
    /course_teaser\?\.slice\(0,\s*160\)/,
    'the meta-description clamp moved; it is deliberate and not an input cap'
  );
  assert.match(
    JSONLD.code,
    /course_teaser\?\.slice\(0,\s*300\)/,
    'the JSON-LD clamp moved; same reasoning'
  );
});

test('CONTROL: the three numbers are genuinely different, so "make them agree" is a real risk', () => {
  // Stated as a test so the next reader sees the divergence is intended rather
  // than an oversight waiting to be tidied up.
  assert.notEqual(CAP, 160);
  assert.notEqual(CAP, 300);
  assert.notEqual(160, 300);
});
