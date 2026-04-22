/**
 * Mongoose connection helper.
 *
 * Next.js dev mode hot-reloads code, which would create a new connection
 * on every reload and eventually exhaust the cluster. We cache the
 * connection on `globalThis` so it persists across reloads in dev, and
 * across Lambda invocations in prod (warm start).
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
        bufferCommands: false,
        dbName: process.env.MONGODB_DB_NAME,
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
