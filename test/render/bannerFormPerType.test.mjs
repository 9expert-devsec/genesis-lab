import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BannerForm } from '@/app/admin/banners/_components/BannerForm';
import { AdminBannerList } from '@/app/admin/banners/_components/AdminBannerList';
import {
  ALL_TYPE_LABELS,
  BANNER_TYPES,
  BANNER_TYPE_IDS,
  COURSE_KINDS,
  LEGACY_TYPES,
  LEGACY_TYPE_IDS,
} from '@/lib/banners/bannerTypes';
import { BANNER_FIELDS } from '@/lib/banners/bannerFormFields';
import { COURSE_REF_INPUTS, IMAGE_INPUTS } from '@/lib/banners/bannerFormPayload';

/**
 * THE FORM ITSELF, RENDERED, ONE TYPE AT A TIME.
 *
 * ── WHY THE RENDER TIER AND NOT ONLY THE PURE ONE ───────────────────────────
 * test/pure/bannerFormFields already proves the TABLE says the right thing. It
 * cannot prove the form USES it: a perfect table wired to a form that still
 * says `type.startsWith('image')` passes every pure test in the file. Only
 * rendering the real component and looking for the real `name=` attributes
 * shows a control appearing — and, the point of this slice, NOT appearing.
 *
 * ── THE CONTROL NAMES ARE THE ASSERTION ─────────────────────────────────────
 * `name="…"` and nothing else, because that is what `new FormData(form)`
 * actually collects. Asserting on a label would pass for a control rendered
 * without a name, which submits nothing — the silent-drop failure this whole
 * area keeps producing.
 */

const COURSE_OPTIONS = {
  items: [
    {
      upstreamId: 'up-1',
      courseId: 'SQL-PG-Query',
      kind: COURSE_KINDS.INCLASS,
      code: 'SQL-PG-Query',
      name: 'PostgreSQL Query',
      resolvable: true,
    },
    {
      upstreamId: 'up-2',
      courseId: 'HIDDEN-1',
      kind: COURSE_KINDS.INCLASS,
      code: 'HIDDEN-1',
      name: 'คอร์สที่ถูกซ่อน',
      resolvable: false,
    },
    {
      upstreamId: 'up-9',
      courseId: ' ONL-CYS',
      kind: COURSE_KINDS.ONLINE,
      code: 'ONL-CYS',
      name: 'Cyber Security Online',
      resolvable: true,
    },
  ],
  error: null,
};

const ARTICLE_OPTIONS = {
  items: [
    { slug: 'local-llm-คืออะไร', title: 'Local LLM คืออะไร', active: true, published: true, resolvable: true },
    { slug: 'future-one', title: 'ยังไม่ถึงเวลา', active: true, published: false, resolvable: false },
    { slug: 'inactive-one', title: 'ปิดอยู่', active: false, published: true, resolvable: false },
  ],
  error: null,
};

const html = (banner) =>
  renderToStaticMarkup(
    createElement(BannerForm, {
      banner,
      courseOptions: COURSE_OPTIONS,
      articleOptions: ARTICLE_OPTIONS,
    })
  );

/** Is there a form control posting under this name? */
const hasControl = (markup, name) =>
  new RegExp(`name="${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`).test(markup);

/** A minimal record of a given type, with every field a form might show. */
const rec = (type, over = {}) => ({
  _id: 'b1',
  type,
  title: 'หัวเรื่อง',
  youtube_id: 'abc123',
  image_url: 'https://cdn.example/a.jpg',
  link_url: '',
  link_text: 'ปุ่ม',
  weight: 3,
  active: true,
  ...over,
});

// ── The four types, control by control ─────────────────────────────────────

