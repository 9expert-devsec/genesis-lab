import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, plainText, decodeEntities } from '@/lib/corpus/htmlToText';
import { buildMasterclassCorpus, masterclassCourseItem, findMarkup } from '@/lib/corpus/masterclass';
import { CORPUS_PUBLIC_ORIGIN } from '@/lib/corpus/promotions';
import { GET, handleGet } from '@/app/api/corpus/masterclass/route';

/**
 * WHAT /api/corpus/masterclass IS ALLOWED TO SAY ABOUT A COURSE.
 *
 * Fixtures are modelled on the two live rows docs/masterclass-corpus-phase-a.md
 * measured on 2026-09-14, so each test pins a decision taken against real
 * data:
 *
 *   · the outline exists ONLY as `topics_html` (nested <ul> inside <li>) on
 *     12 of 13 modules; `topics[]` is a flattened copy on the 13th — the HTML
 *     is preferred and the nesting must survive as indentation;
 *   · `system_requirements{}` (the object) CONTRADICTS the rendered
 *     `system_requirements_html` on the Claude course — only the HTML is read;
 *   · `registered_count` is wrong on a live batch, prices and dates are
 *     served live by /api/corpus/promotions — no batch field may appear;
 *   · TipTap wraps every <li>'s text in <p>; that must not become a blank line.
 *
 * Every read is injected, so no test here reaches Mongo.
 */

// ── htmlToText: the ONE converter ───────────────────────────────────────────

const NESTED = '<ul><li><p>รู้จัก Claude AI</p></li><li><p>Prompt Pattern สำคัญ:</p><ul><li><p>Ask</p></li><li><p>Analyze</p></li></ul></li><li><p>ข้อจำกัดของ AI</p></li></ul>';

test('htmlToText: list items become "- " lines in source order; a nested list is indented, not flattened', () => {
  assert.equal(htmlToText(NESTED), '- รู้จัก Claude AI\n- Prompt Pattern สำคัญ:\n  - Ask\n  - Analyze\n- ข้อจำกัดของ AI');
});

test('htmlToText: <ol> is rendered the same way as <ul> — the corpus does not number', () => {
  const ol = '<ol><li><p>ระบบปฏิบัติการ</p><ul><li><p>Windows 10 / 11</p></li></ul></li><li><p>Web Browser</p></li></ol>';
  assert.equal(htmlToText(ol), '- ระบบปฏิบัติการ\n  - Windows 10 / 11\n- Web Browser');
});

test('htmlToText: block elements are paragraphs separated by ONE blank line; inline tags vanish without adding a space', () => {
  const html = '<p>ยกระดับ <strong>ChatGPT</strong> และ<strong> Gemini</strong> มี<em>X</em>    </p><h3>ข้อกำหนด</h3><div><p>สอง</p></div><p></p><p>สาม</p>';
  assert.equal(htmlToText(html), 'ยกระดับ ChatGPT และ Gemini มีX\n\nข้อกำหนด\n\nสอง\n\nสาม');
});

test('htmlToText: a <p> inside an <li> is a word boundary, not a paragraph — TipTap wraps every item in one', () => {
  const html = '<ul><li><p>one</p><p>two</p></li><li><p>three</p></li></ul><p>after</p>';
  assert.equal(htmlToText(html), '- one two\n- three\n\nafter');
});

test('htmlToText: entities decode, whitespace collapses, <br> breaks a line, script/style/comments are dropped', () => {
  assert.equal(htmlToText('<p>a&amp;b &nbsp; &#x41;&#66;   c</p><br><p>d</p>'), 'a&b AB c\n\nd');
  assert.equal(htmlToText('<script>alert(1)</script><style>p{}</style><!-- x --><p>after</p><span style="color:red">red</span>'), 'after\n\nred');
  assert.equal(htmlToText('line1<br>line2'), 'line1\nline2');
  assert.equal(decodeEntities('&hellip;&mdash;&unknown;'), '…—&unknown;');
});

test('htmlToText: empty, null and whitespace-only inputs are ""; plain text passes through', () => {
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText(null), '');
  assert.equal(htmlToText('  \n '), '');
  assert.equal(htmlToText('plain text'), 'plain text');
});

