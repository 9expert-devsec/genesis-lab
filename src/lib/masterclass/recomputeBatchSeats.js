import { dbConnect } from '@/lib/db/connect';
import MasterclassBatch from '@/models/MasterclassBatch';
import MasterclassRegistration from '@/models/MasterclassRegistration';

/**
 * Recompute a batch's registered_count from the source of truth:
 * sum of attendeesCount (min 1) across PAID registrations in the batch.
 * Also auto-flips status open↔full around capacity unless status_override.
 * Idempotent — safe to call after any registration mutation.
 */
export async function recomputeBatchSeats(batchId) {
  if (!batchId) return null;
  await dbConnect();

  const regs = await MasterclassRegistration.find({ batch_id: batchId, status: 'paid' })
    .select('attendeesCount')
    .lean();
  const seats = regs.reduce((sum, r) => sum + Math.max(1, Number(r.attendeesCount) || 1), 0);

  const batch = await MasterclassBatch.findByIdAndUpdate(
    batchId,
    { $set: { registered_count: seats } },
    { new: true }
  );
  if (batch && !batch.status_override) {
    if (batch.status === 'open' && seats >= batch.capacity) {
      await MasterclassBatch.findByIdAndUpdate(batch._id, { $set: { status: 'full' } });
    } else if (batch.status === 'full' && seats < batch.capacity) {
      await MasterclassBatch.findByIdAndUpdate(batch._id, { $set: { status: 'open' } });
    }
  }
  return seats;
}
