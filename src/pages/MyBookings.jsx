/**
 * "My bookings": upcoming and past bookings, live queue information for today,
 * and the accept / decline / propose actions when the barber changes the time.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  MessageSquare,
  PhoneCall,
  Users,
  XCircle,
} from 'lucide-react';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import t from '../i18n/ar';
import { db, COLLECTIONS } from '../services/bootstrap';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useCollection, useDocument } from '../hooks/useCollection';
import { ACTIVE_STATUSES, STATUS, UPCOMING_STATUSES } from '../utils/constants';
import { formatDateLong, timeToMin, todayISO } from '../utils/datetime';
import { generateSlots } from '../utils/slots';
import { queueEntriesAsBookings } from '../utils/queue';
import {
  clientAcceptModification,
  clientCancelBooking,
  clientDeclineModification,
  clientProposeTime,
} from '../services/bookingActions';
import { SlotTakenError } from '../services/bookings';
import { telLink } from '../utils/whatsapp';
import DateStrip from '../components/DateStrip';
import TimeSlotGrid from '../components/TimeSlotGrid';
import {
  EmptyState,
  ErrorState,
  FullSpinner,
  Modal,
  Spinner,
  StatusChip,
} from '../components/ui';

/** Live "today" queue banner (public, PII-free queue document). */
function TodayQueueCard({ booking, daily }) {
  const entry = daily?.entries?.find((e) => e.bookingId === booking.id);
  // Position is computed among the appointments that still occupy the queue.
  const active = (daily?.entries || []).filter((e) => ACTIVE_STATUSES.includes(e.status));
  const total = active.length;
  if (!entry) {
    return (
      <div className="card p-4 mb-4">
        <p className="text-xs text-slate-400 mb-1">{t.myBookings.queueExpected}</p>
        <p className="text-lg font-extrabold text-gold-300">{booking.expectedStart}</p>
        <p className="text-[11px] text-slate-500 mt-1">{t.myBookings.queueOnTime}</p>
      </div>
    );
  }
  const earlier = timeToMin(entry.expectedStart) < timeToMin(booking.scheduledStart);
  const later = timeToMin(entry.expectedStart) > timeToMin(booking.scheduledStart);
  return (
    <div className="card p-4 mb-4 border-gold-500/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">{t.myBookings.queueExpected}</p>
          <p className="text-2xl font-black text-gold-300">{entry.expectedStart}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-400 mb-1">{t.myBookings.queuePosition}</p>
          <p className="text-lg font-extrabold flex items-center gap-1.5">
            <Users size={16} className="text-gold-400" />
            {active.findIndex((e) => e.bookingId === booking.id) + 1} / {total}
          </p>
        </div>
      </div>
      {earlier && (
        <p className="text-[11px] text-emerald-300 mt-2 font-bold">
          {t.myBookings.queueEarly} {timeToMin(booking.scheduledStart) - timeToMin(entry.expectedStart)}{' '}
          {t.app.minutes}
        </p>
      )}
      {later && (
        <p className="text-[11px] text-amber-300 mt-2 font-bold">
          {t.myBookings.queueLate} {timeToMin(entry.expectedStart) - timeToMin(booking.scheduledStart)}{' '}
          {t.app.minutes}
        </p>
      )}
      {!earlier && !later && <p className="text-[11px] text-slate-500 mt-2">{t.myBookings.queueOnTime}</p>}
    </div>
  );
}

/** Modal used by the client to propose another date/time. */
function ProposeModal({ open, onClose, booking, settings, onConfirm }) {
  const [date, setDate] = useState(booking?.date || todayISO());
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);

  // Live availability of the chosen day from the public, PII-free queue doc.
  const { data: daily } = useDocument(
    () => (open && db ? doc(db, COLLECTIONS.DAILY_QUEUE, date) : null),
    [open, date]
  );
  const dayBookings = useMemo(
    () => queueEntriesAsBookings(daily, date, { ignoreBookingId: booking?.id }),
    [daily, date, booking?.id]
  );

  const slots = useMemo(
    () =>
      generateSlots({
        settings,
        iso: date,
        bookings: dayBookings,
        duration: booking?.durationMinutes || 30,
        ignoreBookingId: booking?.id,
      }),
    [settings, date, dayBookings, booking]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.myBookings.proposeAnother}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-gold flex-1"
            disabled={!time || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(date, time);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t.app.loading : t.app.confirm}
          </button>
        </div>
      }
    >
      <p className="text-xs text-slate-400 mb-3">{t.myBookings.proposeAnother}</p>
      <DateStrip settings={settings} value={date} onChange={setDate} days={14} />
      <div className="mt-4">
        <TimeSlotGrid slots={slots} value={time} onSelect={setTime} />
      </div>
    </Modal>
  );
}

