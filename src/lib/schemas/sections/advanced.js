import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.5 ADVANCED sections (4) — DEVELOPER TIER ONLY. The whole category is
 * gated: creating or editing a section whose `type` is in ADVANCED_TYPES
 * requires developer tier, enforced in the action layer (the schema can't
 * see the session). A lower tier's write must drop these sections rather
 * than error — same preserve-don't-wipe posture as the envelope's
 * `advanced.*` fields. See lib/actions/pageBuilder.js.
 *
 * The raw payloads (html/css/json) are sanitised / validated at render time
 * in Phase 2 — Phase 1 only stores them.
 */

export const ADVANCED_TYPES = ['custom_html', 'embed', 'custom_css', 'debug_json'];

const customHtmlContent = z.object({
  html: z.string().default(''),
}).passthrough();

// `script` was dropped from the provider set in 2C: the shared sanitizePageHtml
// strips <script> (reused deliberately — no second, drift-prone sanitizer), so a
// `script` provider could only ever be accepted-and-not-honoured. A DB scan at
// 2C found zero stored embed sections (Advanced had never shipped), so removing
// the enum value migrates nothing and avoids minting a fresh honoured-by-nobody
// value on day one — the exact failure mode this codebase keeps fighting.
// `html` now carries raw iframe markup only (provider === 'iframe').
const embedContent = z.object({
  provider: z.enum(['youtube', 'vimeo', 'iframe']).default('youtube'),
  url:      z.string().default(''),
  html:     z.string().default(''), // provider === 'iframe' raw embed markup
}).passthrough();

const customCssContent = z.object({
  css: z.string().default(''),
}).passthrough();

// Developer scratch/inspection block — arbitrary JSON kept as a string so it
// round-trips untouched.
const debugJsonContent = z.object({
  json: z.string().default(''),
}).passthrough();

export const advancedSectionSchemas = [
  defineSection('custom_html', customHtmlContent),
  defineSection('embed',       embedContent),
  defineSection('custom_css',  customCssContent),
  defineSection('debug_json',  debugJsonContent),
];
