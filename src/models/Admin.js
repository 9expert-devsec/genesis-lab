import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:     { type: String, required: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash; $2b$10$... compatible with legacy
    role:     { type: String, enum: ['owner', 'admin', 'editor'], default: 'admin' },
    active:   { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'admins' }
);

export default mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
