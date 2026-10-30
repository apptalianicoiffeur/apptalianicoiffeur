/**
 * The big always-visible "open / close shop" switch.
 * Its state is saved in Firestore and broadcast to every user in real time.
 */
import { Loader2, Store } from 'lucide-react';
import t from '../../i18n/ar';

export default function OpenCloseToggle({ settings, onToggle, busy }) {
  const open = Boolean(settings.shopOpen);
  return (
    <div
      className={`card p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-2 transition-colors ${
        open ? 'border-emerald-500/40' : 'border-red-500/30'
      }`}
    >
      <div className="text-center sm:text-right">
        <p className="text-xs font-bold text-slate-400 mb-1">{t.owner.shopControl}</p>
        <p className={`text-3xl font-black ${open ? 'text-emerald-300' : 'text-red-300'}`}>
          {open ? t.status.open : t.status.closed}
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          {open ? t.status.openNowHint : t.status.closedToday}
        </p>
      </div>

      <button
        onClick={onToggle}
        disabled={busy}
        className={`btn w-full sm:w-auto sm:min-w-56 text-lg py-4 ${
          open
            ? 'btn-danger !text-base'
            : 'btn-gold'
        }`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Store size={18} />}
        {open ? t.owner.closeShop : t.owner.openShop}
      </button>
    </div>
  );
}
