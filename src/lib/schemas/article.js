import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const articleSchema = z.object({
  slug:          z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(200)
    .regex(slugRegex, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น'),
  title:         z.string().trim().min(1).max(200),
  excerpt:       z.string().trim().max(500).optional().default(''),
  content:       z.string().min(1, 'กรุณาใส่เนื้อหา'),
  coverUrl:      z.string().url().optional().or(z.literal('')),
  coverPublicId: z.string().optional().default(''),
  tags:          z.array(z.string().trim().toLowerCase()).default([]),
  author:        z.string().trim().max(100).optional().default(''),
  publishedAt:   z.string().datetime().optional().or(z.literal('')),
  active:        z.boolean().default(true),
});
