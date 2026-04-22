import mongoose from 'mongoose';

const BannerSchema = new mongoose.Schema(
  {
    title:      { type: String, required: true, trim: true },
    subtitle:   { type: String, trim: true },
    imageUrl:   { type: String, required: true }, // Cloudinary secure_url
    imagePublicId: { type: String }, // Cloudinary public_id for deletion
    ctaLabel:   { type: String, trim: true },
    ctaHref:    { type: String, trim: true },
    order:      { type: Number, default: 0 },
    active:     { type: Boolean, default: true },
    startsAt:   { type: Date },
    endsAt:     { type: Date },
  },
  { timestamps: true, collection: 'banners' }
);

BannerSchema.index({ order: 1, active: 1 });

export default mongoose.models.Banner || mongoose.model('Banner', BannerSchema);
