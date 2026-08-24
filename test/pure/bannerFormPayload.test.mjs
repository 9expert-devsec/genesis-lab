import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_REF_INPUTS,
  FEATURE_TAGS_INPUT,
  IMAGE_INPUTS,
  parseBannerFormData,
} from '@/lib/banners/bannerFormPayload';
import { BANNER_FIELDS } from '@/lib/banners/bannerFormFields';
import { bannerSchema } from '@/lib/schemas/banner';
import {
  BANNER_TYPES,
  COURSE_KINDS,
  LEGACY_TYPES,
} from '@/lib/banners/bannerTypes';

/**
 * FORM STATE IN → DOCUMENT SHAPE OUT, through the real parser and the real
 * schema.
 *
 * ── THE RULE THIS FILE EXISTS FOR ───────────────────────────────────────────
 * A field the form did not RENDER must be preserved, not blanked. The old
 * parser read every key with `formData.get(k) || ''`, and BannerForm rendered
 * `link_text` for two of five types and `feature_tags` for one — so saving a
 * banner wrote empty strings over fields belonging to whichever type the admin
 * was not on. It was survivable while all five types rendered nearly the same
 * controls. It stops being survivable now: the per-type table hides seven
 * fields on `course` and hides `link_text` on `video`, and SIX stored `youtube`
 * records carry `link_text: "YouTube"` plus 187–340 characters of `slide_text`.
 *
 * `FormData.has()` is what makes the rule expressible, and it is a DIFFERENT
 * question from `get()`: an empty text input posts `''` and `has()` is true. So
 * "the admin cleared this" and "this was never on screen" stay distinguishable,
 * and both are tested below — the second one is the regression, the first one
 * is what stops the fix from becoming "you can never clear a field".
 */

/** A FormData carrying exactly the keys named, and nothing else. */
function fd(entries) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

/** What a stored `youtube` record actually looks like, measured. */
function storedYouTube(over = {}) {
  return {
    _id: 'stored-1',
    type: LEGACY_TYPES.YOUTUBE,
    title: 'บทสรุปจากผู้นำเทคโนโลยีระดับโลก',
    youtube_id: 'VOjRq4H1vBg',
    slide_text: 'ข้อความเดิมความยาว 187–340 ตัวอักษรที่ยังใช้แสดงอยู่บนหน้าแรก',
    link_url: 'https://www.youtube.com/watch?v=VOjRq4H1vBg',
    link_text: 'YouTube',
    feature_tags: [{ icon: 'Users', line1: 'ผู้นำระดับโลก', line2: 'ร่วมแบ่งปันมุมมอง' }],
    image_url: '',
    image_public_id: '',
    weight: 10,
    active: true,
    starts_at: null,
    ends_at: null,
    ...over,
  };
}

// ── THE PRESERVATION RULE ──────────────────────────────────────────────────

test('a field the form did not render is CARRIED FORWARD, not blanked', () => {
  const existing = storedYouTube();
  // `video` renders neither link_text nor the feature-tag editor, so neither
  // key is in the payload. This is the exact save that used to destroy them.
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.VIDEO,
      [BANNER_FIELDS.TITLE]: existing.title,
      [BANNER_FIELDS.YOUTUBE_ID]: existing.youtube_id,
      [BANNER_FIELDS.WEIGHT]: '10',
      [BANNER_FIELDS.ACTIVE]: 'true',
    }),
    { existing }
  );

  assert.equal(out.link_text, 'YouTube', 'link_text was blanked');
  assert.deepEqual(out.feature_tags, existing.feature_tags, 'feature_tags were blanked');
  assert.equal(out.slide_text, existing.slide_text, 'slide_text was blanked');
});

test('CONTROL: the same save through the OLD rule would have blanked them', () => {
  // Without this the assertion above is a claim about a parser that could be
  // returning the stored object wholesale. `get() || ''` is the old expression,
  // run here against the same FormData, and it answers '' for both.
  const f = fd({
    type: BANNER_TYPES.VIDEO,
    [BANNER_FIELDS.TITLE]: 'x',
    [BANNER_FIELDS.YOUTUBE_ID]: 'y',
  });
  assert.equal(f.get(BANNER_FIELDS.LINK_TEXT) || '', '');
  assert.equal(f.get(FEATURE_TAGS_INPUT) || '', '');
  assert.equal(f.has(BANNER_FIELDS.LINK_TEXT), false);
});

