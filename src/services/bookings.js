/**
 * Booking persistence helpers.
 *
 * Every mutation of a booking is a Firestore transaction that also keeps the
 * PII-free `dailyQueue/{date}` document(s) in sync — for ALL affected dates,
 * not only today:
 *
 *  - create: double booking is prevented by re-reading the day's queue
 *    document and refusing any overlap; the new entry is written in the same
 *    transaction (every other visitor sees the slot as taken in real time).
 *  - update: the booking and its queue entry move together (status, expected
 *    time, duration); when the DATE changes the entry is removed from the
 *    previous day's document and added to the new one, atomically.
 *  - every write normalizes legacy Array `entries` to the Map shape
 *    (`entries: { [bookingId]: entry }`), so documents are migrated as they
 *    are touched even before the explicit migration runs;
 *  - a document whose `entries` hold an element that cannot be keyed (no
 *    bookingId, two elements claiming one booking, a non-object value) is
 *    NEVER rewritten: the transaction is aborted with
 *    `QueueDataCorruptedError` instead of dropping that element. Only
 *    non-lossy problems (a key disagreeing with its own value) are repaired
 *    silently by the normalization.
 * (The security rules additionally validate every field.)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  runTransaction,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { STATUS } from '../utils/constants';
import { timeToMin } from '../utils/datetime';
import {
  busyFromQueue,
  entriesToMap,
  entriesToMapReported,
  isLegacyEntries,
  queueEntryFromBooking,
  queueEntryMatches,
} from '../utils/queue';

/** Thrown when the chosen slot was taken by someone else a moment before. */
export class SlotTakenError extends Error {
  constructor() {
    super('slot taken');
    this.code = 'SLOT_TAKEN';
  }
}

/** Thrown when the booking id does not exist (update/delete of a ghost). */
export class BookingNotFoundError extends Error {
  constructor() {
    super('booking not found');
    this.code = 'BOOKING_NOT_FOUND';
  }
}

/**
 * Thrown when a `dailyQueue/{date}` document holds `entries` that cannot be
 * converted to the Map shape WITHOUT LOSING an element. The transaction is
 * aborted so nothing is written and no stored entry is destroyed: the day
 * stays exactly as it was (and still readable) until the offending element is
 * repaired by hand.
 */
export class QueueDataCorruptedError extends Error {
  /**
   * @param {string} date the day document that refused to be rewritten
   * @param {Array<{index: (number|string), reason: string}>} problems lossy
   *   problems reported by `entriesToMapReported`
   */
  constructor(date, problems) {
    super(
      `dailyQueue/${date} cannot be rewritten without losing data: ` +
        problems.map((p) => p.reason).join('; ')
    );
    this.code = 'QUEUE_DATA_CORRUPT';
    this.date = date;
    this.problems = problems;
  }
}

const bookingsCol = () => collection(db, COLLECTIONS.BOOKINGS);
const queueRef = (date) => doc(db, COLLECTIONS.DAILY_QUEUE, date);

/**
 * The Map form of a queue document for a WRITE path.
 *
 * Every problem is logged; a LOSSY one (an element that cannot be keyed) then
 * aborts the caller with `QueueDataCorruptedError`, because the write would
 * otherwise replace the stored list with a Map that silently lost that
 * element. Non-lossy problems (a key that disagrees with its own value) keep
 * the current policy: they are repaired by the normalization, nothing is lost.
 *
 * @param {Array|object|null|undefined} raw stored `entries`
 * @param {string} date day being read (only used for the messages)
 * @returns {object} map keyed by bookingId
 * @throws {QueueDataCorruptedError} when the conversion would lose data
 */
function queueEntriesForWrite(raw, date) {
  const { map, problems } = entriesToMapReported(raw);
  const lossy = problems.filter((p) => p.lossy);

  if (problems.length) {
    const suffix = lossy.length ? ' — write refused' : ' (key repaired)';
    // eslint-disable-next-line no-console
    console.warn(
      `bookings: dailyQueue/${date} — ` +
        problems.map((p) => p.reason).join('; ') +
        suffix
    );
  }
  if (lossy.length) throw new QueueDataCorruptedError(date, lossy);
  return map;
}

/** Short human-friendly code shown to clients (6 chars). */
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Create a booking inside a transaction with a double-booking check.
 * The overlap check and the availability shown in the UI both read the
 * public `dailyQueue/{date}` document instead of the private bookings.
 * @param {object} payload booking fields (see README data model)
 * @returns {Promise<string>} the new booking id
 */
