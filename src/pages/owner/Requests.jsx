/**
 * Booking requests: accept / accept with modification / decline, plus
 * call, WhatsApp, and the completed / no-show / cancelled transitions.
 * Filterable by status, date and client name/phone.
 */
import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  Search,
  UserX,
  XCircle,
} from 'lucide-react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCollection } from '../../hooks/useCollection';
import { STATUS } from '../../utils/constants';
import { addDays, formatDateLong, formatRelative, todayISO } from '../../utils/datetime';
import { openWhatsApp, telLink, fillTemplate, templateVars } from '../../utils/whatsapp';
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
    openWhatsApp(
      booking.phone,
      fillTemplate(templates[key], {
        ...templateVars(booking, settings),
        date: formatDateLong(booking.date),
        new_date: booking.proposedDate ? formatDateLong(booking.proposedDate) : '',
      })
    );
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

function RequestCard({ booking, onChanged }) {
  return (
    <div className="card p-4 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-extrabold truncate">{booking.name}</p>
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
          {t.myBookings.yourProposal}: {formatDateLong(booking.clientProposedDate)} —{' '}
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

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings
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
  }, [bookings, statusFilter, search]);

  if (loading) return <FullSpinner />;
  if (error) return <ErrorState error={error} />;

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
            <RequestCard key={b.id} booking={b} onChanged={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
