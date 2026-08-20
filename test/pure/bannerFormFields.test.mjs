import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANNER_FIELDS,
  FIELD_HIDDEN,
  FIELD_OPTIONAL,
  FIELD_REQUIRED,
  REF_BACKED_TYPES,
  fieldState,
  fieldsForType,
  isRefBackedBannerType,
  linkUrlRejectsYouTube,
  requiresField,
  showsField,
  shownFields,
} from '@/lib/banners/bannerFormFields';
import {
  BANNER_TYPES,
  BANNER_TYPE_IDS,
  LEGACY_TYPES,
  LEGACY_TYPE_IDS,
  LEGACY_TO_NEW,
} from '@/lib/banners/bannerTypes';

/**
 * THE PER-TYPE FIELD TABLE, AND THE THREE SUBSTRING TESTS IT REPLACES.
 *
 * ── WHAT THIS FILE IS REALLY GUARDING ───────────────────────────────────────
 * BannerForm decided its entire layout from three derived booleans:
 *
 *     const isYouTube = type === LEGACY_TYPES.YOUTUBE;
 *     const isImage   = type.startsWith(BANNER_TYPES.IMAGE);
 *     const hasButton = type.includes('button');
 *
 * The dangerous one is `startsWith`, and it is dangerous in a way that is easy
 * to talk yourself out of: it produces the RIGHT answer for `course` today.
 * `'course'.startsWith('image')` is false, so a course record was never going
 * to be offered the image upload — by accident, not by design, and only for as
 * long as nobody adds a type whose id happens to begin with those five letters.
 * A test that only checks "course has no image field" therefore passes just as
 * happily against the broken code, which makes it worthless as a guard.
 *
 * So this file asserts the property that the two implementations DISAGREE on:
 * the table answers about the ids `startsWith` cannot see, and answers `hidden`
 * for cells `startsWith` would have answered `shown` for. The controls at the
 * bottom demonstrate that the old predicates really do give the wrong answers,
 * so "the substring tests are gone" is a measured claim rather than a promise.
 */

// ── The table's shape ───────────────────────────────────────────────────────

test('all four current types have a complete row', () => {
  for (const id of BANNER_TYPE_IDS) {
    const row = fieldsForType(id);
    assert.ok(Object.keys(row).length > 0, `${id} has no row at all`);
  }
});

test('every cell holds one of the three states, never a bare boolean', () => {
  const legal = new Set([FIELD_REQUIRED, FIELD_OPTIONAL]);
  for (const id of BANNER_TYPE_IDS) {
    for (const [field, state] of Object.entries(fieldsForType(id))) {
      assert.ok(legal.has(state), `${id}.${field} is ${JSON.stringify(state)}`);
    }
  }
});

test('a field the row omits reads as hidden, not undefined', () => {
  assert.equal(fieldState(BANNER_TYPES.COURSE, BANNER_FIELDS.IMAGE), FIELD_HIDDEN);
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.IMAGE), false);
  assert.equal(requiresField(BANNER_TYPES.COURSE, BANNER_FIELDS.IMAGE), false);
});

// ── The spec, cell by cell ──────────────────────────────────────────────────

test('title is on all four — required on video/image, optional on course/article', () => {
  for (const id of BANNER_TYPE_IDS) {
    assert.ok(showsField(id, BANNER_FIELDS.TITLE), `${id} has no title field`);
  }
  assert.equal(requiresField(BANNER_TYPES.VIDEO, BANNER_FIELDS.TITLE), true);
  assert.equal(requiresField(BANNER_TYPES.IMAGE, BANNER_FIELDS.TITLE), true);
  assert.equal(requiresField(BANNER_TYPES.COURSE, BANNER_FIELDS.TITLE), false);
  assert.equal(requiresField(BANNER_TYPES.ARTICLE, BANNER_FIELDS.TITLE), false);
});

test('title_line2, title_highlight and subtitle are on all four', () => {
  for (const field of [
    BANNER_FIELDS.TITLE_LINE2,
    BANNER_FIELDS.TITLE_HIGHLIGHT,
    BANNER_FIELDS.SUBTITLE,
  ]) {
    for (const id of BANNER_TYPE_IDS) {
      assert.equal(showsField(id, field), true, `${id} is missing ${field}`);
    }
  }
});

test('subtitle is on COURSE specifically — the ruling, not an oversight', () => {
  // A course has no upstream source for a subtitle: there is no `title` field
  // on an MSDB course (measured: 39 keys across all 79 rows, none of them
  // `title`), so `course_teaser` is the description and `course_name` the short
  // name. The admin types the subtitle. Pinned on its own because the tempting
  // "course derives everything" simplification would delete exactly this cell.
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.SUBTITLE), true);
  assert.equal(requiresField(BANNER_TYPES.COURSE, BANNER_FIELDS.SUBTITLE), false);
});

