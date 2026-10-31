/**
 * Publishes a PII-free snapshot of the day's queue to `dailyQueue/{date}` so
 * clients can see their live position and expected time without being able to
 * read other clients' bookings (privacy preserved in the security rules).
 *
 * `entries` is written as a Map keyed by bookingId
 * (`{ [bookingId]: { bookingId, expectedStart, durationMinutes, status } }`),
 * which lets the rules bind every entry to exactly one booking and lets the
 * app update one entry atomically without touching the others.
 *
 * Best effort: on a rules/network error the live queue card degrades to the
 * booking's own times; the atomic transactions in `services/bookings.js`
 * remain the source of truth for every booking mutation.
 */
import { useEffect, useMemo } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/bootstrap';
import { queueEntriesKey, queueEntryFromBooking, todaysQueue } from '../utils/queue';

/**
 * The PII-free entries Map of one day, built from the owner's bookings.
 * Exported (pure) so it can be unit tested without rendering the hook.
 *
 * @param {Array} bookings all bookings known to the owner session
 * @param {string} date ISO date being published
 * @returns {object} `{ [bookingId]: entry }`
 */
export function buildQueueEntries(bookings, date) {
  const entries = {};
  for (const b of todaysQueue(bookings, date)) {
    entries[b.id] = queueEntryFromBooking(b);
  }
  return entries;
}

export function useQueueSync(date, bookings) {
  const entries = useMemo(() => buildQueueEntries(bookings, date), [bookings, date]);
  const key = queueEntriesKey(entries);

  useEffect(() => {
    if (!db || !date) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, COLLECTIONS.DAILY_QUEUE, date);
        const snap = await getDoc(ref);
        if (cancelled) return;
        const prev = snap.exists() ? snap.data() : null;
        // Shape-independent comparison: a legacy Array document is republished
        // (and thereby migrated) as soon as it differs from the live queue.
        if (!prev || queueEntriesKey(prev.entries) !== key || Array.isArray(prev.entries)) {
          await setDoc(ref, { date, entries, updatedAt: serverTimestamp() });
        }
      } catch {
        /* best effort: the live queue card degrades to the booking's own times */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, key, entries]);
}
