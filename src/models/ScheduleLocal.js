import mongoose from 'mongoose';

/**
 * ScheduleLocal — Genesis-only sidecar metadata for an MSDB Schedule.
 *
 * MSDB owns the canonical schedule (dates, status, type, signup_url)
 * but doesn't track seat capacity or the instructor roster. Those two
 * are admin-managed in Genesis and joined onto the MSDB row at read
 * time via `msdb_schedule_id`. When the upstream Schedule is deleted,
 * its sidecar becomes orphan — periodic cleanup is fine; nothing
 * breaks because reads tolerate a missing match.
 */
const ScheduleLocalSchema = new mongoose.Schema(
  {
    // Upstream `Schedule._id` (24-hex string).
    msdb_schedule_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Convenience copy of the course code so admin lists can show the
    // course name without re-fetching MSDB for every row.
    course_id: { type: String, default: '', index: true },

    // null = no cap declared. Numeric only when an admin opted in.
    max_seats: { type: Number, default: null },

    // Per-round fixed price (THB, per attendee, VAT-exclusive).
    // null = fall back to the upstream course.course_price.
    // Used by Omise checkout so each round can be priced independently
    // without affecting MSDB or past paid registrations.
    price_override: { type: Number, default: null, min: 0 },

    // Instructor `_id` strings (from the Genesis Instructor model).
    instructor_ids: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'schedule_locals' }
);

export default mongoose.models.ScheduleLocal ||
  mongoose.model('ScheduleLocal', ScheduleLocalSchema);
