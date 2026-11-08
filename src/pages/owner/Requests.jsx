/**
 * Booking requests: accept / accept with modification / decline, plus
 * call, WhatsApp, and the completed / no-show / cancelled transitions.
 * Filterable by status, date and client name/phone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  Search,
  UserX,
  XCircle,
} from 'lucide-react';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useNotifications } from '../../context/NotificationsContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCollection, useDocument } from '../../hooks/useCollection';
import { STATUS } from '../../utils/constants';
import { addDays, formatDateLong, formatRelative, todayISO } from '../../utils/datetime';
import { openWhatsApp, telLink, fillTemplate, templateVars } from '../../utils/whatsapp';
import { bookingTrackingUrl } from '../../utils/guestTracking';
import { ownerSetStatus } from '../../services/bookingActions';
import RequestActions from '../../components/owner/RequestActions';
import { EmptyState, ErrorState, FullSpinner, Spinner, StatusChip } from '../../components/ui';

const STATUS_FILTERS = [
  { key: 'pending', label: t.status.pending },
  { key: 'active', label: t.owner.filterActive },
  { key: 'all', label: t.app.all },
];

/** Owner-side action row for an already-accepted booking. */
function AcceptedActions({ booking, onChanged }) {
  const { settings, templates } = useSettings();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const act = async (status, message) => {
    if (busy) return;
    setBusy(true);
    try {
      await ownerSetStatus(booking, status, settings);
      toast(message);
      onChanged?.();
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  const wa = () => {
    const key = booking.status === STATUS.ACCEPTED_MODIFIED ? 'acceptModified' : 'accept';
    const trackingUrl = bookingTrackingUrl(booking);
    const text = fillTemplate(templates[key], {
      ...templateVars(booking, settings),
      date: formatDateLong(booking.date),
      new_date: booking.proposedDate ? formatDateLong(booking.proposedDate) : '',
      tracking_url: trackingUrl || '',
    });
    const message =
      trackingUrl && !templates[key]?.includes('{tracking_url}')
        ? `${text}\nرابط متابعة الحجز: ${trackingUrl}`
        : text;
    openWhatsApp(booking.phone, message);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-success btn-sm" disabled={busy} onClick={() => act(STATUS.COMPLETED, t.owner.markCompleted)}>
        {busy ? <Spinner size={13} /> : <CheckCircle2 size={13} />} {t.owner.markCompleted}
      </button>
      <button className="btn-danger btn-sm" disabled={busy} onClick={() => act(STATUS.NO_SHOW, t.owner.markNoShow)}>
        <UserX size={13} /> {t.owner.markNoShow}
      </button>
      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act(STATUS.CANCELLED, t.owner.markCancelled)}>
        <XCircle size={13} /> {t.owner.markCancelled}
      </button>
      {telLink(booking.phone) && (
        <a className="btn-ghost btn-sm" href={telLink(booking.phone)}>
          <PhoneCall size={13} /> {t.owner.call}
        </a>
      )}
      <button
        className="btn-ghost btn-sm !text-emerald-300 hover:!bg-emerald-500/10"
        onClick={wa}
      >
        <MessageCircle size={13} /> {t.owner.whatsapp}
      </button>
    </div>
  );
}

function RequestCard({ booking, onChanged, highlighted = false }) {
  return (
    <div
      id={`booking-${booking.id}`}
      className={`card p-4 animate-fade-up ${highlighted ? 'border-gold-400 ring-2 ring-gold-400/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-extrabold truncate">{booking.name}</p>
          <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            booking.userId ? 'bg-sky-500/10 text-sky-300' : 'bg-amber-500/10 text-amber-300'
          }`}>
            {booking.userId ? t.owner.registeredClient : t.owner.guestClient}
          </span>
          <p className="text-xs text-slate-400 mt-0.5" dir="ltr">
            {booking.phone}
          </p>
        </div>
        <StatusChip status={booking.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-ink-700/60 rounded-xl p-2.5">
          <p className="text-[11px] text-slate-400">{t.myBookings.service}</p>
          <p className="text-sm font-extrabold truncate">
            {booking.serviceName} · {booking.price} {t.app.currency}
          </p>
        </div>
        <div className="bg-ink-700/60 rounded-xl p-2.5">
          <p className="text-[11px] text-slate-400">{t.booking.confirmDateTime}</p>
          <p className="text-sm font-extrabold truncate">
            {formatDateLong(booking.date)} — {booking.scheduledStart}
          </p>
        </div>
      </div>

      {booking.status === STATUS.ACCEPTED_MODIFIED && booking.proposedDate && (
        <p className="text-xs text-sky-300 font-bold mt-2">
          {t.owner.modifyTitle}: {formatDateLong(booking.proposedDate)} — {booking.proposedTime}
        </p>
      )}
      {booking.clientProposedDate && booking.status === STATUS.PENDING && (
        <p className="text-xs text-sky-300 font-bold mt-2">
          {t.owner.clientProposal}: {formatDateLong(booking.clientProposedDate)} —{' '}
          {booking.clientProposedTime}
        </p>
      )}
      {booking.notes && (
        <p className="text-xs text-slate-500 mt-2 bg-ink-700/40 rounded-xl p-2.5">
          {t.booking.notesLabel}: {booking.notes}
        </p>
      )}
      <p className="text-[10px] text-slate-600 mt-2">
        {t.myBookings.bookedAt} {formatRelative(booking.createdAt)} · {booking.code}
      </p>

      <div className="mt-3">
        {booking.status === STATUS.PENDING ? (
          <RequestActions booking={booking} onChanged={onChanged} />
        ) : (
          <AcceptedActions booking={booking} onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}

export default function Requests() {
  const today = todayISO();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const notificationId = searchParams.get('notificationId');
  const { items: notifications, markBookingRead, markOne } = useNotifications();
  const markedBookingRef = useRef(null);

  const { data: bookings, loading, error } = useCollection(
    () =>
      db
        ? query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('date', '>=', addDays(today, -1)),
            orderBy('date', 'asc'),
            limit(400)
          )
        : null,
    [today]
  );
  const {
    data: targetBooking,
    loading: targetLoading,
    error: targetError,
  } = useDocument(() => (db && bookingId ? doc(db, COLLECTIONS.BOOKINGS, bookingId) : null), [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    setStatusFilter('all');
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    const targetNotification = notificationId
      ? notifications.find(
          (item) => item.id === notificationId && item.bookingId === bookingId
        )
      : null;
    const key = targetNotification ? `notification:${targetNotification.id}` : `booking:${bookingId}`;
    if (markedBookingRef.current === key) return;
    if (targetNotification) {
      if (targetNotification.read) return;
      markedBookingRef.current = key;
      markOne(targetNotification.id).catch((err) => {
        markedBookingRef.current = null;
        console.error('Failed to mark notification as read.', err);
      });
      return;
    }
    if (!notifications.some((item) => item.bookingId === bookingId && !item.read)) return;
    markedBookingRef.current = key;
    markBookingRead(bookingId).catch((err) => {
      markedBookingRef.current = null;
      console.error('Failed to mark booking notifications as read.', err);
    });
  }, [bookingId, notificationId, notifications, markBookingRead, markOne]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allBookings =
      targetBooking && !bookings.some((booking) => booking.id === targetBooking.id)
        ? [...bookings, targetBooking]
        : bookings;
    return allBookings
      .filter((b) => {
        if (statusFilter === 'pending') return b.status === STATUS.PENDING;
        if (statusFilter === 'active')
          return [STATUS.ACCEPTED, STATUS.ACCEPTED_MODIFIED, STATUS.IN_PROGRESS].includes(b.status);
        return true;
      })
      .filter((b) => {
        if (!q) return true;
        return (
          String(b.name || '').toLowerCase().includes(q) ||
          String(b.phone || '').includes(q) ||
          String(b.serviceName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => `${a.date}${a.scheduledStart}`.localeCompare(`${b.date}${b.scheduledStart}`));
  }, [bookings, targetBooking, statusFilter, search]);

  useEffect(() => {
    if (!bookingId || loading || targetLoading || !list.some((booking) => booking.id === bookingId)) return;
    requestAnimationFrame(() => {
      document.getElementById(`booking-${bookingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [bookingId, loading, targetLoading, list]);

  if (loading || (bookingId && targetLoading)) return <FullSpinner />;
  if (error) return <ErrorState error={error} />;
  if (targetError) return <ErrorState error={targetError} />;

  return (
    <div className="animate-fade-in">
      <h1 className="text-xl sm:text-2xl font-black mb-4">{t.owner.requests}</h1>

      {/* Filters */}
      <div className="card p-3 mb-4 space-y-3">
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-colors ${
                statusFilter === f.key
                  ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40'
                  : 'bg-ink-700 text-slate-400 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pr-10"
            placeholder={t.owner.filterSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title={t.owner.queueEmpty} body={t.owner.queueHint} />
      ) : (
        <div className="grid gap-3">
          {list.map((b) => (
            <RequestCard
              key={b.id}
              booking={b}
              onChanged={() => {}}
              highlighted={b.id === bookingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