/** The spec, as a table. Anything not listed must be ABSENT. */
const EXPECTED = {
  [BANNER_TYPES.VIDEO]: [
    BANNER_FIELDS.TITLE, BANNER_FIELDS.TITLE_LINE2, BANNER_FIELDS.TITLE_HIGHLIGHT,
    BANNER_FIELDS.SUBTITLE, BANNER_FIELDS.DESCRIPTION, BANNER_FIELDS.YOUTUBE_ID,
    BANNER_FIELDS.LINK_URL, BANNER_FIELDS.WEIGHT, BANNER_FIELDS.ACTIVE,
    BANNER_FIELDS.STARTS_AT, BANNER_FIELDS.ENDS_AT,
  ],
  [BANNER_TYPES.IMAGE]: [
    BANNER_FIELDS.TITLE, BANNER_FIELDS.TITLE_LINE2, BANNER_FIELDS.TITLE_HIGHLIGHT,
    BANNER_FIELDS.SUBTITLE, BANNER_FIELDS.DESCRIPTION, IMAGE_INPUTS.FILE,
    BANNER_FIELDS.LINK_URL, BANNER_FIELDS.LINK_TEXT, BANNER_FIELDS.WEIGHT,
    BANNER_FIELDS.ACTIVE, BANNER_FIELDS.STARTS_AT, BANNER_FIELDS.ENDS_AT,
  ],
  [BANNER_TYPES.COURSE]: [
    BANNER_FIELDS.TITLE, BANNER_FIELDS.TITLE_LINE2, BANNER_FIELDS.TITLE_HIGHLIGHT,
    BANNER_FIELDS.SUBTITLE, COURSE_REF_INPUTS.UPSTREAM_ID, COURSE_REF_INPUTS.COURSE_ID,
    COURSE_REF_INPUTS.KIND, BANNER_FIELDS.WEIGHT, BANNER_FIELDS.ACTIVE,
    BANNER_FIELDS.STARTS_AT, BANNER_FIELDS.ENDS_AT,
  ],
  [BANNER_TYPES.ARTICLE]: [
    BANNER_FIELDS.TITLE, BANNER_FIELDS.TITLE_LINE2, BANNER_FIELDS.TITLE_HIGHLIGHT,
    BANNER_FIELDS.SUBTITLE, BANNER_FIELDS.ARTICLE_SLUG, BANNER_FIELDS.WEIGHT,
    BANNER_FIELDS.ACTIVE, BANNER_FIELDS.STARTS_AT, BANNER_FIELDS.ENDS_AT,
  ],
};

/** Every control name any type can render — the universe the absences are drawn from. */
const ALL_CONTROLS = [
  ...new Set([...Object.values(EXPECTED).flat(), BANNER_FIELDS.YOUTUBE_ID,
    IMAGE_INPUTS.FILE, BANNER_FIELDS.LINK_TEXT, BANNER_FIELDS.DESCRIPTION,
    COURSE_REF_INPUTS.KIND, BANNER_FIELDS.ARTICLE_SLUG]),
];

for (const type of BANNER_TYPE_IDS) {
  test(`${type}: renders exactly the controls the spec lists`, () => {
    const markup = html(rec(type));
    for (const name of EXPECTED[type]) {
      assert.equal(hasControl(markup, name), true, `${type} is MISSING name="${name}"`);
    }
    for (const name of ALL_CONTROLS.filter((n) => !EXPECTED[type].includes(n))) {
      assert.equal(hasControl(markup, name), false, `${type} wrongly renders name="${name}"`);
    }
  });
}

// ── THE DEAD SUBSTRING TESTS, PROVEN IN THE DOM ────────────────────────────

test('PROOF: a course record does NOT offer the image upload', () => {
  // `startsWith('image')` would have allowed it by accident — it answers false
  // for 'course' today, but on a naming convention rather than on a rule.
  const markup = html(rec(BANNER_TYPES.COURSE));
  assert.equal(hasControl(markup, IMAGE_INPUTS.FILE), false);
  assert.equal(hasControl(markup, IMAGE_INPUTS.URL), false);
  assert.equal(/type="file"/.test(markup), false, 'a file input is on a course form');
});

test('PROOF: a course record does NOT offer feature tags or a description', () => {
  const markup = html(rec(BANNER_TYPES.COURSE));
  assert.equal(hasControl(markup, 'feature_tags_json'), false);
  assert.equal(hasControl(markup, BANNER_FIELDS.DESCRIPTION), false);
});

