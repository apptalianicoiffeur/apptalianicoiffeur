/**
 * Clients list: aggregated from the owner's bookings (names, phones, booking
 * history, visits and total spent), with a search box and one-tap contact.
 */
import { useMemo, useState } from 'react';
import { MessageCircle, PhoneCall, Search, UserRound, Users } from 'lucide-react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useCollection } from '../../hooks/useCollection';
import { STATUS } from '../../utils/constants';
import { formatDateLong, todayISO } from '../../utils/datetime';
import { openWhatsApp, telLink } from '../../utils/whatsapp';
import { formatPhone } from '../../utils/phone';
import { EmptyState, ErrorState, FullSpinner, Modal, StatusChip } from '../../components/ui';

export default function ClientsPage() {
  const today = todayISO();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: bookings, loading, error } = useCollection(
    () =>
      db
        ? query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('date', '<=', today),
            orderBy('date', 'desc'),
            limit(1000)
          )
        : null,
    [today]
  );

  // Aggregate bookings per phone number.
  const clients = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      if (!b.phone) return;
      const entry = map.get(b.phone) || {
        phone: b.phone,
        name: b.name,
        visits: 0,
        spent: 0,
        lastVisit: '',
        history: [],
      };
      entry.visits += 1;
      if (!entry.name && b.name) entry.name = b.name;
      if (![STATUS.CANCELLED, STATUS.DECLINED, STATUS.NO_SHOW].includes(b.status)) {
        entry.spent += Number(b.price) || 0;
      }
      if (!entry.lastVisit) entry.lastVisit = b.date; // list is sorted desc
      entry.history.push(b);
      map.set(b.phone, entry);
    });
    return [...map.values()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').includes(q)
    );
  }, [clients, search]);

  if (loading) return <FullSpinner />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-black">{t.owner.clients}</h1>
        <span className="chip bg-gold-500/10 text-gold-300 border border-gold-500/30">
          {clients.length} {t.owner.clientsCount}
        </span>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pr-10"
          placeholder={t.owner.filterSearch}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title={t.owner.clientsEmpty} />
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((c) => (
            <button
              key={c.phone}
              onClick={() => setSelected(c)}
              className="card p-4 flex items-center gap-3 text-right hover:border-gold-500/40 transition-colors"
            >
              <div className="w-11 h-11 rounded-2xl bg-ink-600 text-gold-400 flex items-center justify-center shrink-0">
                <UserRound size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold truncate">{c.name || formatPhone(c.phone)}</p>
                <p className="text-xs text-slate-400 truncate" dir="ltr">
                  {formatPhone(c.phone)}
                </p>
              </div>
              <div className="text-left shrink-0">
                <p className="text-sm font-extrabold text-gold-300">{c.visits} ×</p>
                <p className="text-[11px] text-slate-500">
                  {t.owner.lastVisit}: {c.lastVisit}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Client history modal */}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={t.owner.clientHistory}>
        {selected && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-ink-600 text-gold-400 flex items-center justify-center">
                <UserRound size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-extrabold truncate">{selected.name || '—'}</p>
                <p className="text-xs text-slate-400" dir="ltr">
                  {formatPhone(selected.phone)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-ink-700/60 rounded-xl p-2.5 text-center">
                <p className="text-lg font-extrabold">{selected.visits}</p>
                <p className="text-[10px] text-slate-400">{t.owner.bookingsCount}</p>
              </div>
              <div className="bg-ink-700/60 rounded-xl p-2.5 text-center">
                <p className="text-lg font-extrabold text-gold-300">{selected.spent}</p>
                <p className="text-[10px] text-slate-400">{t.owner.totalSpent}</p>
              </div>
              <div className="bg-ink-700/60 rounded-xl p-2.5 text-center">
                <p className="text-[11px] font-extrabold mt-1.5">{selected.lastVisit}</p>
                <p className="text-[10px] text-slate-400">{t.owner.lastVisit}</p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              {telLink(selected.phone) && (
                <a className="btn-outline btn-sm flex-1" href={telLink(selected.phone)}>
                  <PhoneCall size={14} /> {t.owner.call}
                </a>
              )}
              <button
                className="btn-ghost btn-sm flex-1 !text-emerald-300 hover:!bg-emerald-500/10"
                onClick={() => openWhatsApp(selected.phone, '')}
              >
                <MessageCircle size={14} /> {t.owner.whatsapp}
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {selected.history.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">{t.owner.noHistory}</p>
              ) : (
                selected.history.map((b) => (
                  <div key={b.id} className="bg-ink-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{b.serviceName}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatDateLong(b.date)} — {b.scheduledStart}
                      </p>
                    </div>
                    <StatusChip status={b.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
