/**
 * Booking actions used by the UI.
 *
 * Every action:
 *  1. writes the change to Firestore,
 *  2. creates an in-app notification for the affected user (instant, free),
 *  3. best-effort triggers a push notification through the Pages Function.
 *
 * Owner actions require the owner session; the Firestore rules re-check this.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './bootstrap';
import { STATUS } from '../utils/constants';
import { addMinutes, formatDateLong } from '../utils/datetime';
import { fillTemplate, templateVars } from '../utils/whatsapp';
import {
  createBookingWithCheck,
  updateBooking,
  updateBookingsWithQueue,
  assertSlotFree,
} from './bookings';
import { createNotification } from './notifications';
import { sendPushToToken } from './push';
import t from '../i18n/ar';

/** Fetch the FCM token of a user (owner session only, per security rules). */
export async function getUserPushToken(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    return snap.exists() ? snap.data()?.fcmToken || null : null;
  } catch {
    return null;
  }
}

/** Create the in-app notification + best-effort push for one user. */
export async function notifyUser({ uid, title, body, bookingId = null, push = true }) {
  if (!uid || !title) return;
  await createNotification({ userId: uid, bookingId, title, body });
  if (push) {
    const token = await getUserPushToken(uid);
    if (token) await sendPushToToken(token, title, body, { bookingId: bookingId || '' });
  }
}

/** Fill `{placeholders}` inside an Arabic notification message. */
const fill = (str, vars) => fillTemplate(str, vars);

/** Notification variables for a booking (client-facing messages). */
function varsFor(booking, settings) {
  return {
    ...templateVars(booking, settings),
    date: formatDateLong(booking.date),
    time: booking.scheduledStart,
    reason: booking.barberMessage ? `${booking.barberMessage}` : '',
  };
}

/* ------------------------------------------------------------------ */
/* Client actions                                                      */
/* ------------------------------------------------------------------ */

/** Send an in-app notification to the barber (owner) about a client decision. */
async function notifyOwner(settings, title, body, bookingId) {
  const ownerUid = settings?.ownerUid;
  if (!ownerUid || !title) return;
  // Clients cannot push to the owner's device (the push function only accepts
  // the owner's own token), so this stays an in-app notification.
  // Best effort: the booking change itself already succeeded, and the rules
  // may deny this write (e.g. ownerUid not published yet) — the client action
  // must not fail because of it.
  try {
    await createNotification({ userId: ownerUid, bookingId, title, body });
  } catch {
    /* in-app notification is a convenience, not part of the booking state */
  }
}

/** Accept the barber's modified time: the new time becomes the booked time. */
export async function clientAcceptModification(booking, settings) {
  await updateBooking(booking.id, {
    status: STATUS.ACCEPTED,
    date: booking.proposedDate,
    scheduledStart: booking.proposedTime,
    scheduledEnd: addMinutes(booking.proposedTime, booking.durationMinutes || 30),
    expectedStart: booking.proposedTime,
    expectedEnd: addMinutes(booking.proposedTime, booking.durationMinutes || 30),
    proposedDate: null,
    proposedTime: null,
  });
  await notifyOwner(
    settings,
    t.notifications.changeConfirmedTitle,
    fill(t.notifications.changeConfirmedBody, {
      client_name: booking.name,
      service: booking.serviceName,
      date: formatDateLong(booking.proposedDate),
      time: booking.proposedTime,
    }),
    booking.id
  );
}

/** Refuse the modification: the booking goes back to pending. */
export async function clientDeclineModification(booking, settings) {
  await updateBooking(booking.id, {
    status: STATUS.PENDING,
    proposedDate: null,
    proposedTime: null,
    barberMessage: '',
  });
  await notifyOwner(
    settings,
    t.notifications.changeRefusedTitle,
    fill(t.notifications.changeRefusedBody, { client_name: booking.name }),
    booking.id
  );
}

/** Propose another date/time to the barber (booking stays pending). */
export async function clientProposeTime(booking, { date, time }, settings) {
  // The proposed slot must really be free (checked against the public queue
  // document), otherwise the barber would accept an impossible time.
  await assertSlotFree(date, time, booking.durationMinutes || 30, booking.id);
  await updateBooking(booking.id, {
    status: STATUS.PENDING,
    clientProposedDate: date,
    clientProposedTime: time,
  });
  await notifyOwner(
    settings,
    t.notifications.proposalTitle,
    fill(t.notifications.proposalBody, {
      client_name: booking.name,
      service: booking.serviceName,
      date: formatDateLong(date),
      time,
    }),
    booking.id
  );
}

/** Cancel an upcoming booking (client side). */
export async function clientCancelBooking(booking, settings) {
  await updateBooking(booking.id, { status: STATUS.CANCELLED });
  await notifyOwner(
    settings,
    t.notifications.cancelledTitle,
    fill(t.notifications.cancelledBody, {
      client_name: booking.name,
      date: formatDateLong(booking.date),
      time: booking.scheduledStart,
    }),
    booking.id
  );
}

/* ------------------------------------------------------------------ */
/* Owner actions                                                       */
/* ------------------------------------------------------------------ */

