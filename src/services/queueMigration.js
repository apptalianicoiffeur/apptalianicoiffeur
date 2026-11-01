/**
 * One-time migration of legacy `dailyQueue/{date}` documents from the old
 * Array shape to the Map shape:
 *
 *   before: entries: [ { bookingId, expectedStart, durationMinutes, status }, ... ]
 *   after:  entries: { [bookingId]: { bookingId, expectedStart, durationMinutes, status } }
 *
 * Safety properties (verified by tests/emulator):
 *  - idempotent: documents already using the Map shape are skipped, so the
 *    migration can run on every owner session without rewriting anything;
 *  - lossless: every keyed entry is carried over with all its fields — no
 *    booking or appointment time is dropped (the document id / date is kept);
 *  - owner-only: writes are performed with the owner session, which is the
 *    only role allowed to rewrite a queue document wholesale.
 *
 * Read paths (`utils/queue.js`) accept both shapes, so nothing breaks while
 * the migration has not run yet; each booking write also normalizes its own
 * day document (see `services/bookings.js`).
 */
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { entriesToMap } from '../utils/queue';

/**
 * Convert every legacy Array document to the Map shape.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun] report what would change without writing
 * @param {string[]|null} [options.days] limit the run to these day document
 *   ids (chained/chunked migrations); `null` scans the whole collection
 * @returns {Promise<{scanned: number, migrated: number, skipped: number, dropped: Array<{day: string, reason: string}>}>}
 */
export async function migrateLegacyQueueDocs({ dryRun = false, days = null } = {}) {
  const result = { scanned: 0, migrated: 0, skipped: 0, dropped: [] };
  if (!db) return result;

  const snap = await getDocs(collection(db, COLLECTIONS.DAILY_QUEUE));
  for (const docSnap of snap.docs) {
    if (Array.isArray(days) && !days.includes(docSnap.id)) continue;
    result.scanned += 1;
    const data = docSnap.data() || {};
    if (!Array.isArray(data.entries)) {
      // Already the Map shape (or empty) — nothing to do.
      result.skipped += 1;
      continue;
    }

    // Report elements that cannot be keyed (they never carried a booking id).
    data.entries.forEach((entry, index) => {
      if (!entry || typeof entry.bookingId !== 'string' || !entry.bookingId) {
        result.dropped.push({ day: docSnap.id, reason: `entries[${index}] has no bookingId` });
      }
    });

    const entries = entriesToMap(data.entries);
    if (!dryRun) {
      await updateDoc(docSnap.ref, {
        // Keep the stored date; only fill it when missing.
        date: data.date || docSnap.id,
        entries,
        updatedAt: serverTimestamp(),
      });
    }
    result.migrated += 1;
  }
  return result;
}
