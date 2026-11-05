/** Generate a URL-safe, high-entropy bearer token for a guest booking link. */
export function createGuestTrackingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function guestTrackingPath(booking) {
  if (!booking?.id || !/^[0-9a-f]{64}$/.test(booking.guestTrackingToken || '')) return null;
  const params = new URLSearchParams({
    bookingId: booking.id,
  });
  return `/track?${params}#token=${booking.guestTrackingToken}`;
}

export function guestTrackingUrl(booking, origin = window.location.origin) {
  const path = guestTrackingPath(booking);
  return path ? new URL(path, origin).href : null;
}
