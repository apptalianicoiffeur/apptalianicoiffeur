/**
 * Time-slot grid with per-slot availability reasons (taken / break / blocked /
 * too soon / shop closed).
 */
import { CalendarOff, Coffee, Lock, TimerOff } from 'lucide-react';
import t from '../i18n/ar';

const REASON_LABELS = {
  taken: t.slots.taken,
  break: t.slots.break,
  blocked: t.slots.blocked,
  lead: t.slots.lead,
  closed: t.slots.closed,
};

export default function TimeSlotGrid({ slots, value, onSelect, loading, emptyMessage }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-ink-700 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="card p-6 flex flex-col items-center text-center gap-2 text-slate-400">
        <CalendarOff size={26} className="text-gold-400" />
        <p className="text-sm font-semibold">{emptyMessage || t.booking.noSlots}</p>
      </div>
    );
  }

  const anyAvailable = slots.some((s) => s.available);

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {slots.map((slot) => {
          const active = value === slot.time;
          return (
            <button
              key={slot.time}
              type="button"
              disabled={!slot.available}
              onClick={() => onSelect(slot.time)}
              title={slot.available ? undefined : REASON_LABELS[slot.reason] || ''}
              className={`h-12 rounded-xl border text-sm font-extrabold transition-all relative
                ${
                  active
                    ? 'border-gold-500 bg-gold-500/20 text-gold-200 shadow-glow'
                    : slot.available
                      ? 'border-ink-500 bg-ink-700 text-slate-100 hover:border-gold-500/60 active:scale-95'
                      : 'border-ink-500/50 bg-ink-800 text-slate-600 line-through decoration-ink-400'
                }`}
            >
              {slot.time}
              {!slot.available && slot.reason === 'taken' && (
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-red-500/80 text-[8px] text-white flex items-center justify-center no-underline">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!anyAvailable && (
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
          <TimerOff size={13} />
          {t.slots.allTaken}
        </p>
      )}
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Lock size={11} /> {t.slots.taken} / {t.slots.blocked}
        </span>
        <span className="flex items-center gap-1">
          <Coffee size={11} /> {t.slots.break}
        </span>
      </div>
    </div>
  );
}
