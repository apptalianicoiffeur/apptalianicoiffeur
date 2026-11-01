/**
 * One-time migration of legacy `dailyQueue/{date}` documents from the old
 * Array shape to the Map shape:
 *
 *   before: entries: [ { bookingId, expectedStart, durationMinutes, status }, ... ]
 *   after:  entries: { [bookingId]: { bookingId, expectedStart, durationMinutes, status } }
 *
 * Safety properties (verified by tests/emulator/migration.test.mjs):
 *  - transactional: every document is rewritten inside a Firestore
 *    transaction that RE-READS the document inside the transaction, so a
 *    concurrent write (a booking transaction, another tab's sync) is never
 *    clobbered — the migration retries on conflict instead;
 *  - idempotent / restart-safe: documents already using the Map shape, and
 *    documents that disappear mid-run, are skipped, so the migration can run
 *    on every owner session and can be interrupted at any point;
 *  - lossless: a document whose `entries` contain an element that cannot be
 *    keyed (no bookingId) or two elements claiming the same booking is NOT
 *    converted — it is left readable in its current shape and reported in
 *    `dropped`, instead of being silently truncated;
 *  - owner-only: writes are performed with the owner session, which is the
 *    only role allowed to rewrite a queue document wholesale.
 *
 * Read paths (`utils/queue.js`) accept both shapes, so nothing breaks while
 * the migration has not run yet; each booking write also normalizes its own
 * day document (see `services/bookings.js`).
 */
import { collection, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { entriesToMapReported } from '../utils/queue';

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

  const wanted = Array.isArray(days) && days.length ? new Set(days) : null;

  const snap = await getDocs(collection(db, COLLECTIONS.DAILY_QUEUE));
  for (const docSnap of snap.docs) {
    if (wanted && !wanted.has(docSnap.id)) continue;
    result.scanned += 1;

    const data = docSnap.data() || {};
    if (!Array.isArray(data.entries)) {
      // Already the Map shape (or empty) — nothing to do.
      result.skipped += 1;
      continue;
    }

    // Report elements that cannot be keyed (they never carried a booking id,
    // or two of them claim the same booking). Such a document is NOT
    // converted: converting it would destroy an entry in silence. It stays
    // readable in its Array shape (read paths accept both) until it is fixed.
    const { problems } = entriesToMapReported(data.entries);
    const hasLossy = problems.some((p) => p.lossy);
    if (hasLossy) {
      // eslint-disable-next-line no-console
      console.warn(`migrateLegacyQueueDocs: ${docSnap.id} left unconverted`, problems);
      for (const p of problems) {
        if (p.lossy) {
          result.dropped.push({ day: docSnap.id, reason: p.reason, index: p.index });
        }
      }
      result.skipped += 1;
      continue;
    }

    // A document carrying an unknown field is left alone (the rewrite only
    // writes the canonical { date, entries, updatedAt }). Checked before the
    // transaction too so dryRun and real runs report identically.
    const extra = Object.keys(data).filter(
      (k) => k !== 'date' && k !== 'entries' && k !== 'updatedAt'
    );
    if (extra.length) {
      // eslint-disable-next-line no-console
      console.warn(`migrateLegacyQueueDocs: ${docSnap.id} left alone (unexpected-fields:${extra.join(',')})`);
      result.skipped += 1;
      continue;
    }

    if (dryRun) {
      result.migrated += 1;
      continue;
    }

    try {
      const outcome = await runTransaction(db, async (tx) => {
        // Re-read INSIDE the transaction: if the document changed after the
        // list above (a booking transaction, another tab's sync) we work
        // from the freshest state and never clobber that concurrent write.
        const fresh = await tx.get(docSnap.ref);
        if (!fresh.exists()) return { done: false, why: 'deleted' };

        const freshData = fresh.data() || {};
        if (!Array.isArray(freshData.entries)) {
          return { done: false, why: 'already-migrated' };
        }
        const freshExtra = Object.keys(freshData).filter(
          (k) => k !== 'date' && k !== 'entries' && k !== 'updatedAt'
        );
        if (freshExtra.length) return { done: false, why: 'unexpected-fields' };

        const reConverted = entriesToMapReported(freshData.entries);
        if (reConverted.problems.some((p) => p.lossy)) {
          // Became unkeyable after our first read: leave it, do not truncate.
          return { done: false, why: 'unconvertible', problems: reConverted.problems };
        }

        // The document id IS the day; write it so the hardened rules
        // (date == day) accept the document.
        tx.set(docSnap.ref, {
          date: fresh.id,
          entries: reConverted.map,
          updatedAt: serverTimestamp(),
        });
        return { done: true };
      });

      if (outcome.done) {
        result.migrated += 1;
      } else {
        result.skipped += 1;
        if (outcome.why === 'unconvertible') {
          // eslint-disable-next-line no-console
          console.warn(`migrateLegacyQueueDocs: ${docSnap.id} left unconverted`, outcome.problems);
          for (const p of outcome.problems) {
            if (p.lossy) {
              result.dropped.push({ day: docSnap.id, reason: p.reason, index: p.index });
            }
          }
        }
      }
    } catch (err) {
      result.skipped += 1;
      // eslint-disable-next-line no-console
      console.warn(`migrateLegacyQueueDocs: ${docSnap.id} not migrated`, err);
    }
  }
  return result;
}
