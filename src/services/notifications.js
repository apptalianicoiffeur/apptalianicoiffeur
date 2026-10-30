/**
 * In-app notifications (pure Firestore, works instantly without any server).
 * Every notification is a document in `notifications`; the target user listens
 * to their own collection in real time.
 */
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';

const col = () => collection(db, COLLECTIONS.NOTIFICATIONS);

/** Subscribe to the latest notifications of a user. Returns an unsubscribe fn. */
export function listenNotifications(uid, callback, max = 60) {
  if (!uid) return () => {};
  const q = query(col(), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

/**
 * Create a notification for a user.
 * Guests have no account, so their bookings only notify the owner.
 */
export async function createNotification({ userId, bookingId = null, title, body }) {
  if (!userId || !title) return null;
  const ref = await addDoc(col(), {
    userId,
    bookingId,
    title,
    body,
    read: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Mark one notification as read. */
export async function markRead(id) {
  if (!id) return;
  await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { read: true });
}

/** Mark many notifications as read in one batch. */
export async function markManyRead(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return;
  const batch = writeBatch(db);
  list.forEach((id) => batch.update(doc(db, COLLECTIONS.NOTIFICATIONS, id), { read: true }));
  await batch.commit();
}
