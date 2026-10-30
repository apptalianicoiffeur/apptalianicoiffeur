/**
 * Calendar & availability: day and week views with color-coded slots
 * (booked / free / blocked / break / past), tap-to-add walk-in bookings and
 * filters by status and client name/phone.
 */
import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Lock,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { collection, orderBy, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCollection } from '../../hooks/useCollection';
import { useServices } from '../../hooks/useServices';
import { STATUS } from '../../utils/constants';
import { addDays, minToTime, nowMinutes, timeToMin, todayISO, weekdayOf, WEEKDAY_SHORT } from '../../utils/datetime';
import { getBreaksForDate, getBlocksForDate, getDayConfig, generateSlots } from '../../utils/slots';
import { ownerCreateWalkIn } from '../../services/bookingActions';
import { StatusChip } from '../../components/ui';
import { WalkInModal } from '../../components/owner/modals';

const STATUS_OPTIONS = [
  { key: 'all', label: t.app.all },
  { key: STATUS.PENDING, label: t.status.pending },
  { key: STATUS.ACCEPTED, label: t.status.accepted },
  { key: STATUS.IN_PROGRESS, label: t.status.in_progress },
  { key: STATUS.COMPLETED, label: t.status.completed },
  { key: STATUS.DECLINED, label: t.status.declined },
];

