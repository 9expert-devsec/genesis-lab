/**
 * A CONTROL HARNESS, not a test — run by hand, never by `npm test`.
 *
 * It registers the suite's own loader (the `@/` alias + sucrase JSX hooks) and
 * then renders InhouseDetailClient directly, so a claim about how many แก้ไข
 * buttons the screen draws can be MEASURED rather than inferred from an
 * assertion's pass/fail. `node --import ./test/loader.mjs` does NOT work: the
 * hooks have to go through `module.register`, which is what test/run.mjs does.
 *
 * Usage:  node scripts/_probe-inhouse-edit-count.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { InhouseDetailClient } = await import('@/app/admin/registrations/inhouse/_components/InhouseDetailClient');

const BASE_DOC = {
  _id: '68a1b2c3d4e5f60718293a4b',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบ จำกัด',
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com',
  contactPhone: '0812345678',
  coursesInterested: ['EXC-201'],
  participantsCount: 20,
  contentMode: 'standard',
  trainingFormat: 'onsite',
  preferredMonth: '2026-09',
  quotationCountry: 'TH',
  branchType: 'head_office',
  branchCode: '',
  adminNotes: 'คุยกับลูกค้าแล้ว',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

const CARDS = [
  'ผู้ประสานงาน & บริษัท',
  'Training Requirement',
  'ตารางเวลา & รูปแบบการอบรม',
  'ข้อมูลใบเสนอราคา',
  'หมายเหตุจากลูกค้า',
  'บันทึกภายในของทีมขาย',
];

for (const status of ['pending', 'cancelled']) {
  const markup = renderToStaticMarkup(
    createElement(InhouseDetailClient, {
      doc: { ...BASE_DOC, status },
      courses: [{ code: 'EXC-201', name: 'Excel Advanced' }],
    }),
  );
  console.log(`\n=== ${status}: >แก้ไข< count = ${markup.split('>แก้ไข<').length - 1} ===`);
  for (const t of CARDS) console.log(`  ${markup.includes(t) ? 'present' : 'MISSING'}  ${t}`);
}
