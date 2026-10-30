/**
 * Publishes a PII-free snapshot of the day's queue to `dailyQueue/{date}` so
 * clients can see their live position and expected time without being able to
 * read other clients' bookings (privacy preserved in the security rules).
 */
import { useEffect, useMemo } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/bootstrap';
import { todaysQueue } from '../utils/queue';

export function useQueueSync(date, bookings) {
  const entries = useMemo(
    () =>
      todaysQueue(bookings, date).map((b) => ({
        bookingId: b.id,
        expectedStart: b.expectedStart,
        durationMinutes: b.durationMinutes || 30,
        status: b.status,
      })),
    [bookings, date]
  );

  const key = JSON.stringify(entries);

  useEffect(() => {
    if (!db || !date) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, COLLECTIONS.DAILY_QUEUE, date);
        const snap = await getDoc(ref);
        if (cancelled) return;
        const prev = snap.exists() ? snap.data() : null;
        if (!prev || JSON.stringify(prev.entries || []) !== key) {
          await setDoc(ref, { date, entries: JSON.parse(key), updatedAt: serverTimestamp() });
        }
      } catch {
        /* best effort: the live queue card degrades to the booking's own times */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, key]);
}