export default function CalendarPage() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState('day');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [walkIn, setWalkIn] = useState(null);

  const { data: services } = useServices();

  // Whole week in one query (day view filters by date on the client).
  const weekStart = addDays(date, -weekdayOf(date));
  const weekEnd = addDays(weekStart, 6);
  const { data: weekBookings } = useCollection(
    () =>
      db
        ? query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('date', '>=', weekStart),
            where('date', '<=', weekEnd),
            orderBy('date', 'asc')
          )
        : null,
    [weekStart, weekEnd]
  );

  const dayBookings = useMemo(() => weekBookings.filter((b) => b.date === date), [weekBookings, date]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dayBookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(b.name || '').toLowerCase().includes(q) || String(b.phone || '').includes(q)
      );
    });
  }, [dayBookings, statusFilter, search]);

  const cfg = getDayConfig(settings, date);
  const interval = Math.max(5, Number(settings.slotInterval) || 30);
  const today = todayISO();

  /** Day timeline rows: one row per slot interval. */
  const rows = useMemo(() => {
    if (cfg.closed) return [];
    const out = [];
    const breaks = getBreaksForDate(settings, date);
    const blocks = getBlocksForDate(settings, date);
    for (let m = timeToMin(cfg.open); m < timeToMin(cfg.close); m += interval) {
      const time = minToTime(m);
      const bookingsAt = visible.filter((b) => (b.expectedStart || b.scheduledStart) === time);
      const brk = breaks.find((x) => time >= x.start && time < x.end) || null;
      const blk = blocks.find((x) => time >= x.start && time < x.end) || null;
      const past = date < today || (date === today && m < nowMinutes());
      out.push({ time, bookings: bookingsAt, brk, blk, past });
    }
    return out;
  }, [date, visible, cfg, breaksDep(settings, date), blocksDep(settings, date), interval, today]);

  const freeCount = useMemo(() => {
    const slots = generateSlots({ settings, iso: date, bookings: weekBookings, duration: interval });
    return slots.filter((s) => s.available).length;
  }, [settings, date, weekBookings, interval]);

  const createWalkIn = async ({ name, phone, service, time }) => {
    try {
      await ownerCreateWalkIn(
        {
          name,
          phone,
          serviceId: service.id,
          serviceName: service.name,
          price: Number(service.price) || 0,
          durationMinutes: Number(service.estimatedMinutes) || 30,
          date,
          time,
        },
        settings
      );
      toast(t.owner.manualCreated);
      setWalkIn(null);
    } catch {
      toast(t.errors.actionFailed, 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-black">{t.owner.calendar}</h1>
        <div className="flex gap-2">
          {[
            { key: 'day', label: t.owner.dayView, icon: CalendarDays },
            { key: 'week', label: t.owner.weekView, icon: CalendarRange },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`btn-sm rounded-xl font-extrabold flex items-center gap-1.5 ${
                view === key
                  ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40'
                  : 'bg-ink-800 text-slate-400 border border-ink-500'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Date navigation */}
      <div className="card p-3 mb-4 flex items-center justify-between gap-2">
        <button className="btn-ghost btn-sm" onClick={() => setDate(addDays(date, -1))} aria-label={t.owner.prevDay}>
          <ChevronRight size={18} />
        </button>
        <div className="text-center">
          <p className="font-extrabold">{new Date(`${date}T00:00:00`).toLocaleDateString('ar-DZ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="text-[11px] text-gold-300 font-bold">
            {freeCount} {t.owner.legendFree}
          </p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setDate(addDays(date, 1))} aria-label={t.owner.nextDay}>
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setStatusFilter(o.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-extrabold ${
                statusFilter === o.key ? 'bg-gold-500/15 text-gold-300' : 'bg-ink-700 text-slate-400'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pr-9 py-2.5 text-sm"
            placeholder={t.owner.filterSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {view === 'day' ? (
        <div className="card p-3">
          {cfg.closed ? (
            <p className="text-center text-slate-400 text-sm py-10">{t.slots.off}</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row) => {
                const booked = row.bookings.length > 0;
                const blocked = Boolean(row.blk);
                const brk = Boolean(row.brk);
                const free = !booked && !blocked && !brk;
                return (
                  <div key={row.time} className="flex gap-2 items-stretch">
                    <div className="w-14 shrink-0 text-center pt-2">
                      <span className={`text-xs font-extrabold ${row.past ? 'text-slate-600' : 'text-gold-300'}`}>
                        {row.time}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {booked ? (
                        <div className="space-y-1.5">
                          {row.bookings.map((b) => (
                            <div
                              key={b.id}
                              className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 ${
                                b.status === STATUS.PENDING
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : b.status === STATUS.COMPLETED
                                    ? 'bg-emerald-700/15 border-emerald-700/40'
                                    : b.status === STATUS.IN_PROGRESS
                                      ? 'bg-gold-500/10 border-gold-500/40'
                                      : 'bg-ink-700 border-ink-500'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold truncate flex items-center gap-1.5">
                                  <UserRound size={13} className="text-gold-400 shrink-0" />
                                  {b.name}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {b.serviceName} · {b.durationMinutes}
                                  {t.app.minutes}
                                  {b.source === 'walk_in' ? ` · ${t.owner.walkInTitle}` : ''}
                                </p>
                              </div>
                              <StatusChip status={b.status} />
                            </div>
                          ))}
                        </div>
                      ) : blocked ? (
                        <div className="rounded-xl px-3 py-2 bg-ink-600/70 border border-ink-400 text-slate-400 flex items-center gap-2 text-xs font-bold">
                          <Lock size={13} /> {t.owner.legendBlocked}
                          {row.blk.reason ? ` — ${row.blk.reason}` : ''}
                        </div>
                      ) : brk ? (
                        <div className="rounded-xl px-3 py-2 bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-center gap-2 text-xs font-bold">
                          <Coffee size={13} /> {t.owner.legendBreak}
                        </div>
                      ) : (
                        <button
                          disabled={row.past}
                          onClick={() => setWalkIn(row.time)}
                          className={`w-full rounded-xl px-3 py-2 border border-dashed text-xs font-bold flex items-center justify-between transition-colors ${
                            row.past
                              ? 'border-ink-500/40 text-slate-600'
                              : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                          }`}
                        >
                          {t.owner.legendFree}
                          {!row.past && <Plus size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ---------------------- Week view ---------------------- */
        <div className="card p-3 overflow-x-auto">
          <div className="flex gap-2 min-w-[760px]">
            {Array.from({ length: 7 }).map((_, i) => {
              const iso = addDays(weekStart, i);
              const d = new Date(`${iso}T00:00:00`);
              const dayCfg = getDayConfig(settings, iso);
              const dayBookingsAll = weekBookings.filter((b) => b.date === iso);
              const dayVisible = dayBookingsAll.filter((b) => {
                if (statusFilter !== 'all' && b.status !== statusFilter) return false;
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return String(b.name || '').toLowerCase().includes(q) || String(b.phone || '').includes(q);
              });
              const free = generateSlots({ settings, iso, bookings: weekBookings, duration: interval }).filter(
                (s) => s.available
              ).length;
              const isToday = iso === today;
              return (
                <div
                  key={iso}
                  className={`flex-1 min-w-[100px] rounded-2xl border p-2 ${
                    iso === date ? 'border-gold-500/60 bg-gold-500/5' : 'border-ink-500 bg-ink-800'
                  }`}
                >
                  <button onClick={() => { setDate(iso); setView('day'); }} className="w-full text-center mb-2">
                    <p className={`text-[11px] font-bold ${isToday ? 'text-gold-300' : 'text-slate-400'}`}>
                      {isToday ? t.app.today : WEEKDAY_SHORT[d.getDay()]}
                    </p>
                    <p className="text-lg font-black">{d.getDate()}</p>
                    <p className="text-[10px] text-slate-500">
                      {dayCfg.closed ? t.slots.off : `${dayCfg.open} - ${dayCfg.close}`}
                    </p>
                  </button>
                  <div className="space-y-1">
                    {dayVisible
                      .sort((a, b) => String(a.expectedStart).localeCompare(String(b.expectedStart)))
                      .map((b) => (
                        <div
                          key={b.id}
                          className={`rounded-lg px-1.5 py-1 text-[10px] font-bold truncate ${
                            b.status === STATUS.PENDING
                              ? 'bg-amber-500/15 text-amber-200'
                              : b.status === STATUS.COMPLETED
                                ? 'bg-emerald-700/20 text-emerald-300'
                                : 'bg-ink-700 text-slate-200'
                          }`}
                          title={`${b.expectedStart} ${b.name}`}
                        >
                          {b.expectedStart} {b.name}
                        </div>
                      ))}
                    {!dayCfg.closed && (
                      <p className="text-[10px] text-emerald-400/80 font-bold pt-1">
                        {free} {t.owner.legendFree}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-ink-700 border border-ink-500" /> {t.owner.legendBooked}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-dashed border-emerald-500/60" /> {t.owner.legendFree}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-ink-600 border border-ink-400" /> {t.owner.legendBlocked}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500/30" /> {t.owner.legendBreak}
        </span>
      </div>

      <WalkInModal
        open={Boolean(walkIn)}
        onClose={() => setWalkIn(null)}
        date={date}
        services={services}
        settings={settings}
        prefillTime={walkIn}
        onConfirm={createWalkIn}
      />
    </div>
  );
}

/* Tiny helpers that make the memo dependency on blocked/breaks explicit. */
function breaksDep(settings, date) {
  return JSON.stringify(getBreaksForDate(settings, date));
}
function blocksDep(settings, date) {
  return JSON.stringify(getBlocksForDate(settings, date));
}
