import { z } from 'zod';
import {
  WRITER_PLATFORMS,
  WRITER_SECTION_KEYS,
  WRITER_SLUG_RE,
  WRITER_TYPES,
  isHttpUrl,
  isWriterAvatarPublicId,
} from '@/lib/writers/writerFields';

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

const sectionItems = z
  .array(z.string().trim().max(300, 'รายการยาวเกิน 300 ตัวอักษร'))
  .max(50, 'ใส่ได้ไม่เกิน 50 รายการ')
  .default([])
  .transform((items) => items.filter(Boolean));

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