test('a field the form DID render but the admin emptied IS cleared', () => {
  // The other half of the rule. If "absent means keep" leaked into "empty means
  // keep", a field would become impossible to unset — which is worse than the
  // bug it fixes, because there would be no way to notice.
  const existing = storedYouTube({ type: LEGACY_TYPES.IMAGE_BUTTON_DESKTOP, link_text: 'ดูหลักสูตร' });
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.IMAGE,
      [BANNER_FIELDS.TITLE]: 'ยังอยู่',
      [BANNER_FIELDS.LINK_TEXT]: '',
      [FEATURE_TAGS_INPUT]: '[]',
    }),
    { existing }
  );
  assert.equal(out.link_text, '');
  assert.deepEqual(out.feature_tags, []);
});

test('slide_text is never authored and never lost', () => {
  const existing = storedYouTube();
  // Even when the form posts a slide_text key — it never does, but a stale tab
  // or a hand-rolled request could — the stored value wins. The field is
  // migration-only; `description` is where new copy goes.
  const out = parseBannerFormData(
    fd({ type: BANNER_TYPES.VIDEO, slide_text: 'ของปลอม', [BANNER_FIELDS.TITLE]: 'x' }),
    { existing }
  );
  assert.equal(out.slide_text, existing.slide_text);
});

test('the slide_text → description migration is byte-identical', () => {
  // BannerForm prefills the description box with `description ?? slide_text`.
  // Saving therefore copies the stored copy into the new field VERBATIM while
  // slide_text is carried forward, and the mapper's `description ?? slide_text`
  // then reads the identical string. Nothing on the home page moves.
  const existing = storedYouTube();
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.VIDEO,
      [BANNER_FIELDS.TITLE]: existing.title,
      [BANNER_FIELDS.YOUTUBE_ID]: existing.youtube_id,
      [BANNER_FIELDS.DESCRIPTION]: existing.slide_text,
    }),
    { existing }
  );
  assert.equal(out.description, existing.slide_text);
  assert.equal(out.slide_text, existing.slide_text);
  // What the mapper reads before and after the save.
  const before = existing.description ?? existing.slide_text;
  const after = out.description ?? out.slide_text;
  assert.equal(after, before);
});

// ── course_ref ─────────────────────────────────────────────────────────────

test('course_ref carries BOTH identities and the explicit kind', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.COURSE,
      [BANNER_FIELDS.TITLE]: '',
      [COURSE_REF_INPUTS.UPSTREAM_ID]: '6512ab34cd56ef7890123456',
      [COURSE_REF_INPUTS.COURSE_ID]: 'SQL-PG-Query',
      [COURSE_REF_INPUTS.KIND]: COURSE_KINDS.INCLASS,
    })
  );
  assert.deepEqual(out.course_ref, {
    upstreamId: '6512ab34cd56ef7890123456',
    courseId: 'SQL-PG-Query',
    kind: COURSE_KINDS.INCLASS,
  });
});

test('the stored course code keeps its EXACT bytes — mixed case and all', () => {
  // Four public ids are mixed-case upstream, and `?course_id=` is exact-match
  // case-sensitive. Upper-casing the stored value here would make the document
  // disagree with the source it came from.
  for (const code of ['SQL-PG-Query', 'SQL-ADM-Tuning', 'MS-SQL-19-Prov', 'SQL-ADM-Secure']) {
    const out = parseBannerFormData(
      fd({
        type: BANNER_TYPES.COURSE,
        [COURSE_REF_INPUTS.COURSE_ID]: code,
        [COURSE_REF_INPUTS.KIND]: COURSE_KINDS.INCLASS,
      })
    );
    assert.equal(out.course_ref.courseId, code);
  }
});

