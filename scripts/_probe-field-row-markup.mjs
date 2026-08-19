/**
 * What does one card's field list actually EMIT after round 7?
 *
 * Read before writing the assertions, so the guards are pointed at the markup
 * that exists rather than at the markup I assumed. Run through the suite's own
 * loader so `@/` resolves:
 *
 *   node --import ./test/loader-register.mjs scripts/_probe-field-row-markup.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';

const DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 1,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี' }],
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const markup = renderToStaticMarkup(createElement(RegistrationDetailClient, { doc: DOC, history: null }));

for (const heading of ['ข้อมูลคอร์ส', 'ผู้ประสานงาน', 'ข้อมูลระบบ']) {
  const at = markup.indexOf(`>${heading}<`);
  const dl = markup.indexOf('<dl', at);
  const end = markup.indexOf('</dl>', dl);
  console.log(`\n════ ${heading} ════`);
  console.log(markup.slice(dl, end + 5).replace(/></g, '>\n<'));
}

console.log('\n════ how many <dl> and how many rows ════');
console.log('dl count  :', (markup.match(/<dl\b/g) ?? []).length);
console.log('grid-cols :', (markup.match(/lg:grid-cols-\[22%_1fr\]/g) ?? []).length);
console.log('gap-x-36  :', (markup.match(/gap-x-\[36px\]/g) ?? []).length);
console.log('col-span  :', (markup.match(/col-span-full/g) ?? []).length);
