import mongoose from 'mongoose';

/**
 * AboutConfig — single-doc store for the editable text blocks on
 * /about-us (tagline, intro, mission, vision). Stats come from the
 * landing cache, not here.
 */
const AboutConfigSchema = new mongoose.Schema(
  {
    tagline:     { type: String, default: 'Universe of Learning Technology' },
    description: { type: String, default: '' },
    mission:     { type: String, default: '' },
    vision:      { type: String, default: '' },
  },
  { timestamps: true, collection: 'about_config' }
);

export default mongoose.models.AboutConfig ||
  mongoose.model('AboutConfig', AboutConfigSchema);
