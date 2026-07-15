import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.2 CONTENT sections (MVP — 6). These have well-established, unambiguous
 * shapes, so they're typed here in Phase 1. `.passthrough()` still guards
 * forward-compat for fields a Phase-2 component may add.
 */

export const CONTENT_TYPES = ['heading', 'rich_text', 'image', 'cta', 'checklist', 'notice'];

const headingContent = z.object({
  text:  z.string().default(''),
  level: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).default('h2'),
  align: z.enum(['left', 'center', 'right']).default('left'),
}).passthrough();

// rich_text stores Tiptap JSON (NOT an HTML string). It is rendered directly
// to React by the walker — no HTML, no server-side sanitizer, no jsdom. The
// doc is untrusted at render, so the schema stays permissive (the walker is
// the guard); the supported node/mark set is the contract documented in
// components/pageBuilder/richText/tiptapToReact.jsx.
const richTextContent = z.object({
  doc: z.object({
    type:    z.string().default('doc'),
    content: z.array(z.any()).default([]),
  }).passthrough().default({ type: 'doc', content: [] }),
}).passthrough();

const imageContent = z.object({
  src:      z.string().default(''), // Cloudinary secure_url
  publicId: z.string().default(''), // for deletion
  alt:      z.string().default(''),
  caption:  z.string().default(''),
}).passthrough();

const ctaContent = z.object({
  heading:     z.string().default(''),
  description: z.string().default(''),
  buttonLabel: z.string().default(''),
  buttonHref:  z.string().default(''),
}).passthrough();

const checklistContent = z.object({
  items: z.array(z.object({
    text:    z.string().default(''),
    checked: z.boolean().default(true),
  }).passthrough()).default([]),
}).passthrough();

const noticeContent = z.object({
  variant: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  text:    z.string().default(''),
}).passthrough();

export const contentSectionSchemas = [
  defineSection('heading',   headingContent),
  defineSection('rich_text', richTextContent),
  defineSection('image',     imageContent),
  defineSection('cta',       ctaContent),
  defineSection('checklist', checklistContent),
  defineSection('notice',    noticeContent),
];
