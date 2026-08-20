/**
 * Banner records → the Feature Content section's view model.
 *
 * ── THIS IS THE ONLY FILE THAT KNOWS WHAT A BANNER LOOKS LIKE ───────────────
 * Every coercion, fallback, type decision and URL rule lives here. The three
 * components downstream receive plain view-model objects and have never heard
 * of `image_button_desktop`, `slide_text` or `youtube_id`. That is the whole
 * point: Step C reworks the Banner type system, and when it does, THIS FILE is
 * the diff. If you find yourself adding `banner.` to a component, the seam has
 * been broken and the next schema change becomes a six-file change again.
 *
 * READ-ONLY. No query, no write, no model import — the caller hands us the
 * array that `getLandingData()` already put on the page (the `landing_cache`
 * snapshot). Step B adds no database access of any kind.
 *
 * ── WHAT IS DELIBERATELY MISSING ────────────────────────────────────────────
 * Eight text slots were designed; the Banner model can supply three of them.
 * Measured against the live collection (15 active records):
 *
 *     eyebrow          NONE      — derived from `type` below, not stored
 *     title line 1     title            15/15
 *     title line 2     NONE      — `title` is one field with no split marker
 *     subtitle         NONE
 *     description      slide_text        5/15  (youtube only)
 *     media-type chip  NONE      — derived from `type`
 *     level chip       NONE
 *     duration chip    NONE
 *
 * The three meta chips are fed instead by `feature_tags`, which every youtube
 * record carries three of. Image records carry none, so their whole chip row
 * and its divider collapse.
 *
 * Absent slots are returned as `null`, never as `''` and never as placeholder
 * copy. `null` is what lets a component drop the element entirely rather than
 * render an empty box — an empty string still occupies a line and still draws
 * a divider above it.
 */

import {
  BANNER_TYPE_IDS,
  BANNER_TYPES,
  LEGACY_TO_NEW,
  LEGACY_TYPES,
} from '@/lib/banners/bannerTypes';
import { resolveBannerLink, warnBlockedBannerLink } from '@/lib/bannerLinkUrl';
import { coursePriceLabel, isInhouseOnlyPrice } from '@/lib/coursePriceLabel';
import { courseHref } from '@/lib/utils';
import { onlineCourseHref } from '@/lib/onlineCourseHref';

/** The section's own chrome. Not from the database — there is no field for it. */
export const FEATURE_CONTENT_COPY = {
  eyebrow: 'FEATURED CONTENT',
  title: 'คอนเทนต์เด่นประจำสัปดาห์',
  description:
    'คัดสรรเนื้อหายอดนิยม ทั้งคอร์สเรียน วิดีโอ และบทความ ที่จะช่วยพัฒนาทักษะและเพิ่มประสิทธิภาพการทำงานของคุณ',
};

/**
 * The types that may enter the pool, and the order is NOT alphabetical — it is
 * a comment about which slot each one can physically fill.
 *
 *   youtube        → 16:9 thumbnail from the video id. Carries slide_text and
 *                    three feature_tags, so it fills the most slots.
 *   image_desktop  → 2.74 landscape art. Title + image + link, nothing else.
 *
 * EXCLUDED, and each for its own reason:
 *   image_mobile          — 360×584 PORTRAIT. This design has no portrait slot
 *                           at any breakpoint, mobile included. It is also the
 *                           same content as its desktop twin (verified: on all
 *                           five live pairs both `title` and `link_url` are
 *                           byte-identical), so admitting it would show every
 *                           promotion twice. Consequence for Step C: with the
 *                           carousel dormant these records now have NO consumer
 *                           anywhere on the public site.
 *   image_button_desktop  — one record, inactive. Zero live.
 *   image_button_mobile   — the type has never had a single record.
 */
const POOL_TYPES = [
  // The two legacy ids that have live records today.
  LEGACY_TYPES.YOUTUBE,
  LEGACY_TYPES.IMAGE_DESKTOP,
  // And all four new ids, so a record saved in the new shape enters the pool
  // without waiting for the migration. Spread from BANNER_TYPE_IDS rather than
  // listed, so a fifth type cannot be added to the system and silently omitted
  // here — the one-home rule this section is built on.
  ...BANNER_TYPE_IDS,
];