export async function createBookingWithCheck(payload) {
  const start = timeToMin(payload.scheduledStart);
  const end = start + Number(payload.durationMinutes || 30);

  const ref = await runTransaction(db, async (tx) => {
    const qRef = queueRef(payload.date);
    const queueSnap = await tx.get(qRef);
    // Write path: refuses the whole transaction when the stored entries hold
    // an element the Map shape would lose (see `QueueDataCorruptedError`).
    const entries = queueEntriesForWrite(
      queueSnap.exists() ? queueSnap.data().entries : null,
      payload.date
    );

    const conflict = busyFromQueue({ entries }).some((b) => start < b.end && b.start < end);
    if (conflict) throw new SlotTakenError();

    const newRef = doc(bookingsCol());
    tx.set(newRef, {
      ...payload,
      code: makeCode(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    entries[newRef.id] = queueEntryFromBooking({
      id: newRef.id,
      ...payload,
      expectedStart: payload.expectedStart || payload.scheduledStart,
    });
    // Full replace: the document only ever holds { date, entries, updatedAt }.
    tx.set(qRef, { date: payload.date, entries, updatedAt: serverTimestamp() });
    return newRef;
  });
  return ref.id;
}

/**
 * Throw SlotTakenError when a time on a date overlaps an active entry of the
 * public queue document (used before accepting a client's time proposal).
 */
export async function assertSlotFree(date, time, durationMinutes, ignoreBookingId = null) {
  const snap = await getDoc(queueRef(date));
  // READ path: tolerant by design (a proposal check must not throw on a
  // corrupt element) — but every unusable element is still reported loudly
  // in the console instead of vanishing in silence.
  const entries = entriesToMap(snap.exists() ? snap.data().entries : null, (problem) => {
    // eslint-disable-next-line no-console
    console.warn(`bookings: dailyQueue/${date} — ${problem.reason}`);
  });
  const start = timeToMin(time);
  const end = start + Number(durationMinutes || 30);
  const conflict = busyFromQueue({ entries }, { ignoreBookingId }).some(
    (b) => start < b.end && b.start < end
  );
  if (conflict) throw new SlotTakenError();
}

/**
 * Apply one or many booking patches atomically, keeping the queue documents
 * of every affected date in sync inside the SAME transaction:
 *
 *  - the entry of each booking matches its after-state (date, expectedStart,
 *    durationMinutes, status) on its current day;
 *  - when a booking moves to another date its entry is removed from the
 *    previous day's document (which also normalizes legacy Array documents).
 *
 * All reads happen before all writes so several bookings sharing one date
 * document are handled correctly.
 *
 * @param {Array<{id: string, data: object}>} changes
 */
async function commitBookingChanges(changes) {
  if (!changes.length) return;
  await runTransaction(db, async (tx) => {
    /* Phase 1: read the bookings. */
    const items = changes.map((c) => ({ ...c, ref: doc(bookingsCol(), c.id) }));
    for (const item of items) {
      const snap = await tx.get(item.ref);
      if (!snap.exists()) throw new BookingNotFoundError();
      item.before = snap.data();
    }

    /* Phase 2: read every affected queue document exactly once. */
    const dates = new Set();
    for (const item of items) {
      dates.add(item.before.date);
      dates.add({ ...item.before, ...item.data }.date);
    }
    const queueDocs = new Map();
    for (const date of dates) {
      if (!date) continue;
      const ref = queueRef(date);
      const snap = await tx.get(ref);
      const exists = snap.exists();
      const raw = exists ? snap.data().entries : null;
      queueDocs.set(date, {
        ref,
        date,
        exists,
        legacy: isLegacyEntries(raw),
        storedDate: exists ? snap.data().date : undefined,
        // Write path: throws (aborting the whole transaction) when this
        // document cannot be converted without losing an element.
        entries: queueEntriesForWrite(raw, date),
        dirty: false,
      });
    }

    /* Phase 3: compute the booking writes and the queue deltas. */
    for (const item of items) {
      const after = { ...item.before, ...item.data };
      tx.update(item.ref, { ...item.data, updatedAt: serverTimestamp() });

      // 1) current day: the entry must mirror the booking's after-state.
      const current = queueDocs.get(after.date);
      if (current) {
        const wanted = queueEntryFromBooking({ id: item.ref.id, ...after });
        const stored = current.entries[item.ref.id];
        const inSync =
          current.exists &&
          !current.legacy &&
          current.storedDate === after.date &&
          queueEntryMatches(stored, wanted);
        if (!inSync) {
          current.entries[item.ref.id] = wanted;
          current.dirty = true;
        }
      }

      // 2) previous day: the entry must leave with the booking.
      const previous =
        item.before.date && item.before.date !== after.date
          ? queueDocs.get(item.before.date)
          : null;
      if (previous && previous.exists) {
        const had = item.ref.id in previous.entries;
        // Legacy documents are always rewritten so they become Maps.
        if (had || previous.legacy) {
          delete previous.entries[item.ref.id];
          previous.dirty = true;
        }
      }
    }

    /* Phase 4: commit the queue documents. */
    for (const q of queueDocs.values()) {
      if (q.dirty) {
        tx.set(q.ref, { date: q.date, entries: q.entries, updatedAt: serverTimestamp() });
      }
    }
  });
}

/**
 * Patch fields on a booking (adds `updatedAt`) and atomically syncs the
 * queue entry of every affected date. Prefer this over a raw update so the
 * public queue can never drift from the booking.
 */
export async function updateBooking(id, data) {
  await commitBookingChanges([{ id, data }]);
}

/** Same as `updateBooking` but for many bookings in ONE transaction. */
export async function updateBookingsWithQueue(changes) {
  await commitBookingChanges(changes);
}

/** Fetch every booking of one day (owner uses this for the calendar). */
export async function fetchDayBookings(iso) {
  const q = query(bookingsCol(), where('date', '==', iso), orderBy('scheduledStart', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** True when a booking can still be changed/cancelled by the client. */
export function isUpcoming(booking) {
  return (
    [STATUS.PENDING, STATUS.ACCEPTED, STATUS.ACCEPTED_MODIFIED, STATUS.IN_PROGRESS].includes(
      booking.status
    ) && booking.date >= new Date().toISOString().slice(0, 10)
  );
}