test('description is video and image only — course and article have a source', () => {
  assert.equal(showsField(BANNER_TYPES.VIDEO, BANNER_FIELDS.DESCRIPTION), true);
  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.DESCRIPTION), true);
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.DESCRIPTION), false);
  assert.equal(showsField(BANNER_TYPES.ARTICLE, BANNER_FIELDS.DESCRIPTION), false);
});

test('youtube_id is video only, and required there', () => {
  assert.equal(requiresField(BANNER_TYPES.VIDEO, BANNER_FIELDS.YOUTUBE_ID), true);
  for (const id of [BANNER_TYPES.IMAGE, BANNER_TYPES.COURSE, BANNER_TYPES.ARTICLE]) {
    assert.equal(showsField(id, BANNER_FIELDS.YOUTUBE_ID), false, id);
  }
});

test('the image upload is image only, and required there', () => {
  assert.equal(requiresField(BANNER_TYPES.IMAGE, BANNER_FIELDS.IMAGE), true);
  for (const id of [BANNER_TYPES.VIDEO, BANNER_TYPES.COURSE, BANNER_TYPES.ARTICLE]) {
    assert.equal(showsField(id, BANNER_FIELDS.IMAGE), false, id);
  }
});

test('the course picker is course only, and required there', () => {
  assert.equal(requiresField(BANNER_TYPES.COURSE, BANNER_FIELDS.COURSE_REF), true);
  for (const id of [BANNER_TYPES.VIDEO, BANNER_TYPES.IMAGE, BANNER_TYPES.ARTICLE]) {
    assert.equal(showsField(id, BANNER_FIELDS.COURSE_REF), false, id);
  }
});

test('the article picker is article only, and required there', () => {
  assert.equal(requiresField(BANNER_TYPES.ARTICLE, BANNER_FIELDS.ARTICLE_SLUG), true);
  for (const id of [BANNER_TYPES.VIDEO, BANNER_TYPES.IMAGE, BANNER_TYPES.COURSE]) {
    assert.equal(showsField(id, BANNER_FIELDS.ARTICLE_SLUG), false, id);
  }
});

test('feature_tags is video and image — course and article derive their chips', () => {
  assert.equal(showsField(BANNER_TYPES.VIDEO, BANNER_FIELDS.FEATURE_TAGS), true);
  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.FEATURE_TAGS), true);
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.FEATURE_TAGS), false);
  assert.equal(showsField(BANNER_TYPES.ARTICLE, BANNER_FIELDS.FEATURE_TAGS), false);
});

test('link_url is image and video; link_text is IMAGE ONLY', () => {
  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.LINK_URL), true);
  assert.equal(showsField(BANNER_TYPES.VIDEO, BANNER_FIELDS.LINK_URL), true);
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.LINK_URL), false);
  assert.equal(showsField(BANNER_TYPES.ARTICLE, BANNER_FIELDS.LINK_URL), false);

  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.LINK_TEXT), true);
  for (const id of [BANNER_TYPES.VIDEO, BANNER_TYPES.COURSE, BANNER_TYPES.ARTICLE]) {
    assert.equal(showsField(id, BANNER_FIELDS.LINK_TEXT), false, id);
  }
});

test('link_url refuses a YouTube URL on video, and only on video', () => {
  assert.equal(linkUrlRejectsYouTube(BANNER_TYPES.VIDEO), true);
  assert.equal(linkUrlRejectsYouTube(BANNER_TYPES.IMAGE), false);
  assert.equal(linkUrlRejectsYouTube(BANNER_TYPES.COURSE), false);
  assert.equal(linkUrlRejectsYouTube(BANNER_TYPES.ARTICLE), false);
  // …and the rule follows a LEGACY youtube record through normalisation, which
  // is the case that matters: all six stored ones carry a watch URL there.
  assert.equal(linkUrlRejectsYouTube(LEGACY_TYPES.YOUTUBE), true);
});

test('weight / active / starts_at / ends_at are on all four', () => {
  for (const field of [
    BANNER_FIELDS.WEIGHT,
    BANNER_FIELDS.ACTIVE,
    BANNER_FIELDS.STARTS_AT,
    BANNER_FIELDS.ENDS_AT,
  ]) {
    for (const id of BANNER_TYPE_IDS) {
      assert.equal(showsField(id, field), true, `${id} is missing ${field}`);
    }
  }
});

// ── Legacy ids reach the same row as the id they migrate to ────────────────

