/**
 * Landing page: hero, live shop status, services with prices, working hours,
 * location placeholder and the prominent "Book now" button.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Clock3, LayoutDashboard, MapPin, Scissors, Timer, Zap } from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useServices } from '../hooks/useServices';
import { WEEKDAY_NAMES } from '../utils/datetime';
import ServiceCard from '../components/ServiceCard';
import { ShopStatusBadge } from '../components/shared';
import { EmptyState, FullSpinner } from '../components/ui';

const WHY = [
  { icon: Zap, title: t.landing.why1Title, body: t.landing.why1Body },
  { icon: Timer, title: t.landing.why2Title, body: t.landing.why2Body },
  { icon: BellRing, title: t.landing.why3Title, body: t.landing.why3Body },
];

export default function Landing() {
  const { settings, loading: settingsLoading } = useSettings();
  const { user, isOwner } = useAuth();
  const { data: services, loading: servicesLoading } = useServices();

  const hoursRows = useMemo(() => {
    // Show Saturday first (local convention), then the rest of the week.
    const order = [6, 0, 1, 2, 3, 4, 5];
    return order.map((idx) => ({
      idx,
      day: WEEKDAY_NAMES[idx],
      cfg: settings.weeklyHours?.[idx] || {},
      weeklyOff: (settings.closedWeekdays || []).includes(idx),
    }));
  }, [settings]);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    settings.address || settings.shopName || 'Algeria'
  )}`;

  if (settingsLoading) return <FullSpinner />;

  return (
    <div className="animate-fade-in">
      {/* ---------------- Hero ---------------- */}
      <section className="relative card overflow-hidden mt-4 sm:mt-8 p-6 sm:p-10 text-center">
        <div className="absolute inset-x-0 top-0 barber-divider" />
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-gold-500/5 blur-3xl" />

        <div className="relative">
          <div className="flex justify-center mb-4">
            <ShopStatusBadge settings={settings} />
          </div>
          <h1 className="text-3xl sm:text-5xl font-black leading-tight text-balance">
            <span className="text-gold-400">{t.app.name}</span>
            <br />
            {t.landing.heroTitle}
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed max-w-xl mx-auto text-sm sm:text-base">
            {t.landing.heroSubtitle}
          </p>
          <p
            className={`mt-3 text-xs font-bold ${
              settings.shopOpen ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {settings.shopOpen ? t.status.openNowHint : t.status.closedToday}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/booking" className="btn-gold w-full sm:w-auto sm:px-10 text-lg">
              <Scissors size={19} />
              {t.landing.bookNow}
            </Link>
            {user && (
              <Link to="/bookings" className="btn-outline w-full sm:w-auto">
                {t.landing.viewMyBookings}
              </Link>
            )}
            {isOwner && (
              <Link to="/owner" className="btn-outline w-full sm:w-auto">
                <LayoutDashboard size={17} />
                {t.nav.ownerArea}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Why us ---------------- */}
      <section className="mt-8">
        <h2 className="section-title mb-4">{t.landing.whyTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {WHY.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5 flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gold-500/10 text-gold-400 flex items-center justify-center shrink-0">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="font-extrabold">{title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Services ---------------- */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">
              <Scissors size={18} className="text-gold-400" />
              {t.landing.servicesTitle}
            </h2>
            <p className="text-xs text-slate-400 mt-1">{t.landing.servicesSubtitle}</p>
          </div>
        </div>
        {servicesLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-22 animate-pulse" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <EmptyState title={t.booking.noServices} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Working hours ---------------- */}
      <section className="mt-10">
        <h2 className="section-title mb-4">
          <Clock3 size={18} className="text-gold-400" />
          {t.landing.hoursTitle}
        </h2>
        <div className="card divide-y divide-ink-500/50">
          {hoursRows.map(({ idx, day, cfg, weeklyOff }) => {
            const closed = weeklyOff || cfg.closed;
            return (
              <div key={idx} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold text-slate-200">{day}</span>
                <span
                  className={`text-sm font-extrabold ${
                    closed ? 'text-slate-500' : 'text-gold-300'
                  }`}
                >
                  {closed ? t.slots.off : `${cfg.open} - ${cfg.close}`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- Location ---------------- */}
      <section className="mt-10">
        <h2 className="section-title mb-4">
          <MapPin size={18} className="text-gold-400" />
          {t.landing.locationTitle}
        </h2>
        <div className="card p-6 flex flex-col items-center text-center gap-3">
          <div className="w-full h-36 rounded-2xl bg-ink-700 border border-dashed border-ink-400 flex flex-col items-center justify-center gap-2 text-slate-400">
            <MapPin size={26} className="text-gold-400" />
            <p className="text-xs">{t.landing.locationHint}</p>
          </div>
          <p className="text-sm font-bold text-slate-200">
            {settings.address || t.landing.locationAddress}
          </p>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
            {t.landing.openInMaps}
          </a>
        </div>
      </section>

      <footer className="mt-12 mb-6 text-center text-xs text-slate-500">
        <div className="barber-divider opacity-40 mb-4" />
        © {new Date().getFullYear()} {t.app.name} — {t.landing.footerRights}
      </footer>
    </div>
  );
}
