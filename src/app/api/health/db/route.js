/**
 * GET /api/health/db
 *
 * Real-time MongoDB connection + pool health check. Use before a
 * production deploy, or wire up to UptimeRobot / a monitor.
 *
 * Note: the driver pool lives on `mongoose.connection.client` and isn't a
 * stable public surface — we read it defensively with optional chaining so
 * the endpoint degrades to `null` pool counts rather than throwing.
 */

import { dbConnect } from '@/lib/db/connect';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await dbConnect();

    const adminDb    = mongoose.connection.db.admin();
    const pingResult = await adminDb.ping();

    // Pool stats are on the underlying driver topology; not a public API,
    // so guard every hop.
    const pool      = mongoose.connection.pool;
    const poolTotal = pool?.totalConnectionCount ?? null;
    const poolIdle  = pool?.availableConnectionCount ?? null;

    return Response.json({
      status:     'ok',
      mongoState: mongoose.connection.readyState, // 1 = connected
      ping:       pingResult?.ok === 1 ? 'ok' : 'fail',
      pool: {
        total:     poolTotal,
        available: poolIdle,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { status: 'error', message: err?.message ?? String(err) },
      { status: 503 }
    );
  }
}