const YOUTUBE_HOSTS = /(^|\.)(youtube\.com|youtu\.be)$/i;

/** Trim, and turn "nothing" into null rather than ''. See the header. */
function text(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length ? s : null;
}

/**
 * Is this URL pointing at YouTube?
 *
 * Used to decide that a `link_url` is the VIDEO target rather than a details
 * page. On all five live youtube records `link_url` is the watch URL for the
 * same id already in `youtube_id`, so treating it as a details link would put
 * two buttons on the card that go to exactly the same place.
 *
 * Parsed with `URL`, not matched with a substring: `?next=youtube.com` and
 * `https://evil.example/youtube.com` both contain the string and neither is
 * YouTube. A parse failure returns false — a malformed URL is not a video
 * link, and bannerLinkUrl.js already owns the question of whether a malformed
 * link should reach the browser at all.
 */
function isYouTubeUrl(url) {
  try {
    return YOUTUBE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * YouTube's own thumbnail for a video id, plus the fallback.
 *
 * `maxresdefault` is 1280×720 and exists for all five live ids today — but it
 * is generated only for videos uploaded above a certain resolution, so it 404s
 * on plenty of others. `hqdefault` (480×360) is guaranteed. The component swaps
 * to the fallback on the image's error event; the pair is produced here so the
 * component does not have to know how a YouTube CDN path is spelled.
 *
 * i.ytimg.com is already in next.config.mjs `images.remotePatterns`.
 */
function youtubeThumbnails(id) {
  return {
    image: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    imageFallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/** The default crop anchor. Named so the fallback is greppable. */
export const CENTRE = '50% 50%';

/**
 * The stored focal point as a CSS `object-position` value, or the centre.
 *
 * ── THIS IS THE ONE PLACE "ABSENT MEANS CENTRE" IS WRITTEN DOWN ─────────────
 * Three frames crop these banners — the desktop stage at 12:5 and both 16:9
 * frames (the mobile stage and the strip card) — and each of them renders this
 * string. If the fallback lived at the call sites there would be three copies
 * of it, and the failure when one drifted would be a picture that is cropped
 * differently in the strip than in the stage it feeds, which reads as a
 * rendering fault rather than as a missing default.
 *
 * ── WHY IT RETURNS THE CSS STRING AND NOT {x, y} ────────────────────────────
 * `object-position` already takes two percentages in exactly the order and
 * units the field stores, so there is nothing to convert — and a conversion
 * step is a place for the two ends to disagree. Components set this straight
 * onto `style`; none of them does arithmetic on it.
 *
 * ── WHY `style` AND NOT A TAILWIND CLASS ────────────────────────────────────
 * The value is a per-record measurement out of the database. There is no class
 * for "34% 61%" and Tailwind could not emit one if there were — the same rule
 * the strip's thumb geometry already follows.
 *
 * Both coordinates must be finite numbers. A half-set focal point ({x} with no
 * {y}) would otherwise produce `object-position: 34% undefined%`, which the
 * browser drops silently — leaving the crop centred while the record claims
 * otherwise, which is worse than having no field. zod refuses that shape on the
 * way in; this refuses it on the way out, because the snapshot is Mixed and can
 * hold whatever was written before the schema tightened.
 */
export function focalPosition(banner) {
  const x = coordinate(banner?.image_focal?.x);
  const y = coordinate(banner?.image_focal?.y);
  if (x === null || y === null) return CENTRE;
  return x + '% ' + y + '%';
}

/**
 * One stored coordinate → a percentage, or null when it is not one.
 *
 * ── `Number()` ALONE IS NOT THE TEST, AND THAT IS THE WHOLE FUNCTION ────────
 * `Number(null)`, `Number('')`, `Number(false)` and `Number([])` are all 0 —
 * a finite number, in range, indistinguishable from an admin deliberately
 * anchoring at the left edge. So `{x: null, y: 40}` would render as `0% 40%`:
 * a confidently wrong crop, from a record that set nothing. Half a focal point
 * has to fall back to the centre like no focal point at all, which means the
 * TYPE has to be checked before the value.
 *
 * A numeric STRING is still accepted. This reads the `landing_cache` snapshot,
 * which is a Mixed column and has been through JSON.parse(JSON.stringify(…)) —
 * and the admin form will post strings. Refusing '30' would make the field work
 * everywhere except where it is actually written.
 *
 * Clamped rather than refused when out of range: a negative object-position is
 * legal CSS that moves the picture OUT of its box and leaves a strip of panel
 * showing along one edge. Nothing an admin can type should be able to do that,
 * and a stored -20 is far more likely to be a slipped decimal than a request.
 */
function coordinate(value) {
  const ok =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '');
  if (!ok) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * Is this banner live right now?
 *
 * The snapshot is written by `getActiveBanners()`, which already applies both
 * of these — so this is a second check, not the first one, and it is here
 * because the snapshot can be up to a sync-interval stale and a window that
 * closed since the last sync would otherwise keep showing. Cheap, and it makes
 * the module correct on any input rather than only on pre-filtered input.
 */
function isLive(banner, now) {
  if (banner?.active !== true) return false;
  if (banner.starts_at && new Date(banner.starts_at) > now) return false;
  if (banner.ends_at && new Date(banner.ends_at) < now) return false;
  return true;
}

/**
 * Per-type presentation, as COMPLETE LITERAL maps keyed by the normalised type.
 *
 * Four types now, and each of these used to be a ternary on `isVideo` that
 * silently answered "image" for everything else. A ternary does not extend to
 * four cases; it just picks the wrong one quietly, which is the failure this
 * whole section keeps meeting. A map with an explicit fallback says which case
 * is the default and makes a missing entry visible as the default rather than
 * as a lie.
 *
 * `tone` is a KEY into the strip's palette, never a class string -- the same
 * rule TONE_CLASSES states there, because a class assembled from a variable
 * compiles to nothing at all while the markup still looks perfect.
 */
const BADGE_BY_TYPE = {
  [BANNER_TYPES.VIDEO]: 'วิดีโอแนะนำ',
  [BANNER_TYPES.IMAGE]: 'แนะนำสำหรับคุณ',
  [BANNER_TYPES.COURSE]: 'คอร์สแนะนำ',
  [BANNER_TYPES.ARTICLE]: 'บทความแนะนำ',
};

const TONE_BY_TYPE = {
  [BANNER_TYPES.VIDEO]: 'red',
  [BANNER_TYPES.IMAGE]: 'cyan',
  [BANNER_TYPES.COURSE]: 'gold',
  [BANNER_TYPES.ARTICLE]: 'cyan',
};

const CARD_BADGE_BY_TYPE = {
  [BANNER_TYPES.VIDEO]: 'YouTube',
  [BANNER_TYPES.IMAGE]: 'แนะนำ',
  [BANNER_TYPES.COURSE]: 'คอร์สเรียน',
  [BANNER_TYPES.ARTICLE]: 'บทความ',
};

/**
 * Level and duration chips for a course, in the shape the chip row already
 * renders ({icon, line1, line2}).
 *
 * The icon names are KEYS into the component's TAG_ICONS map, not components:
 * a database can store "Award" and cannot store a React component, and the same
 * rule applies to a derived chip so the two sources stay interchangeable.
 *
 * Every chip is dropped when its source is absent rather than rendered empty.
 * An online course has no `course_trainingdays` at all, so it gets a lessons
 * chip or no chip, never "0 วัน".
 */
const COURSE_LEVEL_LABELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

function courseMeta(course, online) {
  const chips = [];

  const levelKey = Number(online ? course.o_course_levels : course.course_levels);
  const level = COURSE_LEVEL_LABELS[levelKey];
  if (level) chips.push({ icon: 'Award', line1: 'ระดับ', line2: level });

  if (online) {
    const lessons = Number(course.o_number_lessons);
    const hours = Number(course.o_course_traininghours);
    if (Number.isFinite(lessons) && lessons > 0) {
      chips.push({ icon: 'BookOpen', line1: 'บทเรียน', line2: String(lessons) });
    }
    if (Number.isFinite(hours) && hours > 0) {
      chips.push({ icon: 'Zap', line1: 'ระยะเวลา', line2: hours + ' ชม.' });
    }
  } else {
    const days = Number(course.course_trainingdays);
    const hours = Number(course.course_traininghours);
    if (Number.isFinite(days) && days > 0) {
      const line2 = Number.isFinite(hours) && hours > 0
        ? days + ' วัน (' + hours + ' ชม.)'
        : days + ' วัน';
      chips.push({ icon: 'Zap', line1: 'ระยะเวลา', line2 });
    }
  }

  // THREE is what the chip row draws, and the cap is applied here so a fourth
  // source added later cannot silently overflow the grid.
  return chips.slice(0, 3);
}

/**
 * The price line under a strip card's title. `course` records only.
 *
 * THE WORDING IS NOT DECIDED HERE. `coursePriceLabel` owns "what does a course
 * with no public price say", and it exists because seven surfaces each answered
 * that separately and four of them glued a baht suffix onto the answer. This is
 * the eighth surface and it asks rather than deciding again -- including the
 * suffix rule, which is why `.-` is passed as `suffix` rather than concatenated.
 *
 * `was` is populated ONLY for a real discount. A netprice equal to or above the
 * list price, struck through next to itself, is not a saving; it is a rendering
 * fault that looks like a promotion.
 */
function coursePrice(course, online) {
  const list = online ? course.o_course_price : course.course_price;
  const net = online ? course.o_course_netprice : course.course_netprice;

  if (isInhouseOnlyPrice(list) && isInhouseOnlyPrice(net)) {
    return { prefix: null, now: coursePriceLabel(list), was: null };
  }

  const listN = Number(list);
  const netN = Number(net);
  const discounted =
    !isInhouseOnlyPrice(net) && Number.isFinite(netN)
    && Number.isFinite(listN) && netN < listN;

  return {
    prefix: 'ราคา',
    now: coursePriceLabel(discounted ? netN : listN, { suffix: '.-' }),
    was: discounted ? coursePriceLabel(listN, { suffix: '.-' }) : null,
  };
}

/**
 * One Banner -> one view-model item, or null if it cannot fill the slot.
 *
 * `resolved` is what featureContentRefs found for THIS banner -- `{course,
 * online}` or `{article}` -- and is undefined for video and image records,
 * which reference nothing.
 *
 * THIS FUNCTION LOOKS NOTHING UP. That is the seam that keeps the module pure
 * and testable with no database, and it is why the resolver and not the mapper
 * owns the warning about a reference that went nowhere.
 */
function toItem(banner, resolved) {
  // NORMALISED, and every branch below reads this -- never `banner.type`.
  // 'youtube' -> 'video', 'image_desktop' -> 'image'. A record already stored
  // under a new id passes through unchanged. Nothing here does a substring test
  // on a type string: `startsWith('image')` answers true for four different
  // legacy ids AND for the new one, which is the bug that shape always becomes.
  const type = LEGACY_TO_NEW[banner.type] ?? banner.type;
  const isVideo = type === BANNER_TYPES.VIDEO;
  const isCourse = type === BANNER_TYPES.COURSE;
  const isArticle = type === BANNER_TYPES.ARTICLE;
  const videoId = text(banner.youtube_id);

  // Presence IS the discriminator -- see the note in featureContentRefs on why
  // there is no `kind` string here.
  const course = resolved?.course ?? null;
  const online = Boolean(resolved?.online);
  const article = resolved?.article ?? null;

  // ── A REFERENCE THAT DID NOT RESOLVE IS A DROPPED ITEM, NEVER A CARD ──────
  // Never a dead link, never a placeholder. The warning that names the record
  // and the reference is emitted by the resolver, which is the only place the
  // REASON is known (missing / not found / hidden need different fixes).
  if (isCourse && !course) return null;
  if (isArticle && !article) return null;

  // An item with no picture has no card. The featured slot IS an image slot.
  // A course or article cover comes from the resolved record, with the banner's
  // own upload as an OVERRIDE: an admin who uploaded artwork for this banner
  // meant it to win over the generic course cover.
  const bannerImage = text(banner.image_url);
  let media = null;
  if (isVideo) {
    media = videoId ? youtubeThumbnails(videoId) : null;
  } else if (isCourse) {
    const cover = bannerImage
      ?? text(online ? course.o_course_cover_url : course.course_cover_url);
    media = cover ? { image: cover, imageFallback: null } : null;
  } else if (isArticle) {
    const cover = bannerImage ?? text(article.coverUrl);
    media = cover ? { image: cover, imageFallback: null } : null;
  } else {
    media = bannerImage ? { image: bannerImage, imageFallback: null } : null;
  }
  if (!media) return null;

  // The admin's headline wins; the record's own name is the fallback, so a
  // course banner saved with no title still renders instead of being dropped.
  const courseName = course
    ? text(online ? course.o_course_name : course.course_name)
    : null;
  const title = text(banner.title) ?? courseName ?? (article ? text(article.title) : null);
  if (!title) return null;

  const link = text(banner.link_url);

  // `ดูรายละเอียด` needs a page that is NOT the video itself. Every live video
  // record's link_url is the watch URL for the id already in `youtube_id`, so
  // without this test the button would point at the thing the card already
  // plays inline.
  //
  // ── COURSE AND ARTICLE DERIVE A DESTINATION WHEN THE ADMIN GAVE NONE ──────
  // Unlike image and video, these two KNOW where they point: the course detail
  // page and /articles/<slug>. A stored link_url still wins -- an admin who
  // typed a promo landing page meant it -- but its absence is not a reason to
  // render a card with no way through to the thing it advertises.
  let detailsUrl = link && !isYouTubeUrl(link) ? link : null;
  if (!detailsUrl && isCourse) {
    detailsUrl = online
      ? onlineCourseHref(course)
      : courseHref(String(course.course_id ?? '').trim().toLowerCase());
  }
  if (!detailsUrl && isArticle) {
    detailsUrl = '/articles/' + article.slug;
  }

  // Internal / external / mailto / refused -- the SAME rules the carousel uses,
  // resolved here so no component has to know them. `blocked` warns once and
  // renders unlinked rather than silently dropping the link.
  const resolvedLink = resolveBannerLink(detailsUrl);
  if (resolvedLink.kind === 'blocked') warnBlockedBannerLink(banner);
  const href = resolvedLink.href;
  const linkKind = resolvedLink.kind;

  // feature_tags is the stored source for the chip row and only youtube records
  // carry any. A course DERIVES its chips from the resolved record instead --
  // level and duration were two of the eight designed slots that had no source
  // until this slice. A stored tag still wins, so an admin can override.
  const storedMeta = (Array.isArray(banner.feature_tags) ? banner.feature_tags : [])
    .slice(0, 3)
    .map((tag) => ({
      icon: text(tag?.icon),
      line1: text(tag?.line1),
      line2: text(tag?.line2),
    }))
    .filter((tag) => tag.line1 || tag.line2);
  const meta = storedMeta.length
    ? storedMeta
    : (course ? courseMeta(course, online) : []);

  return {
    id: String(banner._id ?? (type + '-' + (banner.weight ?? 0))),
    type,
    isVideo,
    isImage: type === BANNER_TYPES.IMAGE,
    isCourse,
    isArticle,

    // ── The eight designed slots ──
    // The badge is derived from the type and always has been -- there is no
    // stored field for it, and four types need four words.
    badge: BADGE_BY_TYPE[type] ?? BADGE_BY_TYPE[BANNER_TYPES.IMAGE],
    kicker: null, // no source on any type
    title,
    // ── title_line2 / title_highlight, WIRED AT LAST ──────────────────────
    // Both fields have existed on the model since the four-type rework and
    // nothing read them. They are authored per record because no source --
    // banner, course or article -- supplies a second or third headline line.
    titleAccent: text(banner.title_line2),
    titleHighlight: text(banner.title_highlight),
    // A course's own short name is the natural subtitle under an admin-authored
    // headline. It is NOT used when the headline already IS that name, because
    // the same string twice reads as a rendering fault.
    subtitle: text(banner.subtitle)
      ?? (courseName && courseName !== title ? courseName : null),
    // `description ?? slide_text` is the model's own stated rule (see the note
    // on slide_text in models/Banner.js), extended per type with the resolved
    // record's own long copy as the last fallback.
    //
    // ARTICLE EXCERPTS ARE LEFT EMPTY WHEN ABSENT AND NEVER MACHINE-TRUNCATED.
    // Measured: 156 of 488 articles carry one, so ~68% of them reach this with
    // nothing. Slicing `content` to a length would cut mid-word -- Thai has no
    // inter-word spaces, so there is no safe boundary to cut on and the result
    // is a broken syllable, not a teaser. An empty description collapses.
    description: text(banner.description)
      ?? text(banner.slide_text)
      ?? (course ? text(online ? course.o_course_teaser : course.course_teaser) : null)
      ?? (article ? text(article.excerpt) : null),
    meta,

    // ── Media ──
    ...media,
    imageAlt: title,
    // Where the crop must keep. Every frame that covers this picture reads it;
    // absent on the record means the centre. See focalPosition above.
    //
    // Set on EVERY type, not only `image`. A course cover and an article cover
    // are cropped by the same three frames, and a video thumbnail is already
    // 16:9 so the value is inert there rather than wrong — which is better than
    // a field that exists on some items and is undefined on others.
    objectPosition: focalPosition(banner),

    // ── Actions ──
    href,
    linkKind,
    // The admin's own label for the button, when they typed one. This is a
    // REAL authorable field, not a placeholder: BannerForm has the input and
    // createBanner/updateBanner both persist it. Measured: all five image
    // records render the fallback label, so nothing fills this today and the
    // fallback is the path production actually runs -- which is the one worth
    // proving before anything does fill it.
    //
    // Empty -> null, so the component's `??` fallback fires on '' as well as on
    // a missing key. `link_text: ''` is the model default, so without the
    // coercion the fallback would never run and every button would be blank.
    linkText: text(banner.link_text),
    // The id, not a watch URL: the video plays INLINE in the card. Null on
    // every non-video record, which is what the facade branches on.
    videoId: isVideo ? videoId : null,

    // ── Small-card presentation. `tone` is a KEY, not a class: the component
    //    owns the palette, the same way it owns the icon components. ──
    tone: TONE_BY_TYPE[type] ?? TONE_BY_TYPE[BANNER_TYPES.IMAGE],
    cardBadge: CARD_BADGE_BY_TYPE[type] ?? CARD_BADGE_BY_TYPE[BANNER_TYPES.IMAGE],
    cardSubtitle: text(banner.slide_text)
      ?? (course ? text(online ? course.o_course_teaser : course.course_teaser) : null)
      ?? (article ? text(article.excerpt) : null),

    // ── COURSE PRICE ────────────────────────────────────────────────────────
    // Rendered under the strip card's title for `course` records ONLY, which is
    // why every other type still returns null here. The slot was built and left
    // empty in an earlier slice precisely so that the collapse path -- the one
    // every existing banner takes -- was proven before anything could fill it.
    price: course ? coursePrice(course, online) : null,
  };
}

/**
 * The ordered pool.
 *
 * Sorted by `weight` ascending — the admin's own ordering, and the same one
 * the dormant carousel used. NOT re-ordered to put the richest record first:
 * today that puts the five image records (two of eight slots filled) ahead of
 * the five video records, so the card on first paint is the emptiest one in
 * the pool. That is the real state of the data and it should be visible.
 *
 * `weight` ties are broken by `_id` so the order is stable between renders
 * rather than dependent on however the snapshot happened to serialise.
 *
 * ── THE SIGNATURE IS AN OPTIONS OBJECT, NOT (banners, now) ──────────────────
 * It took a bare `now` until this slice and now needs `resolved` as well. Both
 * could have been positional; one object instead, because two ways to call one
 * function is exactly the drift this module exists to prevent, and a caller
 * that passes a Date where an object is expected would silently get `now` of
 * `undefined` -- defaulting to a fresh Date and appearing to work.
 *
 * `resolved` is the Map from featureContentRefs. Omitting it is legitimate and
 * means "there are no course or article records to resolve": every such banner
 * then finds no entry and is dropped, which is the correct behaviour for a
 * caller that has not resolved anything rather than a silent half-render.
 */
export function mapBannersToFeatureContent(banners, options = {}) {
  if (!Array.isArray(banners)) return [];
  const { now = new Date(), resolved = null } = options;
  return banners
    .filter((b) => b && POOL_TYPES.includes(b.type) && isLive(b, now))
    .sort(
      (a, b) =>
        (Number(a.weight ?? 0) - Number(b.weight ?? 0)) ||
        String(a._id ?? '').localeCompare(String(b._id ?? ''))
    )
    // `resolved` is keyed by the banner's own id, the same string `toItem` uses
    // for `item.id`. A video or image record has no entry and does not want one.
    .map((banner) => toItem(banner, resolved?.get?.(String(banner._id ?? ''))))
    .filter(Boolean);
}
