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
 * SAFETY (see tests/unit/queueSync.test.mjs and tests/emulator):
 *  - the document is NEVER rewritten wholesale from local state. Every write
 *    goes through a Firestore transaction that re-reads the stored document
 *    first and only ADDS local entries whose bookingId is missing there —
 *    stored entries (which may be newer, or written concurrently by a booking
 *    transaction) are always preserved, never deleted and never overwritten;
 *  - legacy Array documents are converted to the Map shape in the same
 *    transaction, carrying every keyable element over unchanged;
 *  - a document whose `entries` cannot be converted without losing data is
 *    left untouched (and reported) instead of being silently truncated;
 *  - an effect cleanup cancels the in-flight publish, so switching days never
 *    writes one day's data into another day's document.
 *
 * Best effort: on a rules/network error the live queue card degrades to the
 * booking's own times; the atomic transactions in `services/bookings.js`
 * remain the source of truth for every booking mutation.
 */
import { useEffect, useMemo, useRef } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/bootstrap';
import {
  entriesToMapReported,
  queueEntriesKey,
  queueEntryFromBooking,
  todaysQueue,
} from '../utils/queue';

/**
 * The PII-free entries Map of one day, built from the owner's bookings.
 * Exported (pure) so tests can assert the shape without touching Firestore.
 *
 * Only ACTIVE bookings are published — cancelled/completed/no-show ones are
 * not part of the live queue (that is a read-model decision, NOT a licence to
 * delete them from the document: see `mergeQueueEntries`).
 *
 * @param {Array} bookings all bookings the owner can see
 * @param {string} iso local day (YYYY-MM-DD)
 * @returns {object} map keyed by bookingId
 */
export function buildQueueEntries(bookings, iso) {
  const out = {};
  for (const b of todaysQueue(bookings, iso)) {
    out[b.id] = queueEntryFromBooking(b);
  }
  return out;
}

/**
 * Merge the local (just-built) queue entries into the STORED ones.
 *
 * Add-only: an entry is inserted only when its bookingId is absent from the
 * stored Map. Anything already stored wins — it was written by the atomic
 * booking transaction (or a newer sync) and is therefore at least as fresh as
 * the local snapshot, which can be stale by one render.
 *
 * This is what makes the sync non-destructive: entries for bookings the local
 * snapshot does not know about (cancelled/completed ones, another tab's
 * write, a concurrent booking transaction) are never removed, and a stored
 * entry is never rolled back to an older local value.
 *
 * @param {object} stored normalized stored entries Map (may be legacy-shaped,
 *   already normalized by the caller)
 * @param {object} local entries built by `buildQueueEntries`
 * @returns {{map: object, added: string[]}} merged map + ids actually added
 */
export function mergeQueueEntries(stored, local) {
  const map = { ...stored };
  const added = [];
  for (const [id, entry] of Object.entries(local || {})) {
    if (!Object.prototype.hasOwnProperty.call(map, id)) {
      map[id] = entry;
      added.push(id);
    }
  }
  return { map, added };
}

/**
 * Publish `localEntries` for `date`, merging into whatever is stored.
 *
 * Runs in a Firestore transaction so the read-modify-write cannot clobber a
 * concurrent change: the transaction re-reads the document, merges, and only
 * writes if something actually changed.
 *
 * Exported (pure-ish) so tests can drive it against the emulator directly.
 *
 * @param {string} date local day (YYYY-MM-DD) — also the document id
 * @param {object} local entries built by `buildQueueEntries`
 * @param {{isCancelled?: () => boolean}} [options] `isCancelled` is checked
 *   right before the write so a cleaned-up effect never commits
 * @returns {Promise<{written: boolean, reason?: string, added?: string[]}>}
 */
export async function publishQueueEntries(date, localEntries, options = {}) {
  const { isCancelled } = options;
  if (!db) return { written: false, reason: 'no-db' };
  const ref = doc(db, COLLECTIONS.DAILY_QUEUE, date);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    // Nothing stored yet: create the document with the local entries.
    if (!snap.exists()) {
      if (isCancelled && isCancelled()) return { written: false, reason: 'cancelled' };
      tx.set(ref, {
        date,
        entries: localEntries || {},
        updatedAt: serverTimestamp(),
      });
      return { written: true, added: Object.keys(localEntries || {}) };
    }

    const data = snap.data() || {};
    const { map: stored, problems } = entriesToMapReported(data.entries);
    const hasLossy = problems.some((p) => p.lossy);

    // A legacy Array is converted in place; a document whose entries cannot
    // be converted without losing data is left exactly as it is (still
    // readable by the tolerant read paths) instead of being truncated.
    const legacy = Array.isArray(data.entries);

    if (hasLossy) {
      // eslint-disable-next-line no-console
      console.warn(`useQueueSync: ${date} entries cannot be merged safely, left untouched`, problems);
      return { written: false, reason: 'unconvertible' };
    }

    // Only the documented fields are ever written; a document carrying an
    // unknown extra field is left alone rather than silently stripped of it.
    const extraKeys = Object.keys(data).filter(
      (k) => k !== 'date' && k !== 'entries' && k !== 'updatedAt'
    );
    if (extraKeys.length) {
      // eslint-disable-next-line no-console
      console.warn(`useQueueSync: ${date} has unexpected fields, left untouched`, extraKeys);
      return { written: false, reason: 'unexpected-fields' };
    }

    const { map, added } = mergeQueueEntries(stored, localEntries);

    // Already a Map for this day and nothing to add → do not touch the
    // document (no useless write, no `updatedAt` churn).
    if (!legacy && added.length === 0 && data.date === date) {
      return { written: false, reason: 'unchanged' };
    }

    if (isCancelled && isCancelled()) return { written: false, reason: 'cancelled' };

    tx.set(ref, {
      date,
      entries: map,
      updatedAt: serverTimestamp(),
    });
    return { written: true, added };
  });
}

/**
 * Keeps `dailyQueue/{date}` in sync with the owner's bookings.
 *
 * @param {string} date local day (YYYY-MM-DD)
 * @param {Array} bookings the owner's bookings (any day)
 */
export function useQueueSync(date, bookings) {
  const entries = useMemo(() => buildQueueEntries(bookings, date), [bookings, date]);
  const key = queueEntriesKey(entries);

  // The effect below re-runs when the PUBLISHED CONTENT changes (`key`), not
  // on every bookings-array identity change. The entries of the latest render
  // are read through a ref so the effect does not depend on `entries` itself;
  // this ref is kept current by an effect declared BEFORE the publishing one,
  // so it is always updated first within the same commit.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;

    publishQueueEntries(date, entriesRef.current, { isCancelled: () => cancelled }).catch(
      (err) => {
        // Best effort: the live queue card degrades to the booking's own
        // times; the booking transactions remain the source of truth.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('useQueueSync: queue publish failed', err);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [date, key]);

  return null;
}
