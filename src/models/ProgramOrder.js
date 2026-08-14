import mongoose from 'mongoose';

// Stores custom display order for programs fetched from external API.
// programId matches the `program_id` or `_id` field from /programs.
const ProgramOrderSchema = new mongoose.Schema(
  {
    programId:   { type: String, required: true, unique: true },
    displayName: { type: String, default: '' },
    iconUrl:     { type: String, default: '' },
    order:       { type: Number, default: 999 },
    isHidden:    { type: Boolean, default: false },

    /**
     * Courses in this program, in display order — normalised UPPER-CASE
     * course codes. Same shape as SkillOrder.programOrder beside it.
     *
     * A LIST, not a number per course, and that is the whole point: a list
     * cannot hold a tie. The upstream `sort_order` it replaces collides
     * eleven-deep inside a single skill, and every scheme that manages ties
     * has to decide them somewhere; a position in an array has already
     * decided. See lib/courses/courseOrder.js.
     *
     * Codes are stored upper-cased because `course_id` has no canonical
     * casing upstream (public-courses.js:117) and four live courses are not
     * fully uppercase. Normalising on the way in means a rank lookup cannot
     * miss on case.
     */
    courseOrder: { type: [String], default: [] },

    /**
     * '' | 'seeded' | 'arranged' — who put `courseOrder` there.
     *
     * 'seeded' means it was captured from the order the site already
     * rendered, so it is a record of upstream's arrangement, not a decision
     * anyone made. 'arranged' means a person has since moved something.
     *
     * The re-seed skips anything already 'arranged', which is what stops a
     * second run from overwriting an admin's work. It also lets a future
     * screen say "carried over from the old system, not yet arranged"
     * instead of presenting an accident as a choice.
     */
    courseOrderSource: { type: String, enum: ['', 'seeded', 'arranged'], default: '' },
  },
  { timestamps: true, collection: 'program_orders' }
);

ProgramOrderSchema.index({ order: 1 });

export default mongoose.models.ProgramOrder ||
  mongoose.model('ProgramOrder', ProgramOrderSchema);
