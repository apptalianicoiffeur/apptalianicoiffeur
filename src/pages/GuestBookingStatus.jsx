import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, MessageCircle } from 'lucide-react';
import t from '../i18n/ar';
import { useSettings } from '../context/SettingsContext';
import { formatDateLong } from '../utils/datetime';
import { waLink } from '../utils/whatsapp';
import { FullSpinner, StatusChip } from '../components/ui';

export default function GuestBookingStatus() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const bookingId = searchParams.get('bookingId') || '';
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const { settings } = useSettings();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
        if (!response.ok || !result.ok) throw new Error(result.error || t.guestBooking.loadFailed);
        setBooking(result.booking);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load the guest booking status.', err);
        setError(err.message || t.guestBooking.loadFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bookingId, token]);

  if (loading) return <FullSpinner />;

  if (error || !booking) {
    return (
      <div className="max-w-lg mx-auto mt-8 card p-6 text-center">
        <h1 className="text-xl font-black">{t.guestBooking.title}</h1>
        <p className="text-sm text-red-300 mt-3">{error || t.guestBooking.loadFailed}</p>
        <Link to="/booking" className="btn-gold inline-flex mt-5">
          {t.landing.bookNow}
        </Link>
      </div>
    );
  }

  const isModified = booking.status === 'accepted_modified' && booking.proposedDate && booking.proposedTime;
  const responseLink = (message) => waLink(settings.phone, message);

  return (
    <div className="max-w-lg mx-auto mt-6 animate-fade-in">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">{t.guestBooking.title}</h1>
            <p className="text-sm text-slate-400 mt-1">{booking.name}</p>
          </div>
          <StatusChip status={booking.status} />
        </div>

        <div className="mt-5 space-y-3 rounded-2xl bg-ink-700/60 p-4">
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

        <Link to="/booking" className="btn-ghost w-full mt-4">
          <CalendarDays size={15} /> {t.landing.bookNow}
        </Link>
      </div>
    </div>
  );
}
