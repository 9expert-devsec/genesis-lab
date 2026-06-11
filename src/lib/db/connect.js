/**
 * Mongoose connection helper.
 *
 * Next.js dev mode hot-reloads code, which would create a new connection
 * on every reload and eventually exhaust the cluster. We cache the
 * connection on `globalThis` so it persists across reloads in dev, and
 * across Lambda invocations in prod (warm start).
 *
 * Pool tuning (Atlas Free Tier M0 = 500 connection hard limit):
 *   maxPoolSize: 5  — cap connections per serverless instance. Mongoose
 *                     defaults to 100, so a handful of warm Lambdas would
 *                     blow past 500. At 5, even 20 concurrent instances
 *                     (20 × 5 = 100) stay well under the cap.
 *                     Bump to 10–20 after upgrading to M10.
 *   minPoolSize: 1  — keep one connection warm to cut cold-connect latency.
 *   serverSelectionTimeoutMS: 10000 — fail fast instead of hanging.
 *   socketTimeoutMS:         45000 — auto-close sockets stuck > 45s.
 *   maxIdleTimeMS:           30000 — return connections idle > 30s to pool.
 *
 * ── Connection Audit Log ──────────────────────────────────────────────
 * Last audited: 2026-06-11
 *
 * Settings:
 *   maxPoolSize:    5   (Free Tier safe — upgrade to 10-20 on M10)
 *   minPoolSize:    1   (keep-alive)
 *   socketTimeout:  45s
 *   maxIdleTime:    30s
 *
 * Findings:
 *   - 22 API routes verified: all use dbConnect() singleton ✓
 *   - 6 Cron jobs verified: no direct mongoose.connect(), try-catch +
 *     Response.json on every path ✓
 *   - 30 server-action files verified: all use dbConnect() singleton ✓
 *   - No MongoClient direct usage found ✓
 *   - No mongoose.disconnect()/connection.close() in serverless code ✓
 *     (only in src/scripts/* CLI tools, which are out of scope)
 *   - Root cause of the 0→403 connection spike: missing maxPoolSize
 *     (Mongoose default 100 × multiple warm Lambdas). Fixed here.
 * ──────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'MONGODB_URI is not set. Configure it in .env.local (see .env.example).'
  );
}

let cached = globalThis._9eMongoose;
if (!cached) {
  cached = globalThis._9eMongoose = { conn: null, promise: null };
}

export async function dbConnect() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands:           false,
        dbName:                   process.env.MONGODB_DB_NAME,
        maxPoolSize:              5,     // cap pool per serverless instance
        minPoolSize:              1,     // keep-alive 1 connection
        serverSelectionTimeoutMS: 10000, // fail fast
        socketTimeoutMS:          45000, // close idle sockets
        maxIdleTimeMS:            30000, // release idle connections
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
