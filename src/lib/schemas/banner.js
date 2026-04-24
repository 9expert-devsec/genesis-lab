import { z } from 'zod';

export const bannerSchema = z.object({
  title:           z.string().trim().min(1).max(200),
  type:            z.enum([
    'youtube',
    'image_desktop',
    'image_mobile',
    'image_button_desktop',
    'image_button_mobile',
  ]),
  youtube_id:      z.string().trim().max(20).optional().default(''),
  slide_text:      z.string().max(2000).optional().default(''),
  image_url:       z.string().url().optional().or(z.literal('')).default(''),
  image_public_id: z.string().optional().default(''),
  link_url:        z.string().trim().max(500).optional().default(''),
  link_text:       z.string().trim().max(100).optional().default(''),
  weight:          z.coerce.number().int().default(0),
  active:          z.boolean().default(true),
  starts_at:       z.string().datetime().optional().or(z.literal('')).nullable().default(null),
  ends_at:         z.string().datetime().optional().or(z.literal('')).nullable().default(null),
});
