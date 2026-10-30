/**
 * Booking persistence helpers.
 * Double booking is prevented inside a Firestore transaction: the client
 * re-reads the whole day and refuses to write when the slot overlaps another
 * active booking. (The security rules additionally validate every field.)
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { ACTIVE_STATUSES, STATUS } from '../utils/constants';
import { timeToMin } from '../utils/datetime';

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
 * @param {object} payload booking fields (see README data model)
 * @returns {Promise<string>} the new booking id
 */
export async function createBookingWithCheck(payload) {
  const ref = await runTransaction(db, async (tx) => {
    const dayQuery = query(bookingsCol(), where('date', '==', payload.date));
    const snap = await tx.get(dayQuery);
    const start = timeToMin(payload.scheduledStart);
    const end = start + Number(payload.durationMinutes || 30);

    const conflict = snap.docs.some((d) => {
      const b = d.data();
      if (!ACTIVE_STATUSES.includes(b.status)) return false;
      const bStart = timeToMin(b.expectedStart || b.scheduledStart);
      const bEnd = timeToMin(b.expectedEnd || b.scheduledEnd);
      return start < bEnd && bStart < end;
    });
    if (conflict) throw new SlotTakenError();

    const newRef = doc(bookingsCol());
    tx.set(newRef, {
      ...payload,
      code: makeCode(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newRef;
  });
  return ref.id;
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
