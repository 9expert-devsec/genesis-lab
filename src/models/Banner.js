import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    // Banner type — determines which fields are used
    type: {
      type: String,
      required: true,
      enum: [
        'youtube',              // Video Banner: YouTube embed + text + button
        'image_desktop',        // Hero Banner (desktop): full image 1920×700, 1 link
        'image_mobile',         // Hero Banner (mobile): full image 360×584, 1 link
        'image_button_desktop', // Section Banner (desktop): image + button 1920×700
        'image_button_mobile',  // Section Banner (mobile): image + button 360×584
      ],
    },

    // YouTube type fields
    youtube_id:      { type: String, default: '' },
    slide_text:      { type: String, default: '' },

    // Image type fields
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },

    // Shared link fields (used by all types)
    link_url:        { type: String, default: '', trim: true },
    link_text:       { type: String, default: '', trim: true, maxlength: 100 },

    // Display control — lower weight shows first (matches legacy Drupal "weight")
    weight:          { type: Number, default: 0 },
    active:          { type: Boolean, default: true },
    starts_at:       { type: Date, default: null },
    ends_at:         { type: Date, default: null },
  },
  { timestamps: true, collection: 'banners' }
);

bannerSchema.index({ active: 1, weight: 1 });

export const Banner =
  mongoose.models.Banner || mongoose.model('Banner', bannerSchema);

export default Banner;