test('every legacy id renders exactly the row of the type it becomes', () => {
  for (const legacy of LEGACY_TYPE_IDS) {
    assert.deepEqual(
      fieldsForType(legacy),
      fieldsForType(LEGACY_TO_NEW[legacy]),
      `${legacy} does not render the same fields as ${LEGACY_TO_NEW[legacy]}`
    );
  }
});

test('an unknown type gets an EMPTY row, never a default one', () => {
  // A record carrying a type nothing knows must fall out of every branch and be
  // visibly empty, not be quietly treated as an image. `image_slideshow` is the
  // shape that would slip past `startsWith('image')`.
  assert.deepEqual(fieldsForType('image_slideshow'), {});
  assert.deepEqual(fieldsForType('gallery'), {});
  assert.deepEqual(fieldsForType(undefined), {});
  assert.deepEqual(fieldsForType(null), {});
  assert.equal(showsField('image_slideshow', BANNER_FIELDS.IMAGE), false);
});

// ── THE DEAD SUBSTRING TESTS ───────────────────────────────────────────────

test('PROOF: a course record is not offered the image upload', () => {
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.IMAGE), false);
  assert.equal(shownFields(BANNER_TYPES.COURSE).includes(BANNER_FIELDS.IMAGE), false);
});

test('PROOF: `startsWith` and the table DISAGREE, so the assertion above is not vacuous', () => {
  // The point of this file. `startsWith('image')` gives the right answer for
  // `course` today — so a test that only asserts "course has no image field"
  // would pass against the OLD code too. These are the inputs where the two
  // predicates part company, and they are what makes the change observable.
  const startsWith = (t) => String(t).startsWith(BANNER_TYPES.IMAGE);
  const includesButton = (t) => String(t).includes('button');

  // 1. An id the old predicate would have WRONGLY admitted to the image upload.
  assert.equal(startsWith('image_slideshow'), true);
  assert.equal(showsField('image_slideshow', BANNER_FIELDS.IMAGE), false);

  // 2. link_text: the old rule needed the word "button" IN THE ID. None of the
  //    four new ids contains it, so `image` — the one type that should have the
  //    field — would have lost it.
  assert.equal(includesButton(BANNER_TYPES.IMAGE), false);
  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.LINK_TEXT), true);

  // 3. …and `image_button_desktop` DID contain it, and still gets link_text —
  //    via the type it normalises to, not via a word in its name.
  assert.equal(includesButton(LEGACY_TYPES.IMAGE_BUTTON_DESKTOP), true);
  assert.equal(showsField(LEGACY_TYPES.IMAGE_BUTTON_DESKTOP, BANNER_FIELDS.LINK_TEXT), true);

  // 4. The old `isYouTube` was equality against the LEGACY id, so a record
  //    saved as `video` offered no YouTube-id field at all — the one field that
  //    type cannot render without.
  assert.equal(BANNER_TYPES.VIDEO === LEGACY_TYPES.YOUTUBE, false);
  assert.equal(requiresField(BANNER_TYPES.VIDEO, BANNER_FIELDS.YOUTUBE_ID), true);
});

test('CONTROL: the table can answer TRUE, so the "false" results above mean something', () => {
  // Both scans above are mostly "is false" assertions, which pass just as
  // happily against a table that answers false for everything.
  assert.equal(showsField(BANNER_TYPES.IMAGE, BANNER_FIELDS.IMAGE), true);
  assert.equal(showsField(BANNER_TYPES.COURSE, BANNER_FIELDS.COURSE_REF), true);
  assert.ok(shownFields(BANNER_TYPES.COURSE).length >= 9);
});

// ── REF_BACKED_TYPES ───────────────────────────────────────────────────────

test('the ref-backed types are exactly course and article, derived from the table', () => {
  assert.deepEqual([...REF_BACKED_TYPES].sort(), [BANNER_TYPES.ARTICLE, BANNER_TYPES.COURSE].sort());
});

test('isRefBackedBannerType folds legacy ids first', () => {
  assert.equal(isRefBackedBannerType(BANNER_TYPES.COURSE), true);
  assert.equal(isRefBackedBannerType(BANNER_TYPES.ARTICLE), true);
  assert.equal(isRefBackedBannerType(BANNER_TYPES.VIDEO), false);
  assert.equal(isRefBackedBannerType(BANNER_TYPES.IMAGE), false);
  // The five stored ids all become video/image, so none of them is ref-backed
  // and every one of the 22 documents still needs its title.
  for (const legacy of LEGACY_TYPE_IDS) {
    assert.equal(isRefBackedBannerType(legacy), false, legacy);
  }
  assert.equal(isRefBackedBannerType('nonsense'), false);
});
