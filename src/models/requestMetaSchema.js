import mongoose from 'mongoose';

/**
 * The request a registration arrived with — ONE schema for all four
 * registration collections, for the same reason AttributionSchema is shared.
 *
 * Written once, at create, from `requestMetaFor` in
 * src/lib/registration/requestMeta.js, which reads request HEADERS on the
 * server and is the only thing that decides what goes in here. Never from the
 * request body; never edited afterwards.
 *
 * No defaults and not required: a registration filed before this existed has
 * no `requestMeta` key, and `requestMeta == null` reads exactly that.
 *
 * There is no ASN field: Vercel's documented request headers carry country,
 * region, city, coordinates, timezone and postal code, but no ASN / ISP.
 */
export const RequestMetaSchema = new mongoose.Schema(
  {
    origin:            { type: String },
    referer_host:      { type: String },
    referer_path:      { type: String },
    host:              { type: String },
    user_agent:        { type: String },
    accept_language:   { type: String },
    forwarded_for:     { type: String },
    vercel_ip_country: { type: String },
    vercel_ip_city:    { type: String },
    origin_trusted:    { type: Boolean },
  },
  { _id: false },
);