/** One booking card. */
function BookingCard({ booking, settings }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const now = todayISO();
  const isFuture = booking.date >= now;
  const showCancel =
    isFuture && [STATUS.PENDING, STATUS.ACCEPTED, STATUS.ACCEPTED_MODIFIED].includes(booking.status);
  const modified = booking.status === STATUS.ACCEPTED_MODIFIED && booking.proposedDate;
  const timeShifted =
    !modified && booking.expectedStart && booking.expectedStart !== booking.scheduledStart;

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) toast(message);
    } catch (err) {
      toast(err instanceof SlotTakenError ? t.booking.slotTaken : t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-extrabold text-slate-100 truncate">{booking.serviceName}</p>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateLong(booking.date)}</p>
        </div>
        <StatusChip status={booking.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="bg-ink-700/60 rounded-xl p-2.5">
          <p className="text-[11px] text-slate-400">{t.myBookings.originalTime}</p>
          <p className="font-extrabold">{booking.scheduledStart}</p>
        </div>
        <div
          className={`rounded-xl p-2.5 ${
            timeShifted || modified ? 'bg-gold-500/10 border border-gold-500/30' : 'bg-ink-700/60'
          }`}
        >
          <p className="text-[11px] text-slate-400">
            {modified ? t.myBookings.expectedTime : t.myBookings.expectedTime}
          </p>
          <p className="font-extrabold text-gold-300">
            {modified ? booking.proposedTime : booking.expectedStart}
          </p>
        </div>
      </div>

      {booking.price ? (
        <p className="text-xs text-slate-400 mt-2">
          {t.myBookings.price}: <span className="text-gold-300 font-bold">{booking.price} {t.app.currency}</span>
          {' · '}
          {t.myBookings.duration}: <span className="font-bold">{booking.durationMinutes} {t.app.minutes}</span>
        </p>
      ) : null}

      {/* The barber declined / cancelled with a reason */}
      {booking.barberMessage &&
        [STATUS.DECLINED, STATUS.ACCEPTED_MODIFIED, STATUS.PENDING].includes(booking.status) && (
          <div className="mt-3 bg-ink-700/70 border-r-2 border-gold-500 rounded-l-xl p-3">
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <MessageSquare size={12} /> {t.myBookings.barberMessage}
            </p>
            <p className="text-xs text-slate-200 leading-relaxed">{booking.barberMessage}</p>
          </div>
        )}

      {/* The client's own proposal (visible while pending) */}
      {booking.status === STATUS.PENDING && booking.clientProposedDate && (
        <div className="mt-3 bg-sky-500/10 border-r-2 border-sky-400 rounded-l-xl p-3">
          <p className="text-[11px] text-slate-400 mb-1">{t.myBookings.yourProposal}</p>
          <p className="text-xs text-sky-200 font-bold">
            {formatDateLong(booking.clientProposedDate)} — {booking.clientProposedTime}
          </p>
        </div>
      )}

      {booking.notes && (
        <p className="text-xs text-slate-500 mt-3">
          {t.myBookings.notes}: {booking.notes}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {modified && (
          <>
            <button
              className="btn-success flex-1 min-w-32"
              disabled={busy}
              onClick={() =>
                run(() => clientAcceptModification(booking, settings), t.myBookings.changeAccepted)
              }
            >
              <CheckCircle2 size={15} /> {t.myBookings.acceptChange}
            </button>
            <button
              className="btn-outline flex-1 min-w-32"
              disabled={busy}
              onClick={() => setProposeOpen(true)}
            >
              <CalendarClock size={15} /> {t.myBookings.proposeAnother}
            </button>
            <button
              className="btn-danger w-full"
              disabled={busy}
              onClick={() =>
                run(() => clientDeclineModification(booking, settings), t.myBookings.changeDeclined)
              }
            >
              <XCircle size={15} /> {t.myBookings.declineChange}
            </button>
          </>
        )}

        {!modified && isFuture && booking.status === STATUS.PENDING && !booking.clientProposedDate && (
          <button className="btn-outline btn-sm" disabled={busy} onClick={() => setProposeOpen(true)}>
            <CalendarClock size={14} /> {t.myBookings.proposeAnother}
          </button>
        )}

        {showCancel && !busy && (
          <button
            className="btn-danger btn-sm"
            onClick={() => {
              if (window.confirm(t.myBookings.cancelConfirm)) {
                run(() => clientCancelBooking(booking, settings), t.myBookings.cancelled);
              }
            }}
          >
            {t.myBookings.cancelBooking}
          </button>
        )}

        {settings.phone && (
          <a className="btn-ghost btn-sm" href={telLink(settings.phone)}>
            <PhoneCall size={14} /> {t.myBookings.callShop}
          </a>
        )}

        {busy && <Spinner size={16} className="text-gold-400" />}
      </div>

      <ProposeModal
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        booking={booking}
        settings={settings}
        onConfirm={async (date, time) => {
          await run(() => clientProposeTime(booking, { date, time }, settings), t.myBookings.proposedSent);
          setProposeOpen(false);
        }}
      />
    </div>
  );
}

export default function MyBookings() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState('upcoming');
  const today = todayISO();

  const { data: bookings, loading, error, refetchKey } = useMyBookings(user?.uid);
  const { data: daily } = useDocument(
    () => (db ? doc(db, COLLECTIONS.DAILY_QUEUE, today) : null),
    [today]
  );

  const { upcoming, past, todayBooking } = useMemo(() => {
    const sorted = [...bookings].sort((a, b) =>
      `${a.date}${a.scheduledStart}`.localeCompare(`${b.date}${b.scheduledStart}`)
    );
    const up = sorted.filter((b) => b.date >= today && UPCOMING_STATUSES.includes(b.status));
    const pa = sorted.filter((b) => !(b.date >= today && UPCOMING_STATUSES.includes(b.status)));
    return {
      upcoming: up,
      past: pa.reverse(),
      todayBooking: up.find((b) => b.date === today),
    };
  }, [bookings, today]);

  const list = tab === 'upcoming' ? upcoming : past;

  if (loading) return <FullSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetchKey} />;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-black mt-5 mb-4">{t.myBookings.title}</h1>

      {todayBooking && <TodayQueueCard booking={todayBooking} daily={daily} />}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'upcoming', label: t.myBookings.upcoming, count: upcoming.length },
          { key: 'past', label: t.myBookings.past, count: past.length },
        ].map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold transition-colors ${
              tab === x.key ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40' : 'bg-ink-800 text-slate-400 border border-ink-500'
            }`}
          >
            {x.label} ({x.count})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tab === 'upcoming' ? t.myBookings.noneUpcoming : t.myBookings.nonePast}
          body={tab === 'upcoming' ? t.myBookings.noneBody : undefined}
          action={
            tab === 'upcoming' ? (
              <Link to="/booking" className="btn-gold btn-sm mt-2">
                {t.landing.bookNow}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {list.map((b) => (
            <BookingCard key={b.id} booking={b} settings={settings} />
          ))}
        </div>
      )}
    </div>
  );
}

/** My own bookings (real time) with a tiny manual-refetch escape hatch. */
function useMyBookings(uid) {
  const [key, setKey] = useState(0);
  const res = useCollection(
    () =>
      db && uid
        ? query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('userId', '==', uid),
            orderBy('date', 'desc'),
            orderBy('scheduledStart', 'desc')
          )
        : null,
    [uid, key]
  );
  return { ...res, refetchKey: () => setKey((k) => k + 1) };
}