test('PROOF: `video` gets the YouTube id field — the old equality test denied it', () => {
  // `isYouTube = type === LEGACY_TYPES.YOUTUBE` is false for 'video', so a
  // record saved under the new id offered no youtube_id at all.
  assert.equal(hasControl(html(rec(BANNER_TYPES.VIDEO)), BANNER_FIELDS.YOUTUBE_ID), true);
});

test('PROOF: `image` gets link_text — the old rule needed "button" in the ID', () => {
  assert.equal(BANNER_TYPES.IMAGE.includes('button'), false);
  assert.equal(hasControl(html(rec(BANNER_TYPES.IMAGE)), BANNER_FIELDS.LINK_TEXT), true);
});

test('CONTROL: hasControl really can answer false as well as true', () => {
  const markup = html(rec(BANNER_TYPES.IMAGE));
  assert.equal(hasControl(markup, BANNER_FIELDS.TITLE), true);
  assert.equal(hasControl(markup, 'a_control_that_does_not_exist'), false);
});

// ── All 22 stored records still open ───────────────────────────────────────

test('every legacy id renders, and renders the row of the type it becomes', () => {
  for (const legacy of LEGACY_TYPE_IDS) {
    const markup = html(rec(legacy));
    assert.ok(markup.length > 0, `${legacy} rendered nothing`);
    if (legacy === LEGACY_TYPES.YOUTUBE) {
      assert.equal(hasControl(markup, BANNER_FIELDS.YOUTUBE_ID), true, legacy);
      assert.equal(hasControl(markup, IMAGE_INPUTS.FILE), false, legacy);
    } else {
      assert.equal(hasControl(markup, IMAGE_INPUTS.FILE), true, legacy);
      assert.equal(hasControl(markup, BANNER_FIELDS.YOUTUBE_ID), false, legacy);
      // All four image_* ids get link_text — via normalisation, not via the
      // word "button" being present in two of them.
      assert.equal(hasControl(markup, BANNER_FIELDS.LINK_TEXT), true, legacy);
    }
  }
});

test('a record on a legacy id keeps that id as a selectable option', () => {
  // Otherwise opening and saving an existing banner would silently retype it,
  // which is a migration performed by accident, one record at a time.
  const markup = html(rec(LEGACY_TYPES.IMAGE_BUTTON_DESKTOP));
  assert.match(markup, new RegExp(`value="${LEGACY_TYPES.IMAGE_BUTTON_DESKTOP}"`));
  // `includes`, not a RegExp: the labels carry parentheses — "Section Banner
  // (Desktop)" — which a regex reads as a capture group, so the pattern would
  // match text the page does not contain.
  assert.ok(
    markup.includes(ALL_TYPE_LABELS[LEGACY_TYPES.IMAGE_BUTTON_DESKTOP]),
    'the legacy label is missing from the dropdown'
  );
});

test('a NEW banner is offered only the four current ids', () => {
  const markup = renderToStaticMarkup(
    createElement(BannerForm, { courseOptions: COURSE_OPTIONS, articleOptions: ARTICLE_OPTIONS })
  );
  for (const id of BANNER_TYPE_IDS) {
    assert.match(markup, new RegExp(`value="${id}"`), `${id} is not offered`);
  }
  for (const id of LEGACY_TYPE_IDS) {
    assert.equal(
      new RegExp(`<option value="${id}"`).test(markup),
      false,
      `a new banner is still offered the legacy id ${id}`
    );
  }
});

// ── The pickers ────────────────────────────────────────────────────────────

test('the course picker demands an explicit namespace and offers both', () => {
  const markup = html(rec(BANNER_TYPES.COURSE));
  assert.match(markup, new RegExp(`value="${COURSE_KINDS.INCLASS}"`));
  assert.match(markup, new RegExp(`value="${COURSE_KINDS.ONLINE}"`));
  // Nothing is preselected on a record with no stored ref, and the submit is
  // blocked until one is chosen — a guessed kind resolves to nothing at all.
  assert.match(markup, /เลือกประเภทคอร์สก่อน/);
  assert.match(markup, /disabled=""/, 'the submit button is not disabled');
});

