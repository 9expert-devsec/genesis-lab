import { z } from 'zod';
import {
  ALL_TYPE_IDS,
  BANNER_TYPES,
  COURSE_KIND_IDS,
  normaliseBannerType,
} from '@/lib/banners/bannerTypes';
import { isRefBackedBannerType } from '@/lib/banners/bannerFormFields';

// Allowed Lucide icon names for youtube banner feature tags
export const FEATURE_TAG_ICONS = [
  'Users',
  'TrendingUp',
  'Rocket',
  'Target',
  'Award',
  'Lightbulb',
  'BookOpen',
  'Briefcase',
  'Globe',
  'Cpu',
  'LineChart',
  'Sparkles',
  'GraduationCap',
  'ShieldCheck',
  'Zap',
  'Star',
];

export const bannerSchema = z.object({
  // ── title IS NOT UNCONDITIONALLY REQUIRED ANY MORE ───────────────────────
  // On `video` and `image` it is still the only source of a headline, so the
  // superRefine at the bottom demands it. On `course` and `article` it is an
  // OVERRIDE: the mapper reads `text(banner.title) ?? courseName ?? article.title`,
  // so an empty title means "track the referenced record's own name", which is
  // the answer an upstream rename keeps correct. Requiring it there would force
  // the admin to denormalise a name that already exists — and denormalising a
  // name that moves is the defect `upstreamId` exists to avoid one field up.
  //
  // `.default('')` rather than leaving it absent: `title` is `required` on the
  // mongoose schema for the two types that need it, and a declared empty string
  // is what the conditional `required` function there tests. See models/Banner.
  title:           z.string().trim().max(200).optional().default(''),
  // Both the four new ids and the five legacy ones — see the note on the
  // mongoose enum in src/models/Banner.js for why neither set can be dropped
  // until the migration has run.
  //
  // z.enum needs a non-empty TUPLE, not a string[]; ALL_TYPE_IDS is a frozen
  // array, so it is spread into one. The spread also means a stale copy cannot
  // hide here — there is no literal to drift.
  type:            z.enum([...ALL_TYPE_IDS]),
  youtube_id:      z.string().trim().max(20).optional().default(''),
  slide_text:      z.string().max(2000).optional().default(''),
  feature_tags: z
    .array(
      z.object({
        icon:  z.enum(FEATURE_TAG_ICONS).or(z.literal('')).default(''),
        line1: z.string().trim().max(60).optional().default(''),
        line2: z.string().trim().max(60).optional().default(''),
      })
    )
    .max(3)
    .optional()
    .default([]),
  // ── ADDITIVE FIELDS FOR THE FOUR-TYPE REWORK ──────────────────────────────
  // `.optional()` with NO `.default()`, unlike every field around them. A
  // default would make the parsed object carry the key whether or not the form
  // sent it, and `createBanner`/`updateBanner` hand the parse result straight
  // to mongoose — so a default here WOULD start writing these keys onto every
  // saved document. Optional-and-absent keeps a save that does not mention them
  // from mentioning them.
  title_line2:     z.string().trim().max(200).optional(),
  title_highlight: z.string().trim().max(200).optional(),
  subtitle:        z.string().trim().max(300).optional(),
  description:     z.string().trim().max(2000).optional(),
  course_ref: z
    .object({
      upstreamId: z.string().trim().optional().default(''),
      courseId:   z.string().trim().optional().default(''),
      // NO `.optional()`, NO `.default()`, and that is the whole point of the
      // field. The two namespaces share no field names — an in-class course
      // carries `course_id`/`course_name`, an online one `o_course_id`/
      // `o_course_name` — so a defaulted kind does not degrade to "probably
      // in-class", it resolves to NOTHING and the banner is dropped from the
      // pool with a console warning no admin will ever read. Refusing the save
      // is the only place that failure is visible to the person who caused it.
      kind:       z.enum([...COURSE_KIND_IDS]),
    })
    .optional(),
  article_slug:    z.string().trim().max(300).optional(),

  image_url:       z.string().url().optional().or(z.literal('')).default(''),
  image_public_id: z.string().optional().default(''),
  // The focal point, in percent of the image's own box. `.optional()` with NO
  // `.default()`, for the reason stated on the four-type block above: the parse
  // result is handed straight to mongoose, so a default here would begin
  // writing this key onto every saved banner — including the video records that
  // have no image. Absent stays absent, and the renderer reads absent as
  // centre. See the note on `image_focal` in src/models/Banner.js.
  //
  // Both coordinates are required TOGETHER when the object is present: a focal
  // point with only an x is not half a focal point, it is a malformed one, and
  // accepting it would put `undefined` into an object-position string.
  image_focal: z
    .object({
      x: z.coerce.number().min(0).max(100),
      y: z.coerce.number().min(0).max(100),
    })
    .optional(),
  link_url:        z.string().trim().max(500).optional().default(''),
  link_text:       z.string().trim().max(100).optional().default(''),
  weight:          z.coerce.number().int().default(0),
  active:          z.boolean().default(true),
  starts_at:       z.string().datetime().optional().or(z.literal('')).nullable().default(null),
  ends_at:         z.string().datetime().optional().or(z.literal('')).nullable().default(null),
})
  /**
   * WHAT EACH TYPE CANNOT BE SAVED WITHOUT.
   *
   * ── WHY THE TWO NEW TYPES ARE CHECKED HERE AND THE TWO OLD ONES ARE NOT ──
   * `course` and `article` have ZERO stored records, so a rule about them
   * cannot break anything that exists — and both fail INVISIBLY without it: a
   * `course` banner with no `course_ref` resolves to nothing, is dropped by the
   * mapper, and the only trace is a console.warn on the server. The admin sees
   * a successful save and an unchanged home page.
   *
   * `video` and `image` are deliberately held to the title rule ONLY, which is
   * the rule they already had. Their required fields (`youtube_id`, `image_url`)
   * are enforced by the form, not here, because all 22 stored documents carry a
   * legacy id and a schema rule about them is a rule that runs against real data
   * on its next save. Measured before writing this: 6/6 `youtube` records carry
   * a `youtube_id` and 16/16 image records carry an `image_url`, so the rule
   * would pass today — and "it passes today" is not a reason to put a new way to
   * lock an existing record into the write path. It moves here after the
   * migration, when the data and the enum agree.
   */
  .superRefine((value, ctx) => {
    const type = normaliseBannerType(value.type);

    if (!value.title && !isRefBackedBannerType(value.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'ต้องระบุชื่อ Banner',
      });
    }

    if (type === BANNER_TYPES.COURSE) {
      const ref = value.course_ref;
      // upstreamId OR courseId — `pickCourse` tries the stable id first and
      // falls back to the code, so either one alone resolves. Neither is a
      // reference at all.
      if (!ref || (!ref.upstreamId && !ref.courseId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['course_ref'],
          message: 'ต้องเลือกคอร์สเรียน',
        });
      }
    }

    if (type === BANNER_TYPES.ARTICLE && !value.article_slug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['article_slug'],
        message: 'ต้องเลือกบทความ',
      });
    }
  });
