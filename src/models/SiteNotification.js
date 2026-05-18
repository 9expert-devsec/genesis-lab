import mongoose from 'mongoose';

/**
 * SiteNotification — promotional overlays + sticky top bars.
 *
 * Two display types share scheduling, scope, and weight; the per-type
 * fields are kept flat on the document (no sub-doc) so the admin form
 * binds straight to schema columns.
 *
 *   topbar  → sticky bar above the public header (server-rendered)
 *   popup   → image-only modal overlay (client-rendered after a trigger)
 *
 * "Show one at a time" semantics: queries sort by `weight` ASC and the
 * renderer picks the first eligible row — lowest weight wins.
 *
 * TopBar uses freeform hex colors (bg_color / text_color / btn_*),
 * applied via inline `style` because Tailwind cannot generate arbitrary
 * hex classes at runtime.
 *
 * Popup is image-only: a single image with an optional click target.
 * No title, body, or button fields — editors compose the visual in
 * Figma/Canva and upload one image.
 */
const SiteNotificationSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    display_type: { type: String, required: true, enum: ['topbar', 'popup'] },

    // ── Shared scheduling ───────────────────────────────────────
    active:    { type: Boolean, default: false },
    starts_at: { type: Date, default: null },
    ends_at:   { type: Date, default: null },
    weight:    { type: Number, default: 0 },

    // ── TopBar fields ──────────────────────────────────────────
    message:     { type: String, default: '' },
    dismissible: { type: Boolean, default: true },

    bg_color:   { type: String, default: '#2486FF' },
    text_color: { type: String, default: '#FFFFFF' },

    bg_image_url:       { type: String, default: '' },
    bg_image_public_id: { type: String, default: '' },
    bg_image_size: {
      type: String,
      enum: ['cover', 'contain', 'auto'],
      default: 'auto',
    },

    btn_label:      { type: String, default: '' },
    btn_action:     { type: String, enum: ['link', 'copy'], default: 'link' },
    btn_href:       { type: String, default: '' },
    btn_copy_value: { type: String, default: '' },
    btn_copy_ok:    { type: String, default: 'คัดลอกแล้ว!' },
    btn_new_tab:    { type: Boolean, default: false },
    btn_bg_color:   { type: String, default: '' },
    btn_text_color: { type: String, default: '' },

    // ── TopBar Countdown ─────────────────────────────────────────
    // Set to a future Date to show a live countdown in the bar
    // ("HH:MM:SS" or "D วัน HH:MM:SS"). null = no countdown.
    // Independent of `ends_at`: the countdown target can be earlier
    // than (e.g. "ends in X") or later than the bar's visible window.
    countdown_target: { type: Date, default: null },

    // ── Popup fields ───────────────────────────────────────────
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    click_href:      { type: String, default: '' },
    click_new_tab:   { type: Boolean, default: true },

    trigger:         { type: String, enum: ['immediate', 'delay', 'exit_intent', 'scroll'], default: 'delay' },
    delay_seconds:   { type: Number, default: 3 },
    scroll_pct:      { type: Number, default: 40 },
    cooldown_hours:  { type: Number, default: 24 },

    // null/[] = show on every page; else array of pathname prefixes.
    page_scope: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'site_notifications' }
);

SiteNotificationSchema.index({ active: 1, display_type: 1, weight: 1 });

if (mongoose.models.SiteNotification) delete mongoose.models.SiteNotification;
export default mongoose.model('SiteNotification', SiteNotificationSchema);