test('the course picker warns when the chosen course is HIDDEN', () => {
  const markup = html(
    rec(BANNER_TYPES.COURSE, {
      course_ref: { upstreamId: 'up-2', courseId: 'HIDDEN-1', kind: COURSE_KINDS.INCLASS },
    })
  );
  assert.match(markup, /unpublished/, 'no warning for a hidden course');
  assert.match(markup, /ตัดออกจากหน้าแรก/);
});

test('…and does NOT warn when it is fine', () => {
  // Half the guard. A warning that is always on trains the admin to ignore it.
  const markup = html(
    rec(BANNER_TYPES.COURSE, {
      course_ref: { upstreamId: 'up-1', courseId: 'SQL-PG-Query', kind: COURSE_KINDS.INCLASS },
    })
  );
  assert.equal(/unpublished/.test(markup), false);
});

test('the course picker shows title, code AND namespace for the selection', () => {
  const markup = html(
    rec(BANNER_TYPES.COURSE, {
      course_ref: { upstreamId: 'up-9', courseId: ' ONL-CYS', kind: COURSE_KINDS.ONLINE },
    })
  );
  assert.match(markup, /Cyber Security Online/, 'no title');
  assert.match(markup, /ONL-CYS/, 'no code');
  assert.match(markup, /Online/, 'no namespace');
  // The stored key keeps its leading space; the DISPLAY does not.
  assert.match(markup, new RegExp(`name="${COURSE_REF_INPUTS.COURSE_ID}" value=" ONL-CYS"`));
  assert.equal(/<code> ONL-CYS<\/code>/.test(markup), false, 'the space leaked into the label');
});

test('a stored course that no longer exists is REPORTED, not silently blanked', () => {
  const markup = html(
    rec(BANNER_TYPES.COURSE, {
      course_ref: { upstreamId: 'gone', courseId: 'GONE-1', kind: COURSE_KINDS.INCLASS },
    })
  );
  assert.match(markup, /ไม่พบคอร์สรหัส/);
  // The value is still in the form, so saving does not destroy it.
  assert.match(markup, new RegExp(`name="${COURSE_REF_INPUTS.COURSE_ID}" value="GONE-1"`));
});

test('the article picker warns for inactive AND for not-yet-published, differently', () => {
  const inactive = html(rec(BANNER_TYPES.ARTICLE, { article_slug: 'inactive-one' }));
  assert.match(inactive, /inactive/);

  const future = html(rec(BANNER_TYPES.ARTICLE, { article_slug: 'future-one' }));
  assert.match(future, /ยังไม่ถึงกำหนดเผยแพร่/);
  assert.equal(/inactive/.test(future), false, 'a future-dated article is reported as inactive');
});

test('…and does NOT warn for a live article', () => {
  const markup = html(rec(BANNER_TYPES.ARTICLE, { article_slug: 'local-llm-คืออะไร' }));
  assert.equal(/ตัดออกจากหน้าแรก/.test(markup), false);
});

test('the article picker posts the Thai slug verbatim', () => {
  const markup = html(rec(BANNER_TYPES.ARTICLE, { article_slug: 'local-llm-คืออะไร' }));
  assert.match(
    markup,
    new RegExp(`name="${BANNER_FIELDS.ARTICLE_SLUG}" value="local-llm-คืออะไร"`)
  );
});

test('a picker whose list failed to load says so and keeps the stored value', () => {
  const markup = renderToStaticMarkup(
    createElement(BannerForm, {
      banner: rec(BANNER_TYPES.COURSE, {
        course_ref: { upstreamId: 'up-1', courseId: 'SQL-PG-Query', kind: COURSE_KINDS.INCLASS },
      }),
      courseOptions: { items: [], error: 'โหลดรายชื่อคอร์สจาก MSDB ไม่สำเร็จ — ECONNREFUSED' },
      articleOptions: ARTICLE_OPTIONS,
    })
  );
  assert.match(markup, /ECONNREFUSED/);
  assert.match(markup, new RegExp(`name="${COURSE_REF_INPUTS.COURSE_ID}" value="SQL-PG-Query"`));
});

