/**
 * Horizontal date picker: the next `days` days, with closed/off days disabled.
 */
import t from '../i18n/ar';
import { addDays, isoToDate, todayISO, WEEKDAY_SHORT } from '../utils/datetime';
import { dayUnbookableReason } from '../utils/slots';

export default function DateStrip({ settings, value, onChange, days = 14 }) {
  const today = todayISO();
  const list = Array.from({ length: days }, (_, i) => addDays(today, i));

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {list.map((iso) => {
          const reason = dayUnbookableReason(settings, iso);
          const disabled = Boolean(reason);
          const d = isoToDate(iso);
          const isToday = iso === today;
          const active = value === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              className={`shrink-0 w-[68px] rounded-2xl border py-2.5 flex flex-col items-center gap-0.5 transition-all
                ${
                  active
                    ? 'border-gold-500 bg-gold-500/15 text-gold-200 shadow-glow'
                    : disabled
                      ? 'border-ink-500/60 bg-ink-800 text-slate-600'
                      : 'border-ink-500 bg-ink-800 text-slate-200 hover:border-gold-500/50'
                }`}
            >
              <span className="text-[10px] font-bold opacity-80">
                {isToday ? t.app.today : WEEKDAY_SHORT[d.getDay()]}
              </span>
              <span className="text-lg font-extrabold leading-none">{d.getDate()}</span>
              <span className="text-[10px] opacity-70">{d.toLocaleDateString('ar-DZ-u-nu-latn', { month: 'short' })}</span>
              {disabled && (
                <span className="text-[9px] font-bold text-slate-600">
                  {reason === 'off' ? t.slots.off : t.slots[reason] || '—'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
