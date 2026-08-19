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
  BANNER_TYPES,
  LEGACY_TO_NEW,
  LEGACY_TYPES,
} from '@/lib/banners/bannerTypes';
import { resolveBannerLink, warnBlockedBannerLink } from '@/lib/bannerLinkUrl';

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
const POOL_TYPES = [LEGACY_TYPES.YOUTUBE, LEGACY_TYPES.IMAGE_DESKTOP];

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

/** One Banner → one view-model item, or null if it cannot fill the slot. */
function toItem(banner) {
  // NORMALISED, and every branch below reads this — never `banner.type`.
  // 'youtube' → 'video', 'image_desktop' → 'image'. A record already stored
  // under a new id passes through unchanged. Nothing here does a substring test
  // on a type string: `startsWith('image')` answers true for four different
  // legacy ids AND for the new one, which is the bug that shape always becomes.
  const type = LEGACY_TO_NEW[banner.type] ?? banner.type;
  const isVideo = type === BANNER_TYPES.VIDEO;
  const isImage = type === BANNER_TYPES.IMAGE;
  const videoId = text(banner.youtube_id);

  // An item with no picture has no card. The featured slot IS an image slot.
  const media = isVideo
    ? videoId
      ? youtubeThumbnails(videoId)
      : null
    : text(banner.image_url)
      ? { image: banner.image_url.trim(), imageFallback: null }
      : null;
  if (!media) return null;

  const title = text(banner.title);
  if (!title) return null;

  const link = text(banner.link_url);

  // `ดูรายละเอียด` needs a page that is NOT the video itself. Every live video
  // record's link_url is the watch URL for the id already in `youtube_id`, so
  // without this test the button would point at the thing the card already
  // plays inline.
  //
  // There is no `ดูวิดีโอ` button any more: the thumbnail IS the play control,
  // so a second affordance to the same action was one too many. `videoId` below
  // is what the facade needs — an id, not a URL, because the embed is built
  // from it and no navigation happens.
  const detailsUrl = link && !isYouTubeUrl(link) ? link : null;

  // Internal / external / mailto / refused — the SAME rules the carousel uses,
  // resolved here so no component has to know them. `blocked` warns once and
  // renders unlinked rather than silently dropping the link.
  const resolved = resolveBannerLink(detailsUrl);
  if (resolved.kind === 'blocked') warnBlockedBannerLink(banner);
  const href = resolved.href;
  const linkKind = resolved.kind;

  // feature_tags is the only stored source for the chip row, and only youtube
  // records have any. `line1` alone is enough for a chip; a tag with neither
  // line is dropped rather than rendered as a bare icon.
  const meta = (Array.isArray(banner.feature_tags) ? banner.feature_tags : [])
    .slice(0, 3)
    .map((tag) => ({
      icon: text(tag?.icon),
      line1: text(tag?.line1),
      line2: text(tag?.line2),
    }))
    .filter((tag) => tag.line1 || tag.line2);

  return {
    id: String(banner._id ?? `${type}-${banner.weight ?? 0}`),
    type,
    isVideo,
    isImage,

    // ── The eight designed slots ──
    badge: isVideo ? 'วิดีโอแนะนำ' : 'แนะนำสำหรับคุณ', // derived from type
    kicker: null, // no source
    title,
    titleAccent: null, // `title` is one field — nothing marks a second line
    titleHighlight: null,
    subtitle: null, // no source
    // ── `description ?? slide_text`, AND THAT ORDER IS THE MODEL'S OWN RULE ──
    // src/models/Banner.js says it out loud on `slide_text`: the replacement
    // field is `description`, both coexist during the migration, and "readers
    // use `description ?? slide_text`". This reader only ever read slide_text,
    // so it was one of the readers that sentence describes and did not do.
    //
    // It changes NOTHING today and that is exactly why it is safe to correct
    // now: `description` is one of the additive four-type fields, nothing
    // writes it (the admin form posts `slide_text` — see actions/banners.js)
    // and no record in the pool carries it, so all ten still resolve to
    // slide_text. Measured after the change, at five viewports: every split
    // card's height is what it was before to the hundredth of a pixel, and the
    // image cards still render no description element at all. Wiring it once
    // the migration has run
    // would mean the migration silently blanks the description until a second
    // commit lands; wiring it now means the migration is the only step.
    //
    // `text()` on both sides, so a whitespace-only `description` falls through
    // to slide_text rather than winning with nothing in it.
    description: text(banner.description) ?? text(banner.slide_text),
    meta, // [] on every image record

    // ── Media ──
    ...media,
    imageAlt: title,

    // ── Actions ──
    href,
    linkKind,
    // The admin's own label for the button, when they typed one. This is a
    // REAL authorable field, not a placeholder: BannerForm has the input and
    // createBanner/updateBanner both persist it. Measured: all five image
    // records render the fallback label, so nothing fills this today and the
    // fallback is the path production actually runs — which is the one worth
    // proving before anything does fill it. (The five video records are not
    // observable the same way: their link_url is the watch URL, so `href` is
    // null and they render no button at all.)
    //
    // Empty → null, so the component's `??` fallback fires on '' as well as on
    // a missing key. `link_text: ''` is the model default, so without the
    // coercion the fallback would never run and every button would be blank.
    linkText: text(banner.link_text),
    // The id, not a watch URL: the video plays INLINE in the card. Null on
    // every non-video record, which is what the facade branches on.
    videoId: isVideo ? videoId : null,

    // ── Chrome ──
    // Two keys used to live here and both are gone, for the same reason:
    // `brand: '9Expert'` fed a chip at the thumbnail's top left, and
    // `watchOnYouTube` fed a "Watch on YouTube" pill at its bottom right.
    // Both chips were removed once the real YouTube play mark landed on the
    // image, and neither key has a consumer any more. A view-model key with no
    // reader is the kind of thing someone restores later assuming something
    // needed it — so it goes with the thing that read it.

    // ── Small-card presentation. `tone` is a KEY, not a class: the component
    //    owns the palette, the same way it owns the icon components. ──
    tone: isVideo ? 'red' : 'cyan',
    cardBadge: isVideo ? 'YouTube' : 'แนะนำ',
    cardSubtitle: text(banner.slide_text),

    // ── COURSE PRICE — the slot exists, the source does not, yet. ───────────
    // Rendered under the small card's title for `course` records ONLY. The
    // Banner model has no price field and never will: a price belongs to the
    // course, so it arrives with the course reference in the deferred data
    // slice (MSDB `course_price` / `course_netprice`).
    //
    // NULL on every record today, which is the point of shipping it now — the
    // collapse path is the one that runs in production for every existing
    // banner, so it is the path worth proving before anything can populate it.
    price: null,
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
 */
export function mapBannersToFeatureContent(banners, now = new Date()) {
  if (!Array.isArray(banners)) return [];
  return banners
    .filter((b) => b && POOL_TYPES.includes(b.type) && isLive(b, now))
    .sort(
      (a, b) =>
        (Number(a.weight ?? 0) - Number(b.weight ?? 0)) ||
        String(a._id ?? '').localeCompare(String(b._id ?? ''))
    )
    .map(toItem)
    .filter(Boolean);
}