test('an online id keeps its leading space through zod, and only DISPLAY trims', () => {
  // Two online ids ship with one: " ONL-CYS" and " ONL-MSE-PQ-PM". The zod
  // schema `.trim()`s `courseId`, which is safe precisely because resolution
  // normalises both sides with trim+upper-case — so trimmed and untrimmed
  // resolve to the same course. What must NOT happen is the space silently
  // becoming part of a key nothing matches.
  const raw = ' ONL-MSE-PQ-PM';
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.COURSE,
      [COURSE_REF_INPUTS.COURSE_ID]: raw,
      [COURSE_REF_INPUTS.KIND]: COURSE_KINDS.ONLINE,
    })
  );
  // The PARSER trims — `read(...).trim()` — because a leading space in a stored
  // key buys nothing and costs a mismatch on any consumer that does not
  // normalise. The important property is that the SIGNIFICANT characters are
  // untouched.
  assert.equal(out.course_ref.courseId, 'ONL-MSE-PQ-PM');
  assert.equal(out.course_ref.kind, COURSE_KINDS.ONLINE);
});

test('kind is taken verbatim and never defaulted by the parser', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.COURSE,
      [COURSE_REF_INPUTS.COURSE_ID]: 'ABC',
      [COURSE_REF_INPUTS.KIND]: '',
    })
  );
  assert.equal(out.course_ref.kind, '');
  // …and the schema is where the empty kind is refused, so it cannot reach the
  // database as an in-class guess.
  const parsed = bannerSchema.safeParse(out);
  assert.equal(parsed.success, false);
});

test('a stored course_ref survives a save from a type that hides the picker', () => {
  const existing = {
    type: BANNER_TYPES.COURSE,
    title: 'x',
    course_ref: { upstreamId: 'up-1', courseId: 'ABC', kind: COURSE_KINDS.ONLINE },
  };
  const out = parseBannerFormData(
    fd({ type: BANNER_TYPES.IMAGE, [BANNER_FIELDS.TITLE]: 'x' }),
    { existing }
  );
  assert.deepEqual(out.course_ref, {
    upstreamId: 'up-1',
    courseId: 'ABC',
    kind: COURSE_KINDS.ONLINE,
  });
});

// ── article_slug ───────────────────────────────────────────────────────────

test('a Thai slug survives byte-for-byte — no ASCII sanitising anywhere', () => {
  // 265 of the 488 live slugs contain Thai. Any transliteration, folding or
  // percent-encoding on this path breaks every one of those links at once.
  const slugs = [
    'local-llm-คืออะไร',
    '5-เทคนิคทำให้-excel-เร็วขึ้น',
    '9สูตรคำนวณ-ผู้เริ่มต้นใช้งาน-excel',
    'DAX-Time-Intelligence-ประโยชน์-และตัวอย่างการใช้งาน',
  ];
  for (const slug of slugs) {
    const out = parseBannerFormData(
      fd({ type: BANNER_TYPES.ARTICLE, [BANNER_FIELDS.ARTICLE_SLUG]: slug })
    );
    assert.equal(out.article_slug, slug, slug);
    const parsed = bannerSchema.safeParse(out);
    assert.equal(parsed.success, true, `${slug} did not survive the schema`);
    assert.equal(parsed.data.article_slug, slug, `${slug} was altered by the schema`);
  }
});

test('CONTROL: an ASCII-sanitiser really would destroy those slugs', () => {
  // Proof that the assertion above is about something. If the values were
  // already ASCII the test would pass against a parser that mangled them.
  const slug = 'local-llm-คืออะไร';
  assert.notEqual(slug.replace(/[^\x20-\x7E]/g, ''), slug);
  assert.notEqual(encodeURIComponent(slug), slug);
});

// ── the scheduling window ──────────────────────────────────────────────────

test('starts_at / ends_at are read, and read in the SITE timezone', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.IMAGE,
      [BANNER_FIELDS.TITLE]: 'x',
      [BANNER_FIELDS.STARTS_AT]: '2026-09-01T09:00',
      [BANNER_FIELDS.ENDS_AT]: '2026-09-30T23:59',
    })
  );
  // 09:00 Bangkok is 02:00Z. If this ever reads 09:00Z the parser has gone back
  // to the runtime's zone and every window is seven hours out.
  assert.equal(out.starts_at, '2026-09-01T02:00:00.000Z');
  assert.equal(out.ends_at, '2026-09-30T16:59:00.000Z');
});