// ── The link_url YouTube rule ──────────────────────────────────────────────

test('a video banner with a YouTube link_url is REFUSED, in the form', () => {
  // All six stored `youtube` records carry exactly this — a watch URL for the
  // id already in `youtube_id` — and the mapper has always dropped it. Saving
  // it successfully while it does nothing is the silence being removed.
  const markup = html(
    rec(LEGACY_TYPES.YOUTUBE, { link_url: 'https://www.youtube.com/watch?v=VOjRq4H1vBg' })
  );
  assert.match(markup, /ไม่มีผลใด ๆ/, 'no refusal shown');
  assert.match(markup, /ล้างลิงก์นี้/, 'no one-click fix offered');
  assert.match(markup, /disabled=""/, 'the save is not blocked');
});

test('…a non-YouTube link on the same video record is accepted', () => {
  const markup = html(
    rec(LEGACY_TYPES.YOUTUBE, { link_url: 'https://9expert.co.th/training-course' })
  );
  assert.equal(/ไม่มีผลใด ๆ/.test(markup), false);
});

test('…and an IMAGE banner may carry a YouTube link freely', () => {
  // The rule is about the "ดูรายละเอียด" button on a card that already plays
  // the video inline. An image banner has no such conflict.
  const markup = html(
    rec(BANNER_TYPES.IMAGE, { link_url: 'https://www.youtube.com/watch?v=abc' })
  );
  assert.equal(/ไม่มีผลใด ๆ/.test(markup), false);
});

// ── Titles, and what the list does with an absent one ──────────────────────

test('title is marked required on video/image and optional on course/article', () => {
  assert.match(html(rec(BANNER_TYPES.VIDEO)), /name="title"[^>]*required/);
  assert.match(html(rec(BANNER_TYPES.IMAGE)), /name="title"[^>]*required/);
  assert.equal(/name="title"[^>]*required/.test(html(rec(BANNER_TYPES.COURSE))), false);
  assert.equal(/name="title"[^>]*required/.test(html(rec(BANNER_TYPES.ARTICLE))), false);
});

test('the course form explains what an empty title means', () => {
  assert.match(html(rec(BANNER_TYPES.COURSE)), /ปล่อยว่างไว้จะใช้ชื่อจากคอร์ส/);
});

test('AdminBannerList labels come from the shared map, for OLD ids and NEW', () => {
  const markup = renderToStaticMarkup(
    createElement(AdminBannerList, {
      banners: [
        { _id: '1', type: LEGACY_TYPES.IMAGE_DESKTOP, title: 'เก่า', weight: 1, active: true },
        { _id: '2', type: BANNER_TYPES.COURSE, title: '', weight: 2, active: true },
        { _id: '3', type: BANNER_TYPES.ARTICLE, title: 'ใหม่', weight: 3, active: false },
      ],
    })
  );
  // `includes`, not a RegExp — see the note on the dropdown case above.
  for (const id of [LEGACY_TYPES.IMAGE_DESKTOP, BANNER_TYPES.COURSE, BANNER_TYPES.ARTICLE]) {
    assert.ok(markup.includes(ALL_TYPE_LABELS[id]), `no label rendered for ${id}`);
  }
  // A raw id must never reach the column.
  assert.equal(markup.includes(`>${BANNER_TYPES.COURSE}<`), false);
  // …and a course record with no title says what it will show instead of
  // rendering a nameless row.
  assert.match(markup, /ใช้ชื่อจากคอร์ส\/บทความที่อ้างถึง/);
});

test('the scheduling window renders in the SITE timezone, not the runtime one', () => {
  // 02:00Z is 09:00 in Bangkok. If this ever renders 02:00 the input has gone
  // back to asking the runtime, and the value differs between SSR and hydration.
  const markup = html(rec(BANNER_TYPES.IMAGE, { starts_at: '2026-09-01T02:00:00.000Z' }));
  assert.match(markup, /name="starts_at"[^>]*value="2026-09-01T09:00"/);
});