test('plainText: trims, collapses spaces, keeps single newlines (an instructor bio is rendered one line per \\n)', () => {
  assert.equal(plainText('  Canvassador 2026 \r\n\r\n\r\nมีประสบการณ์   20 ปี  '), 'Canvassador 2026\n\nมีประสบการณ์ 20 ปี');
  assert.equal(plainText(null), '');
});

// ── fixtures: the live rows, abridged ───────────────────────────────────────

const INSTRUCTOR_MVP = { _id: '69f856c3aac437056dfc00fd', name: 'ชไลเวท พิพัฒพรรณวงศ์', name_en: 'Chalaivate Pipatpannawong', title: '9Expert Instructor | Microsoft MVP', bio: 'Microsoft MVP Power BI/Copilot\nมีประสบการณ์การสอนมากกว่า 20 ปี\nData & AI Consult', specialties: [], is_active: true };
const INSTRUCTOR_CANVA = { _id: '69f856c3aac437056dfc00fc', name: 'โทวิทูร เอื้อประเสริฐวณิช', name_en: 'Thowithun Aueprasertvanich', title: '9Expert Instructor | Canvassador', bio: 'Canvassador 2026\nมีประสบการณ์การสอนมากกว่า 20 ปี', specialties: [], is_active: true };

const CLAUDE = {
  _id: '6a3212236f20c8488c24fa65',
  slug: 'mas-claude-ai-for-data-analyst',
  course_code: 'M-CLAUDE-DA',
  title_th: 'Claude AI for Data Analyst',
  subtitle_th: 'เรียนรู้การวิเคราะห์ข้อมูลด้วย Claude AI',
  description_html: '<p>ยกระดับทักษะการวิเคราะห์ข้อมูลด้วย <strong>Claude AI</strong> ผ่าน Workshop เข้มข้น</p>',
  cover_image_url: 'https://res.cloudinary.com/x/cover.webp',
  gallery: [{ type: 'youtube', videoId: 'Ta9Au9mhWS4', alt: 'แนะนำหลักสูตร' }],
  course_outline_url: 'https://res.cloudinary.com/x/outline.pdf',
  duration_days: 1, duration_hours: 7, schedule_days: ['เสาร์'], time_start: '09:00', time_end: '17:00',
  level: 'intermediate',
  tags: ['AI', 'Excel', 'M365'],
  suitable_for: [{ label: 'Data / Business Analyst', image_url: 'x' }, { label: 'Manager & หัวหน้างาน', image_url: '' }],
  prerequisites: ['มีความรู้พื้นฐานในการใช้งานคอมพิวเตอร์', 'ไม่จำเป็นต้องมีพื้นฐานด้านการเขียนโปรแกรม'],
  objectives: ['ใช้ Claude AI วิเคราะห์ข้อมูลตั้งแต่ต้นทางถึงปลายทาง'],
  benefits: ['สามารถใช้ Claude AI เพื่อวิเคราะห์ข้อมูลได้อย่างรวดเร็ว'],
  equipment_required: ['Notebook หรือ Laptop ส่วนตัว'],
  // The object contradicts the HTML on the live row (macOS / Firefox / Excel vs Windows-only).
  system_requirements: { os: ['Windows 10 / 11', 'macOS'], browsers: ['Mozilla Firefox เวอร์ชันล่าสุด'], accounts: [], software: ['Microsoft Excel 2019 ขึ้นไป'] },
  system_requirements_html: '<ol><li><p>ระบบปฏิบัติการ Windows 11 / 10</p></li><li><p>Claude for Desktop (สำหรับใช้งาน Cowork Mode)</p></li></ol>',
  license_options: { enabled: true, choices: [{ value: 'Own', label_th: 'ของตัวเอง', info_popup: { enabled: true, html_content: '<p>เงื่อนไข</p>' } }], global_ack: { enabled: true, html_content: '<h3>License ของตัวเอง</h3>' } },
  instructor_ids: [INSTRUCTOR_MVP._id],
  curriculum: [
    { session_label: 'Morning  (09.00 – 12.30)', modules: [
      // the one module on the live data that carries BOTH forms — the HTML wins
      { module_no: 1, title: 'Claude AI as Your Data Analyst Assistant', topics: ['รู้จัก Claude AI', 'Prompt Pattern สำคัญ:', 'Ask', 'Analyze', 'ข้อจำกัดของ AI'], topics_html: NESTED, workshop: '', output: '', content_html: '' },
      { module_no: 2, title: 'Data Thinking with GQM', topics: [], topics_html: '<ul><li><p>GQM</p></li></ul>', workshop: '', output: '', content_html: '' },
    ] },
    { session_label: 'AFTERNOON  (12.30 – 17.00)', modules: [
      { module_no: 3, title: 'Dashboard Design', topics: [], topics_html: '<ul><li><p>Dashboard</p></li></ul>', workshop: '', output: '', content_html: '' },
    ] },
  ],
  is_published: true, is_active: true, display_order: 0, faq_category: 'masterclass',
  // getPublishedMasterclasses attaches these; the corpus must drop every one of them.
  batches: [{ _id: '6a33631a749934f3c6c59acf', batch_no: 2, status: 'open', price_normal: 12900, price_early_bird: 9675, early_bird_deadline: '2026-10-02T16:59:00.000Z', capacity: 50, registered_count: 0, venue_name: 'Asia Hotel | Bangkok', dates: [{ date: '2026-10-17T00:00:00.000Z', day_label: 'เสาร์ที่ 17 ตุลาคม 2569' }] }],
};