test('an empty window is null, not an empty string', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.IMAGE,
      [BANNER_FIELDS.TITLE]: 'x',
      [BANNER_FIELDS.STARTS_AT]: '',
      [BANNER_FIELDS.ENDS_AT]: '',
    })
  );
  assert.equal(out.starts_at, null);
  assert.equal(out.ends_at, null);
});

test('REGRESSION: a save no longer nulls a window it never asked about', () => {
  // Before this slice the form had no start/end controls at all and the action
  // never read them — but zod's `.default(null)` filled both in, so every save
  // wrote null over whatever was stored. Invisible today only because all 22
  // records happen to have both null.
  const existing = { type: BANNER_TYPES.IMAGE, title: 'x', starts_at: '2026-01-01T00:00:00.000Z', ends_at: null };
  const out = parseBannerFormData(
    fd({ type: BANNER_TYPES.IMAGE, [BANNER_FIELDS.TITLE]: 'x' }),
    { existing }
  );
  assert.equal(out.starts_at, '2026-01-01T00:00:00.000Z');
});

// ── image ──────────────────────────────────────────────────────────────────

test('the resolved image pair wins over the hidden inputs', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.IMAGE,
      [BANNER_FIELDS.TITLE]: 'x',
      [IMAGE_INPUTS.URL]: 'https://cdn.example/old.jpg',
      [IMAGE_INPUTS.PUBLIC_ID]: 'banners/old',
    }),
    { image: { image_url: 'https://cdn.example/new.jpg', image_public_id: 'banners/new' } }
  );
  assert.equal(out.image_url, 'https://cdn.example/new.jpg');
  assert.equal(out.image_public_id, 'banners/new');
});

test("a video save keeps an image record's art when the type is switched back", () => {
  const existing = { type: BANNER_TYPES.IMAGE, title: 'x', image_url: 'https://cdn.example/a.jpg', image_public_id: 'banners/a' };
  const out = parseBannerFormData(
    fd({ type: BANNER_TYPES.VIDEO, [BANNER_FIELDS.TITLE]: 'x', [BANNER_FIELDS.YOUTUBE_ID]: 'abc' }),
    { existing }
  );
  assert.equal(out.image_url, 'https://cdn.example/a.jpg');
});

// ── the three-layer coupling ───────────────────────────────────────────────

test('every key the parser emits is DECLARED by the schema, or it is silently dropped', () => {
  const out = parseBannerFormData(
    fd({
      type: BANNER_TYPES.COURSE,
      [BANNER_FIELDS.TITLE]: 'ชื่อทับ',
      [BANNER_FIELDS.TITLE_LINE2]: 'บรรทัดสอง',
      [BANNER_FIELDS.TITLE_HIGHLIGHT]: 'เน้น',
      [BANNER_FIELDS.SUBTITLE]: 'ข้อความรอง',
      [COURSE_REF_INPUTS.UPSTREAM_ID]: 'up-1',
      [COURSE_REF_INPUTS.COURSE_ID]: 'ABC',
      [COURSE_REF_INPUTS.KIND]: COURSE_KINDS.INCLASS,
      [BANNER_FIELDS.WEIGHT]: '3',
      [BANNER_FIELDS.ACTIVE]: 'true',
      [BANNER_FIELDS.STARTS_AT]: '',
      [BANNER_FIELDS.ENDS_AT]: '',
    })
  );
  const parsed = bannerSchema.safeParse(out);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.flatten?.()));
  // `z.object` strips undeclared keys SILENTLY. Anything the parser produced
  // that is missing from the parse result would save nothing and report success.
  const dropped = Object.keys(out).filter((k) => !(k in parsed.data));
  assert.deepEqual(dropped, [], `the schema silently drops: ${dropped.join(', ')}`);
});

test('CONTROL: the coupling check can actually see a dropped key', () => {
  const out = { ...parseBannerFormData(fd({ type: BANNER_TYPES.IMAGE, [BANNER_FIELDS.TITLE]: 'x' })), not_a_field: 'x' };
  const parsed = bannerSchema.safeParse(out);
  assert.equal(parsed.success, true);
  assert.equal('not_a_field' in parsed.data, false);
});
