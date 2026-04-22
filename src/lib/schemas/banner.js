import { z } from 'zod';

export const bannerSchema = z.object({
  title:         z.string().trim().min(1).max(200),
  subtitle:      z.string().trim().max(300).optional().default(''),
  imageUrl:      z.string().url('URL รูปภาพไม่ถูกต้อง'),
  imagePublicId: z.string().optional().default(''),
  ctaLabel:      z.string().trim().max(50).optional().default(''),
  ctaHref:       z.string().trim().max(500).optional().default(''),
  order:         z.coerce.number().int().default(0),
  active:        z.boolean().default(true),
  startsAt:      z.string().datetime().optional().or(z.literal('')),
  endsAt:        z.string().datetime().optional().or(z.literal('')),
});
