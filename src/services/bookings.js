/**
 * Booking persistence helpers.
 * Double booking is prevented inside a Firestore transaction: the client
 * re-reads the day's PII-free queue document (`dailyQueue/{date}`, public by
 * the security rules) and refuses to write when the slot overlaps another
 * active booking. The same document is then appended with the new entry, so
 * every other visitor sees the slot as taken in real time.
 * (The security rules additionally validate every field.)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { STATUS } from '../utils/constants';
import { timeToMin } from '../utils/datetime';
import { busyFromQueue } from '../utils/queue';

/** Thrown when the chosen slot was taken by someone else a moment before. */
export class SlotTakenError extends Error {
  constructor() {
    super('slot taken');
    this.code = 'SLOT_TAKEN';
  }
}

const bookingsCol = () => collection(db, COLLECTIONS.BOOKINGS);

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
    const queueRef = doc(db, COLLECTIONS.DAILY_QUEUE, payload.date);
    const queueSnap = await tx.get(queueRef);
    const entries = queueSnap.exists() ? queueSnap.data().entries || [] : [];

    const conflict = busyFromQueue({ entries }).some((b) => start < b.end && b.start < end);
    if (conflict) throw new SlotTakenError();

    const newRef = doc(bookingsCol());
    tx.set(newRef, {
      ...payload,
      code: makeCode(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Append exactly one entry (the rules allow clients to append one only).
    tx.set(
      queueRef,
      {
        date: payload.date,
        entries: [
          ...entries,
          {
            bookingId: newRef.id,
            expectedStart: payload.expectedStart || payload.scheduledStart,
            durationMinutes: Number(payload.durationMinutes || 30),
            status: payload.status,
          },
        ],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return newRef;
  });
  return ref.id;
}

/**
 * Throw SlotTakenError when a time on a date overlaps an active entry of the
 * public queue document (used before accepting a client's time proposal).
 */
export async function assertSlotFree(date, time, durationMinutes, ignoreBookingId = null) {
  const snap = await getDoc(doc(db, COLLECTIONS.DAILY_QUEUE, date));
  const entries = snap.exists() ? snap.data().entries || [] : [];
  const start = timeToMin(time);
  const end = start + Number(durationMinutes || 30);
  const conflict = busyFromQueue({ entries }, { ignoreBookingId }).some(
    (b) => start < b.end && b.start < end
  );
  if (conflict) throw new SlotTakenError();
}

/** Patch fields on a booking (adds `updatedAt`). */
export async function updateBooking(id, data) {
  await updateDoc(doc(db, COLLECTIONS.BOOKINGS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
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
