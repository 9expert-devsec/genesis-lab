import { z } from 'zod';
import {
  WRITER_PLATFORMS,
  WRITER_SECTION_KEYS,
  WRITER_SLUG_RE,
  WRITER_TYPES,
  isHttpUrl,
  isWriterAvatarPublicId,
  WRITER_FEATURED_COURSE_LIMIT,
  WRITER_VIDEO_LIMIT,
} from '@/lib/writers/writerFields';
import { YOUTUBE_MESSAGES, isYouTubeChannelUrl, parseYouTubeVideoId } from '@/lib/writers/youtube';

/**
 * What a writer form may submit.
 *
 * `isDefault` IS DELIBERATELY ABSENT. `z.object()` strips what it does not
 * declare, so no payload can set it; the default writer comes from
 * scripts/seed-default-writer.mjs and from nowhere else.
 *
 * `isActive` has NO DEFAULT, deliberately. A default of `true` would reactivate
 * a disabled writer every time an edit that does not carry the key was saved.
 * Absent means "not this save's business"; createWriter fills it in.
 */

/**
 * One section row: an optional ปี (`period`) and the required เนื้อหา (`text`).
 * A bare string is still accepted and read as `{ text }`, the shape rows had
 * before the period column. A row with both inputs blank is dropped; a ปี with
 * no เนื้อหา is refused rather than silently lost.
 */
const sectionItem = z.preprocess(
  (v) => (typeof v === 'string' ? { text: v } : v),
  z.object({
    period: z.string().trim().max(40, 'ปียาวเกิน 40 ตัวอักษร').default(''),
    text: z.string().trim().max(300, 'รายการยาวเกิน 300 ตัวอักษร').default(''),
  }),
);

const sectionItems = z
  .array(sectionItem)
  .max(50, 'ใส่ได้ไม่เกิน 50 รายการ')
  .default([])
  .transform((items) => items.filter((item) => item.period || item.text))
  .refine((items) => items.every((item) => item.text), 'กรุณากรอกเนื้อหาของทุกรายการที่ใส่ปีไว้')
  .transform((items) => items.map(({ period, text }) => (period ? { period, text } : { text })));

/** Ordered, de-duplicated, at most three: the admin's picks for the profile. */
const featuredOnlineCourseIds = z
  .array(z.string().trim().min(1).max(80))
  .default([])
  .transform((ids) => [...new Set(ids)])
  .refine((ids) => ids.length <= WRITER_FEATURED_COURSE_LIMIT, `เลือกหลักสูตรออนไลน์ได้ไม่เกิน ${WRITER_FEATURED_COURSE_LIMIT} รายการ`);

/**
 * The video rows as typed. The id comes from the link here, server-side, so a
 * client-sent `videoId` is never trusted. Titles may be blank at this point:
 * the save action fills them from oEmbed (lib/writers/youtube).
 */
const youtubeVideos = z
  .array(z.object({
    url: z.string().trim().max(500).default(''),
    title: z.string().trim().max(200, 'ชื่อวิดีโอยาวเกิน 200 ตัวอักษร').default(''),
  }))
  .default([])
  .transform((rows) => rows.filter((row) => row.url || row.title))
  .refine((rows) => rows.length <= WRITER_VIDEO_LIMIT, `ใส่วิดีโอได้ไม่เกิน ${WRITER_VIDEO_LIMIT} รายการ`)
  .refine((rows) => rows.every((row) => row.url), YOUTUBE_MESSAGES.missingUrl)
  .refine((rows) => rows.every((row) => parseYouTubeVideoId(row.url)), YOUTUBE_MESSAGES.badVideoUrl)
  .transform((rows) => rows.map((row) => ({ videoId: parseYouTubeVideoId(row.url), url: row.url, title: row.title })));

export const writerSchema = z.object({
  slug: z
    .string({ required_error: 'กรุณากรอก URL (slug)' })
    .trim()
    .regex(WRITER_SLUG_RE, 'slug ใช้ได้เฉพาะ a-z, 0-9 และขีดกลาง')
    .max(80, 'slug ยาวเกิน 80 ตัวอักษร'),
  displayName: z
    .string({ required_error: 'กรุณากรอกชื่อที่แสดง' })
    .trim()
    .min(1, 'กรุณากรอกชื่อที่แสดง')
    .max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  type: z.enum(WRITER_TYPES).default('person'),
  role: z.string().trim().max(200, 'ตำแหน่งยาวเกิน 200 ตัวอักษร').default(''),
  bio: z.string().trim().max(5000, 'แนะนำตัวยาวเกิน 5,000 ตัวอักษร').default(''),
  avatarPublicId: z
    .string()
    .default('')
    .refine((v) => v === '' || isWriterAvatarPublicId(v), 'รูปโปรไฟล์ไม่ถูกต้อง'),
  socialLinks: z
    .array(z.object({
      platform: z.enum(WRITER_PLATFORMS),
      url: z.string().trim().refine(isHttpUrl, 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'),
    }))
    .max(20, 'ใส่ลิงก์ได้ไม่เกิน 20 รายการ')
    .default([]),
  sections: z
    .object(Object.fromEntries(WRITER_SECTION_KEYS.map((key) => [key, sectionItems])))
    .default({}),
  featuredOnlineCourseIds,
  youtubeVideos,
  youtubeChannelUrl: z
    .string()
    .trim()
    .max(500)
    .default('')
    .refine((v) => v === '' || isYouTubeChannelUrl(v), YOUTUBE_MESSAGES.badChannelUrl),
  instructorId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().regex(/^[a-f\d]{24}$/i, 'ข้อมูลวิทยากรไม่ถูกต้อง').nullable(),
  ),
  isActive: z.boolean().optional(),
});

/** `{ field: message }`, first message per top-level field. */
export function writerFieldErrors(zodError) {
  const errors = {};
  for (const issue of zodError?.issues ?? []) {
    const field = String(issue.path?.[0] ?? 'form');
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}
