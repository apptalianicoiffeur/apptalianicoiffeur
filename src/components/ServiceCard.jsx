/**
 * Service card: used on the landing page (display only) and in the booking
 * form (selectable).
 */
import { Clock3, Scissors } from 'lucide-react';
import t from '../i18n/ar';

export default function ServiceCard({ service, selected = false, onSelect, compact = false }) {
  const Wrapper = onSelect ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onSelect ? () => onSelect(service) : undefined}
      className={`w-full text-right card p-4 flex items-center gap-3 transition-all duration-200 ${
        selected ? 'border-gold-500 shadow-glow ring-1 ring-gold-500/60' : ''
      } ${onSelect ? 'hover:border-gold-500/50 active:scale-[0.99]' : ''}`}
    >
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-ink-600 flex items-center justify-center text-gold-400 shrink-0">
        {service.image ? (
          <img
            src={service.image}
            alt={service.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : compact ? (
          <Scissors size={22} />
        ) : (
          <Scissors size={24} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-slate-100 truncate">{service.name}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-gold-300 font-extrabold">
            {service.price} {t.app.currency}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock3 size={12} />
            {service.estimatedMinutes} {t.app.minutes}
          </span>
        </div>
      </div>
      {selected && (
        <span className="w-6 h-6 rounded-full bg-gold-500 text-ink-950 flex items-center justify-center text-xs font-black shrink-0">
          ✓
        </span>
      )}
      {!selected && onSelect && <span className="w-2 h-2 rounded-full bg-ink-400 shrink-0" />}
    </Wrapper>
  );
}
