import mongoose from 'mongoose';

/**
 * LocalFaq — admin-managed FAQ. Completely independent from the upstream
 * Faq sync collection. Admin creates/edits/deletes freely.
 * Categories: 'public_inhouse' | 'career_path' | 'masterclass'
 */
const LocalFaqSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['public_inhouse', 'career_path', 'masterclass'],
      required: true,
      index: true,
    },
    question_th:   { type: String, required: true, trim: true },
    answer_html:   { type: String, default: '' },
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'local_faqs' }
);

LocalFaqSchema.index({ category: 1, is_active: 1, display_order: 1 });

export default mongoose.models.LocalFaq ||
  mongoose.model('LocalFaq', LocalFaqSchema);
