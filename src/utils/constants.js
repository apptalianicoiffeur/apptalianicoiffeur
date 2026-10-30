/**
 * Shared constants: booking statuses, sources and small app-wide values.
 */

/** Booking lifecycle statuses (stored in Firestore as strings). */
export const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ACCEPTED_MODIFIED: 'accepted_modified',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
};

/** Statuses that occupy a time slot (must be prevented from double booking). */
export const ACTIVE_STATUSES = [
  STATUS.PENDING,
  STATUS.ACCEPTED,
  STATUS.ACCEPTED_MODIFIED,
  STATUS.IN_PROGRESS,
];

/** Statuses shown in the client's "upcoming" list. */
export const UPCOMING_STATUSES = [
  STATUS.PENDING,
  STATUS.ACCEPTED,
  STATUS.ACCEPTED_MODIFIED,
  STATUS.IN_PROGRESS,
];

/** Where a booking came from. */
export const SOURCE = {
  ONLINE: 'online',
  WALK_IN: 'walk_in',
  MANUAL: 'manual',
};

/** Firestore collection names. */
export const COLLECTIONS = {
  USERS: 'users',
  SERVICES: 'services',
  BOOKINGS: 'bookings',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
  // Public, PII-free snapshot of the day's queue (owner-maintained):
  // { date, entries: [{ bookingId, expectedStart, durationMinutes, status }] }
  DAILY_QUEUE: 'dailyQueue',
};

/** Firestore document ids under `settings`. */
export const SETTINGS_DOCS = {
  PUBLIC: 'public', // shop status, weekly hours, availability (public read)
  PRIVATE: 'private', // WhatsApp templates (owner only)
};

/** Firestore field types helpers used by the calendar colors. */
export const SLOT_KIND = {
  FREE: 'free',
  BOOKED: 'booked',
  BLOCKED: 'blocked',
  BREAK: 'break',
  PAST: 'past',
};