/** 1) Accept at the requested time. */
export async function ownerAccept(booking, settings) {
  await updateBooking(booking.id, { status: STATUS.ACCEPTED, barberMessage: '' });
  const vars = varsFor(booking, settings);
  await notifyUser({
    uid: booking.userId,
    bookingId: booking.id,
    title: t.notifications.acceptedTitle,
    body: fill(t.notifications.acceptedBody, vars),
  });
}

/** 2) Accept with a modified date/time (client must confirm). */
export async function ownerAcceptModified(booking, { date, time, note = '' }, settings) {
  await updateBooking(booking.id, {
    status: STATUS.ACCEPTED_MODIFIED,
    proposedDate: date,
    proposedTime: time,
    barberMessage: note,
  });
  const vars = varsFor({ ...booking, proposedDate: date, proposedTime: time }, settings);
  await notifyUser({
    uid: booking.userId,
    bookingId: booking.id,
    title: t.notifications.modifiedTitle,
    body: fill(t.notifications.modifiedBody, {
      ...vars,
      date: formatDateLong(date),
      time,
    }),
  });
}

/** 3) Decline with an optional reason. */
export async function ownerDecline(booking, reason, settings) {
  await updateBooking(booking.id, { status: STATUS.DECLINED, barberMessage: reason || '' });
  const vars = varsFor(booking, settings);
  await notifyUser({
    uid: booking.userId,
    bookingId: booking.id,
    title: t.notifications.declinedTitle,
    body: fill(t.notifications.declinedBody, { ...vars, reason: reason || '' }),
  });
}

/** Owner-side status change: completed / no-show / cancelled. */
export async function ownerSetStatus(booking, status, settings) {
  const patch = { status };
  if (status === STATUS.COMPLETED) {
    patch.actualEnd = booking.actualEnd || new Date().toTimeString().slice(0, 5);
  }
  await updateBooking(booking.id, patch);
  if (status === STATUS.COMPLETED) {
    await notifyUser({
      uid: booking.userId,
      bookingId: booking.id,
      title: t.notifications.completedTitle,
      body: fill(t.notifications.completedBody, varsFor(booking, settings)),
    });
  }
}

/** Start the session for a client: records the ACTUAL start time. */
export async function ownerStartSession(booking) {
  await updateBooking(booking.id, {
    status: STATUS.IN_PROGRESS,
    actualStart: new Date().toTimeString().slice(0, 5),
  });
}

/**
 * End the running session: records the ACTUAL end time.
 * The dashboard computes the resulting gap/delay from the queue itself
 * (see utils/queue.js) and then applies the shift.
 */
export async function ownerEndSession(booking) {
  const actualEnd = new Date().toTimeString().slice(0, 5);
  await updateBooking(booking.id, { status: STATUS.COMPLETED, actualEnd });
  return { actualEnd };
}

/**
 * Apply a cascading shift to the following appointments:
 * updates `expectedStart/expectedEnd` (all bookings + their queue entries in
 * ONE transaction) and notifies each affected client.
 */
export async function ownerApplyShift(changes, settings) {
  if (changes.length) {
    await updateBookingsWithQueue(
      changes.map((change) => ({
        id: change.booking.id,
        data: { expectedStart: change.newStart, expectedEnd: change.newEnd },
      }))
    );
  }
  for (const change of changes) {
    const b = change.booking;
    const vars = varsFor({ ...b, proposedTime: change.newStart }, settings);
    await notifyUser({
      uid: b.userId,
      bookingId: b.id,
      title: t.notifications.timeShiftedTitle,
      body: fill(t.notifications.timeShiftedBody, {
        ...vars,
        time: change.newStart,
        oldTime: b.expectedStart,
        old_time: b.expectedStart, // WhatsApp template placeholder
      }),
    });
  }
}

/** Pull the next client forward into a free gap (barber approval = the tap). */
export async function ownerPullForward(booking, newStart, settings) {
  const end = addMinutes(newStart, booking.durationMinutes || 30);
  await updateBooking(booking.id, { expectedStart: newStart, expectedEnd: end });
  await notifyUser({
    uid: booking.userId,
    bookingId: booking.id,
    title: t.notifications.timePulledTitle,
    body: fill(t.notifications.timePulledBody, { time: newStart }),
  });
}

/** Create a walk-in / phone booking directly into the schedule. */
export async function ownerCreateWalkIn(payload, settings) {
  const id = await createBookingWithCheck({
    userId: null,
    name: payload.name,
    phone: payload.phone,
    serviceId: payload.serviceId,
    serviceName: payload.serviceName,
    price: payload.price,
    durationMinutes: payload.durationMinutes,
    date: payload.date,
    scheduledStart: payload.time,
    scheduledEnd: addMinutes(payload.time, payload.durationMinutes),
    expectedStart: payload.time,
    expectedEnd: addMinutes(payload.time, payload.durationMinutes),
    actualStart: null,
    actualEnd: null,
    status: STATUS.ACCEPTED,
    proposedDate: null,
    proposedTime: null,
    clientProposedDate: null,
    clientProposedTime: null,
    barberMessage: '',
    notes: payload.notes || '',
    source: 'walk_in',
  });
  return id;
}
