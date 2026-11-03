import mongoose from 'mongoose';
import { CHANNELS } from '@/lib/attribution/attribution';

/**
 * Where a registration came from — ONE schema for all four registration
 * collections (RegisterPublic, RegisterInhouse, CareerPathRegistration,
 * MasterclassRegistration), for the reason InternalNoteSchema gives: four
 * literals would be four places for the field set to drift, and Mongoose
 * silently drops a field a schema has lost.
 *
 * Written once, at create, from `buildAttribution` in
 * src/lib/attribution/attribution.js, which is the only thing that decides
 * what goes in here. Never edited afterwards — it is a record of the visit,
 * not a field an admin corrects.
 *
 * No defaults on any field: a registration with no attribution writes no
 * `attribution` key at all, so `attribution == null` reads "filed before this
 * existed, or nothing captured" and nothing else.
 */
const TouchSchema = new mongoose.Schema(
  {
    utm_source:    { type: String },
    utm_medium:    { type: String },
    utm_campaign:  { type: String },
    utm_content:   { type: String },
    utm_term:      { type: String },
    gclid:         { type: String },
    gbraid:        { type: String },
    wbraid:        { type: String },
    fbclid:        { type: String },
    referrer_host: { type: String },
    landing_path:  { type: String },
    captured_at:   { type: Date },
  },
  { _id: false },
);

export const AttributionSchema = new mongoose.Schema(
  {
    first:   { type: TouchSchema },
    last:    { type: TouchSchema },
    channel: { type: String, enum: CHANNELS },
  },
  { _id: false },
);