const CLAUDE_FAQS = [
  { _id: 'f1', course_type: 'masterclass', ref_id: CLAUDE._id, question_th: 'หลักสูตรนี้เหมาะกับใครบ้าง?', answer_html: '<p>เหมาะกับ <strong>Data Analyst</strong> และผู้จัดการ</p>', is_active: true, display_order: 0 },
  { _id: 'f2', course_type: 'masterclass', ref_id: CLAUDE._id, question_th: 'ต้องเขียนโปรแกรมเป็นไหม?', answer_html: '<p>ไม่จำเป็น</p>', is_active: true, display_order: 1 },
];

const DMC = {
  _id: '6a33db33b87c174eb4b5a737', slug: 'mas-ai-dmc', course_code: 'M-AI-DMC',
  title_th: 'AI Digital Marketing Creator Masterclass', subtitle_th: 'สร้างคอนเทนต์ด้วย AI',
  description_html: '<p>ยกระดับการสร้างคอนเทนต์</p>', duration_days: 1, duration_hours: 7,
  schedule_days: ['เสาร์'], time_start: '09:00', time_end: '17:00', level: 'intermediate',
  suitable_for: [{ label: 'Content Creator' }], prerequisites: [], objectives: ['a'], benefits: ['b'],
  system_requirements: { os: [], browsers: [], accounts: [], software: [] }, system_requirements_html: '',
  instructor_ids: [INSTRUCTOR_MVP._id, INSTRUCTOR_CANVA._id],
  curriculum: [{ session_label: 'Morning', modules: [
    // no topics_html — the plain array is the fallback, as on the page
    { module_no: 1, title: 'AI Content Creator Mindset', topics: ['ภาพรวม AI', 'AI Creative Producer'], topics_html: '' },
  ] }],
  is_published: true, display_order: 1, batches: [],
};

const EXPECTED_KEYS = [
  'id', 'slug', 'course_code', 'title', 'subtitle', 'url', 'outline_pdf_url', 'level', 'duration', 'schedule',
  'description', 'objectives', 'benefits', 'audience', 'prerequisites', 'system_requirements',
  'curriculum', 'instructors', 'faqs',
];

const FORBIDDEN_KEYS = [
  'batches', 'price', 'price_normal', 'price_early_bird', 'early_bird_deadline', 'venue', 'venue_name', 'dates',
  'seats', 'capacity', 'registered_count', 'license_options', 'license', 'equipment_required', 'tags',
  'faq_category', 'is_active', 'gallery', 'cover_image_url', 'system_requirements_html', 'title_th',
];

