import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.3 CARD sections (MVP — 5). Cards either reference upstream data by id
 * (course_card, instructor_card) or carry their own display fields
 * (price_card, stat_card, icon_card). Icons are Lucide names (strings), not
 * markup. Card visual style comes from the envelope's `style.cardStyle`.
 */

export const CARD_TYPES = ['course_card', 'price_card', 'stat_card', 'icon_card', 'instructor_card'];

// References a public course by its human course_id (e.g. "MSE-AI"), matching
// how promotions/links join elsewhere. Rendered from upstream data in Phase 2.
const courseCardContent = z.object({
  courseId: z.string().default(''),
}).passthrough();

const priceCardContent = z.object({
  title:       z.string().default(''),
  price:       z.string().default(''), // string: may carry "฿12,900" / "สอบถาม"
  period:      z.string().default(''),
  features:    z.array(z.string()).default([]),
  buttonLabel: z.string().default(''),
  buttonHref:  z.string().default(''),
  highlighted: z.boolean().default(false),
}).passthrough();

const statCardContent = z.object({
  value: z.string().default(''),
  label: z.string().default(''),
  icon:  z.string().default(''), // Lucide icon name
}).passthrough();

const iconCardContent = z.object({
  icon:        z.string().default(''), // Lucide icon name
  title:       z.string().default(''),
  description: z.string().default(''),
}).passthrough();

const instructorCardContent = z.object({
  instructorId: z.string().default(''),
}).passthrough();

export const cardSectionSchemas = [
  defineSection('course_card',     courseCardContent),
  defineSection('price_card',      priceCardContent),
  defineSection('stat_card',       statCardContent),
  defineSection('icon_card',       iconCardContent),
  defineSection('instructor_card', instructorCardContent),
];
