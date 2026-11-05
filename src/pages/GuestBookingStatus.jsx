import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, MessageCircle, Search } from 'lucide-react';
import t from '../i18n/ar';
import { useSettings } from '../context/SettingsContext';
import { formatDateLong } from '../utils/datetime';
import { waLink } from '../utils/whatsapp';
import { Field, FullSpinner, StatusChip } from '../components/ui';

function lookupError(code) {
  if (code === 'LOOKUP_NOT_CONFIGURED' || code === 'LOOKUP_MISCONFIGURED') {
    return t.guestBooking.lookupNotConfigured;
  }
  if (code === 'BOOKING_NOT_FOUND' || code === 'INVALID_INPUT') {
    return t.guestBooking.lookupNotFound;
  }
  return t.guestBooking.loadFailed;
}

export default function GuestBookingStatus() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const bookingId = searchParams.get('bookingId') || '';
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const { settings } = useSettings();
  const [bookingCode, setBookingCode] = useState('');
  const [phone, setPhone] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId || !token) {
      setLoading(false);
      setBooking(null);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    setBooking(null);

    fetch('/api/guest-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, token }),
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw Object.assign(new Error(), { code: result.code });
        setBooking(result.booking);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!err.code) console.error('Failed to load the guest booking status.', err);
        setError(lookupError(err.code));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bookingId, token]);

  async function findBooking(event) {
    event.preventDefault();
    setSearching(true);
    setError('');
    setBooking(null);
    try {
      const response = await fetch('/api/guest-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingCode, phone }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(lookupError(result.code));
        return;
      }
      setBooking(result.booking);
    } catch (err) {
      console.error('Failed to search for the guest booking.', err);
      setError(t.guestBooking.loadFailed);
    } finally {
      setSearching(false);
    }
  }

  if (loading) return <FullSpinner />;

  const isModified = booking?.status === 'accepted_modified' && booking.proposedDate && booking.proposedTime;
  const responseLink = (message) => waLink(settings.phone, message);

  return (
    <div className="max-w-lg mx-auto mt-6 animate-fade-in">
      <div className="card p-6">
        {!booking ? (
          <>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-gold-500/10 text-gold-300 flex items-center justify-center">
                <Search size={22} />
              </div>
              <h1 className="text-xl font-black mt-3">{t.guestBooking.title}</h1>
              <p className="text-sm text-slate-400 mt-2">{t.guestBooking.lookupHint}</p>
            </div>

            {error && <p role="alert" className="text-sm text-red-300 mt-4">{error}</p>}

            <form onSubmit={findBooking} className="mt-5">
              <Field label={t.guestBooking.bookingCodeLabel} htmlFor="guest-booking-code">
                <input
                  id="guest-booking-code"
                  className="input uppercase tracking-widest"
                  dir="ltr"
                  autoComplete="off"
                  maxLength={6}
                  value={bookingCode}
                  onChange={(event) => setBookingCode(event.target.value.toUpperCase())}
                  required
                />
              </Field>
              <Field label={t.guestBooking.phoneLabel} htmlFor="guest-booking-phone">
                <input
                  id="guest-booking-phone"
                  className="input"
                  dir="ltr"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </Field>
              <button type="submit" className="btn-gold w-full" disabled={searching}>
                <Search size={16} />
                {searching ? t.app.loading : t.guestBooking.lookup}
              </button>
            </form>

            <Link to="/booking" className="btn-ghost w-full mt-3">
              <CalendarDays size={15} /> {t.landing.bookNow}
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-black">{t.guestBooking.title}</h1>
                <p className="text-sm text-slate-400 mt-1">{booking.name}</p>
              </div>
              <StatusChip status={booking.status} />
            </div>

            <div className="mt-5 space-y-3 rounded-2xl bg-ink-700/60 p-4">
              <div className="flex justify-between gap-3">
                <p className="text-xs text-slate-400">{t.guestBooking.bookingCode}</p>
                <p className="font-mono font-black tracking-widest text-gold-300" dir="ltr">{booking.code}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">{t.myBookings.service}</p>
                <p className="font-bold">{booking.serviceName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">{t.booking.confirmDateTime}</p>
                <p className="font-bold">{formatDateLong(booking.date)} — {booking.scheduledStart}</p>
              </div>
              {isModified && (
                <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
                  <p className="text-xs text-sky-200 font-bold">{t.guestBooking.proposedTime}</p>
                  <p className="mt-1 font-extrabold text-sky-100">
                    {formatDateLong(booking.proposedDate)} — {booking.proposedTime}
                  </p>
                </div>
              )}
              {booking.barberMessage && (
                <div>
                  <p className="text-xs text-slate-400">{t.myBookings.barberMessage}</p>
                  <p className="text-sm mt-1">{booking.barberMessage}</p>
                </div>
              )}
              <p className="text-xs text-slate-400">{t.guestBooking.keepLink}</p>
            </div>

            {isModified && settings.phone && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-slate-400">{t.guestBooking.replyHint}</p>
                {[
                  [t.guestBooking.acceptProposal, t.guestBooking.acceptMessage],
                  [t.guestBooking.requestAnotherTime, t.guestBooking.anotherTimeMessage],
                  [t.guestBooking.declineProposal, t.guestBooking.declineMessage],
                ].map(([label, message]) => {
                  const href = responseLink(`${message} ${booking.id}`);
                  return (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="btn-outline w-full">
                      <MessageCircle size={15} /> {label}
                    </a>
                  );
                })}
              </div>
            )}

            <Link to="/track" className="btn-outline w-full mt-4">
              <Search size={15} /> {t.guestBooking.searchAgain}
            </Link>
            <Link to="/booking" className="btn-ghost w-full mt-2">
              <CalendarDays size={15} /> {t.landing.bookNow}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