/** Every string anywhere in a JSON value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// ── masterclassCourseItem: the exact field set ──────────────────────────────

test('the item carries EXACTLY the documented field set, in that order, and none of the forbidden ones', () => {
  const item = masterclassCourseItem(CLAUDE, { faqs: CLAUDE_FAQS, instructors: [INSTRUCTOR_MVP] });
  assert.deepEqual(Object.keys(item), EXPECTED_KEYS);
  for (const k of FORBIDDEN_KEYS) assert.equal(k in item, false, `${k} must not be served`);
  assert.deepEqual(Object.keys(item.curriculum[0].modules[0]), ['no', 'title', 'topics', 'workshop', 'output', 'notes']);
  assert.deepEqual(Object.keys(item.instructors[0]), ['name', 'name_en', 'title', 'bio']);
  assert.deepEqual(Object.keys(item.faqs[0]), ['question', 'answer']);
  assert.deepEqual(Object.keys(item.duration), ['days', 'hours']);
  assert.deepEqual(Object.keys(item.schedule), ['days', 'time']);
});

test('identity, URL and scalars: the canonical www host, the course slug, no title_en invented', () => {
  const item = masterclassCourseItem(CLAUDE, { faqs: [], instructors: [] });
  assert.equal(item.id, 'masterclass:6a3212236f20c8488c24fa65');
  assert.equal(item.url, `${CORPUS_PUBLIC_ORIGIN}/masterclass/mas-claude-ai-for-data-analyst`);
  assert.equal(CORPUS_PUBLIC_ORIGIN, 'https://www.9experttraining.com');
  assert.ok(!item.url.includes('masterclass.9experttraining.com'), 'never the subdomain');
  assert.equal(item.title, 'Claude AI for Data Analyst');
  assert.equal(item.course_code, 'M-CLAUDE-DA');
  assert.equal(item.level, 'intermediate');
  assert.deepEqual(item.duration, { days: 1, hours: 7 });
  assert.deepEqual(item.schedule, { days: ['เสาร์'], time: '09:00–17:00' });
  assert.equal(item.outline_pdf_url, 'https://res.cloudinary.com/x/outline.pdf');
});

test('prose fields are plain text: description and FAQ answers lose their tags, arrays keep their order', () => {
  const item = masterclassCourseItem(CLAUDE, { faqs: CLAUDE_FAQS, instructors: [INSTRUCTOR_MVP] });
  assert.equal(item.description, 'ยกระดับทักษะการวิเคราะห์ข้อมูลด้วย Claude AI ผ่าน Workshop เข้มข้น');
  assert.deepEqual(item.audience, ['Data / Business Analyst', 'Manager & หัวหน้างาน'], 'a literal & in a plain field is not an entity');
  assert.deepEqual(item.prerequisites, CLAUDE.prerequisites);
  assert.deepEqual(item.objectives, CLAUDE.objectives);
  assert.deepEqual(item.benefits, CLAUDE.benefits);
  assert.deepEqual(item.faqs, [
    { question: 'หลักสูตรนี้เหมาะกับใครบ้าง?', answer: 'เหมาะกับ Data Analyst และผู้จัดการ' },
    { question: 'ต้องเขียนโปรแกรมเป็นไหม?', answer: 'ไม่จำเป็น' },
  ]);
});

test('system requirements come from system_requirements_html ONLY — the contradicting object is never read', () => {
  const item = masterclassCourseItem(CLAUDE, {});
  assert.equal(item.system_requirements, '- ระบบปฏิบัติการ Windows 11 / 10\n- Claude for Desktop (สำหรับใช้งาน Cowork Mode)');
  for (const s of strings(item)) {
    assert.ok(!s.includes('macOS'), 'macOS is only in the vestigial object');
    assert.ok(!s.includes('Firefox'), 'Firefox is only in the vestigial object');
    assert.ok(!s.includes('Excel 2019'), 'Excel 2019 is only in the vestigial object');
  }
  // CONTROL: the same course with the object emptied gives the same answer — the object was never consulted.
  const without = masterclassCourseItem({ ...CLAUDE, system_requirements: undefined }, {});
  assert.equal(without.system_requirements, item.system_requirements);
});

test('curriculum: topics_html wins over topics[] and its nesting survives; topics[] is the fallback only when the HTML is empty', () => {
  const item = masterclassCourseItem(CLAUDE, {});
  assert.equal(item.curriculum.length, 2);
  assert.equal(item.curriculum[0].session, 'Morning (09.00 – 12.30)', 'double spaces collapse');
  const m1 = item.curriculum[0].modules[0];
  assert.equal(m1.no, 1);
  assert.equal(m1.title, 'Claude AI as Your Data Analyst Assistant');
  assert.equal(m1.topics, '- รู้จัก Claude AI\n- Prompt Pattern สำคัญ:\n  - Ask\n  - Analyze\n- ข้อจำกัดของ AI');
  assert.equal(m1.workshop, null);
  assert.equal(m1.output, null);
  assert.equal(m1.notes, null);
  assert.equal(item.curriculum[1].modules[0].topics, '- Dashboard');

  const dmc = masterclassCourseItem(DMC, {});
  assert.equal(dmc.curriculum[0].modules[0].topics, '- ภาพรวม AI\n- AI Creative Producer', 'the plain array, rendered the same way');
});

test('instructors follow instructor_ids order and carry name, name_en, title and a newline-preserving bio; nothing else', () => {
  // The read returns them in Mongo order (MVP's id sorts after Canva's); the course lists MVP first.
  const item = masterclassCourseItem(DMC, { instructors: [INSTRUCTOR_CANVA, INSTRUCTOR_MVP] });
  assert.deepEqual(item.instructors.map((i) => i.name_en), ['Chalaivate Pipatpannawong', 'Thowithun Aueprasertvanich']);
  assert.equal(item.instructors[0].bio, 'Microsoft MVP Power BI/Copilot\nมีประสบการณ์การสอนมากกว่า 20 ปี\nData & AI Consult');
  assert.equal(item.instructors[1].title, '9Expert Instructor | Canvassador');
  // An id that resolves nothing is skipped, not emitted as a hole.
  const partial = masterclassCourseItem(DMC, { instructors: [INSTRUCTOR_CANVA] });
  assert.equal(partial.instructors.length, 1);
});

test('nothing from the attached batches survives: no price, date, deadline, venue or seat count anywhere in the item', () => {
  const item = masterclassCourseItem(CLAUDE, { faqs: CLAUDE_FAQS, instructors: [INSTRUCTOR_MVP] });
  const all = JSON.stringify(item);
  for (const needle of ['12900', '9675', '2026-10-02', '2026-10-17', 'Asia Hotel', 'registered_count', 'capacity', '"50"', 'ตุลาคม']) {
    assert.ok(!all.includes(needle), `${needle} leaked from the batch`);
  }
  assert.ok(!all.includes('License ของตัวเอง'), 'register-page licence terms are not quoted');
  assert.ok(!all.includes('Notebook หรือ Laptop'), 'equipment_required is unrendered and not served');
  assert.ok(!all.includes('M365'), 'tags are not served');
});

test('empty and missing source fields become null / [] — never "" and never an invented value', () => {
  const item = masterclassCourseItem({ _id: 'x', slug: 's' }, {});
  assert.equal(item.title, null);
  assert.equal(item.description, null);
  assert.equal(item.system_requirements, null);
  assert.equal(item.outline_pdf_url, null);
  assert.equal(item.schedule.time, null);
  assert.deepEqual(item.duration, { days: null, hours: null });
  assert.deepEqual(item.objectives, []);
  assert.deepEqual(item.curriculum, []);
  assert.deepEqual(item.instructors, []);
  assert.deepEqual(item.faqs, []);
  const dmc = masterclassCourseItem(DMC, {});
  assert.equal(dmc.system_requirements, null, 'an empty HTML field is null');
  assert.equal(dmc.outline_pdf_url, null);
});

// ── buildMasterclassCorpus: injected reads, one generated_at, the markup guard ─

const NOW = new Date('2026-09-14T06:18:00.000Z');

function deps(overrides = {}) {
  return {
    now: NOW,
    readCourses: async () => [CLAUDE, DMC],
    readFaqs: async (id) => (String(id) === CLAUDE._id ? CLAUDE_FAQS : []),
    readInstructors: async (ids) => [INSTRUCTOR_CANVA, INSTRUCTOR_MVP].filter((i) => ids.includes(i._id)),
    ...overrides,
  };
}

test('the corpus is one item per published row from the injected read, in read order, stamped with the ONE now', async () => {
  const body = await buildMasterclassCorpus(deps());
  assert.deepEqual(Object.keys(body), ['generated_at', 'source_note', 'count', 'courses']);
  assert.equal(body.generated_at, '2026-09-14T06:18:00.000Z');
  assert.equal(body.count, 2);
  assert.deepEqual(body.courses.map((c) => c.slug), ['mas-claude-ai-for-data-analyst', 'mas-ai-dmc']);
  assert.equal(body.courses[0].faqs.length, 2);
  assert.equal(body.courses[1].faqs.length, 0);
  assert.equal(body.courses[1].instructors.length, 2);
  assert.equal(findMarkup(body), null);
});

test('CONTROL: a plain field that smuggles a tag past the converter makes the build THROW — nothing is served with markup in it', async () => {
  // plain fields are not HTML and are not converted; a tag typed into one is exactly the leak the guard exists for
  const smuggled = { ...DMC, objectives: ['เรียนรู้ <b>AI</b>'] };
  await assert.rejects(
    buildMasterclassCorpus(deps({ readCourses: async () => [smuggled] })),
    /markup leaked into the response at \$\.courses\[0\]\.objectives\[0\]/
  );
  // the same string in an HTML field is converted and passes
  const converted = { ...DMC, description_html: '<p>เรียนรู้ <b>AI</b></p>' };
  const body = await buildMasterclassCorpus(deps({ readCourses: async () => [converted] }));
  assert.equal(body.courses[0].description, 'เรียนรู้ AI');
});

test('findMarkup: a bare "<" in prose is not markup; a tag, comment or declaration is', () => {
  assert.equal(findMarkup({ a: 'x < 5 and y > 2' }), null);
  assert.equal(findMarkup({ a: ['ok', 'a <b>'] }), '$.a[1]');
  assert.equal(findMarkup({ a: { b: '<!-- c -->' } }), '$.a.b');
  assert.equal(findMarkup({ a: '</p>' }), '$.a');
});

// ── the route: fail closed, then the same key as promotions, then the body ──

const REQ = (key) => new Request('http://localhost/api/corpus/masterclass', key == null ? {} : { headers: { 'x-api-key': key } });

test('route: 503 with no CORPUS_API_KEY configured — fail closed, no corpus on the refusal path', async () => {
  const saved = process.env.CORPUS_API_KEY;
  delete process.env.CORPUS_API_KEY;
  try {
    const res = await GET(REQ('any-key'));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.error, 'corpus_unavailable');
    assert.ok(!('courses' in body));
  } finally {
    if (saved !== undefined) process.env.CORPUS_API_KEY = saved;
  }
});

test('route: 401 with an empty body on a wrong or missing key', async () => {
  const saved = process.env.CORPUS_API_KEY;
  process.env.CORPUS_API_KEY = 'secret-1';
  try {
    for (const key of ['secret-2', 'secret-1x', '', null]) {
      const res = await GET(REQ(key));
      assert.equal(res.status, 401, `key ${JSON.stringify(key)}`);
      assert.equal(await res.text(), '');
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
  } finally {
    if (saved === undefined) delete process.env.CORPUS_API_KEY; else process.env.CORPUS_API_KEY = saved;
  }
});

test('route: 200 with the right key — the documented field set per course, no-store, and NO emitted string contains "<"', async () => {
  const saved = process.env.CORPUS_API_KEY;
  process.env.CORPUS_API_KEY = 'secret-1';
  try {
    const res = await handleGet(REQ('secret-1'), deps());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.count, 2);
    for (const c of body.courses) assert.deepEqual(Object.keys(c), EXPECTED_KEYS, c.slug);
    const all = strings(body);
    assert.ok(all.length > 40, 'the body is not empty');
    for (const s of all) assert.ok(!s.includes('<'), `"<" in ${JSON.stringify(s)}`);
  } finally {
    if (saved === undefined) delete process.env.CORPUS_API_KEY; else process.env.CORPUS_API_KEY = saved;
  }
});

test('route: a build that throws answers 500 corpus_invalid, logged, with nothing partial in the body', async () => {
  const saved = process.env.CORPUS_API_KEY;
  process.env.CORPUS_API_KEY = 'secret-1';
  const logged = [];
  try {
    const res = await handleGet(REQ('secret-1'), deps({
      readCourses: async () => [{ ...DMC, title_th: '<h1>x</h1>' }],
      log: (...a) => logged.push(a),
    }));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'corpus_invalid' });
    assert.equal(logged.length, 1);
  } finally {
    if (saved === undefined) delete process.env.CORPUS_API_KEY; else process.env.CORPUS_API_KEY = saved;
  }
});
