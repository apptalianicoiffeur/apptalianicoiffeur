/**
 * Barber dashboard overview: open/close switch, today's queue, live stats and
 * simple weekly statistics.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, BarChart3, CalendarCheck, ClipboardList, Star, Users } from 'lucide-react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCollection } from '../../hooks/useCollection';
import { useServices } from '../../hooks/useServices';
import { addDays, todayISO } from '../../utils/datetime';
import { STATUS } from '../../utils/constants';
import { todaysQueue } from '../../utils/queue';
import { fillTemplate } from '../../utils/whatsapp';
import QueuePanel, { QueueHeader } from '../../components/owner/QueuePanel';
import OpenCloseToggle from '../../components/owner/OpenCloseToggle';
import { FullSpinner, StatTile, Toggle } from '../../components/ui';

export default function Dashboard() {
  const { settings, setShopOpen, savePublic, loading } = useSettings();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const { data: services } = useServices();

  const { data: todayBookings, loading: todayLoading } = useCollection(
    () => (db ? query(collection(db, COLLECTIONS.BOOKINGS), where('date', '==', today)) : null),
    [today]
  );

  // Last 30 days for statistics.
  const { data: recent } = useCollection(
    () =>
      db
        ? query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('date', '>=', addDays(today, -30)),
            orderBy('date', 'desc'),
            limit(400)
          )
        : null,
    [today]
  );

  const queue = useMemo(() => todaysQueue(todayBookings, today), [todayBookings, today]);
  const pendingCount = queue.filter((b) => b.status === STATUS.PENDING).length;
  const current = queue.find((b) => b.status === STATUS.IN_PROGRESS);
  const next = queue.find((b) => [STATUS.ACCEPTED, STATUS.ACCEPTED_MODIFIED].includes(b.status));

  const stats = useMemo(() => {
    const weekStart = addDays(today, -7);
    const week = recent.filter((b) => b.date >= weekStart);

    // Bookings per day this week (for the busiest day).
    const perDay = {};
    week.forEach((b) => {
      perDay[b.date] = (perDay[b.date] || 0) + 1;
    });
    const busiest = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0];

    // Most requested service.
    const perService = {};
    week.forEach((b) => {
      perService[b.serviceName] = (perService[b.serviceName] || 0) + 1;
    });
    const topService = Object.entries(perService).sort((a, b) => b[1] - a[1])[0];

    // Average ACTUAL duration per service (from completed sessions).
    const durations = {};
    recent
      .filter((b) => b.status === STATUS.COMPLETED && b.actualStart && b.actualEnd)
      .forEach((b) => {
        const mins = toMin(b.actualEnd) - toMin(b.actualStart);
        if (mins <= 0) return;
        (durations[b.serviceName] ||= []).push(mins);
      });
    const avgDurations = Object.entries(durations)
      .map(([name, list]) => ({
        name,
        avg: Math.round(list.reduce((s, x) => s + x, 0) / list.length),
        count: list.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return { weekCount: week.length, busiest, topService, avgDurations, perDay };
  }, [recent, today]);

  // Last 7 days as a tiny bar chart.
  const last7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const iso = addDays(today, -(6 - i));
        return { iso, count: stats.perDay[iso] || 0 };
      }),
    [stats.perDay, today]
  );
  const maxDay = Math.max(1, ...last7.map((d) => d.count));

  const toggleShop = async () => {
    setBusy(true);
    try {
      await setShopOpen(!settings.shopOpen);
      toast(settings.shopOpen ? t.owner.shopClosed : t.owner.shopOpened);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !todayBookings) return <FullSpinner />;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-black">
          {fillTemplate(t.owner.greeting, { name: profile?.name ? profile.name.split(' ')[0] : '' })}
        </h1>
        <Toggle
          checked={settings.soundAlerts !== false}
          onChange={(v) => savePublic({ soundAlerts: v })}
          ariaLabel={t.owner.newRequestSound}
        />
      </div>

      <OpenCloseToggle settings={settings} onToggle={toggleShop} busy={busy} />

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={CalendarCheck}
          label={t.owner.todayBookings}
          value={todayLoading ? '…' : queue.length}
        />
        <StatTile icon={ClipboardList} label={t.owner.pendingCount} value={pendingCount} />
        <StatTile
          icon={Activity}
          label={t.owner.currentClient}
          value={current ? current.name : '—'}
          hint={current ? `${current.serviceName} · ${current.expectedStart}` : t.owner.noCurrentClient}
        />
        <StatTile
          icon={Users}
          label={t.owner.nextClient}
          value={next ? next.name : '—'}
          hint={next ? `${next.serviceName} · ${next.expectedStart}` : t.owner.noNextClient}
        />
      </div>

      {/* Live queue */}
      <section className="card p-4 sm:p-5">
        <QueueHeader bookings={todayBookings} date={today} />
        <QueuePanel
          date={today}
          bookings={todayBookings}
          services={services}
          onChanged={() => {}}
        />
        {pendingCount > 0 && (
          <Link
            to="/owner/requests"
            className="btn-outline btn-sm w-full mt-4 !text-amber-300 !border-amber-500/40 hover:!bg-amber-500/10"
          >
            {t.owner.viewAllRequests} <ArrowLeft size={14} />
          </Link>
        )}
      </section>

      {/* Statistics */}
      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-4">
          <BarChart3 size={17} className="text-gold-400" />
          {t.owner.weekStats}
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatTile icon={CalendarCheck} label={t.owner.weekBookings} value={stats.weekCount} />
          <StatTile
            icon={Star}
            label={t.owner.topService}
            value={stats.topService ? stats.topService[0] : '—'}
            hint={stats.topService ? `${stats.topService[1]} ×` : undefined}
          />
        </div>

        {/* Bookings per day (last 7 days) */}
        <div className="bg-ink-700/40 rounded-2xl p-3 mb-4">
          <p className="text-xs font-bold text-slate-400 mb-2">{t.owner.bookingsPerDay}</p>
          <div className="flex items-end justify-between gap-1.5 h-24">
            {last7.map((d) => (
              <div key={d.iso} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] font-bold text-gold-300">{d.count || ''}</span>
                <div
                  className={`w-full rounded-t-md ${d.count ? 'bg-gradient-to-t from-gold-600 to-gold-400' : 'bg-ink-500/60'}`}
                  style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
                />
                <span className="text-[9px] text-slate-500">
                  {new Date(`${d.iso}T00:00:00`).toLocaleDateString('ar-DZ-u-nu-latn', { weekday: 'narrow' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {stats.avgDurations.length === 0 ? (
          <p className="text-xs text-slate-500">{t.owner.noStatsYet}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400">
              {t.owner.avgDuration} — {t.owner.perService}
            </p>
            {stats.avgDurations.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between bg-ink-700/60 rounded-xl px-3 py-2"
              >
                <span className="text-sm font-bold truncate">{s.name}</span>
                <span className="text-sm font-extrabold text-gold-300 shrink-0">
                  {s.avg} {t.app.minutes} · {s.count}×
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-600 mt-3">{t.owner.statsNote}</p>
      </section>
    </div>
  );
}

function toMin(time) {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
