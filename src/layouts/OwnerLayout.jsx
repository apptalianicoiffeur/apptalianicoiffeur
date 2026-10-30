/**
 * Owner (barber) layout: sidebar on desktop, scrollable tabs on mobile,
 * a new-request sound alert and the public daily-queue sync.
 */
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  Scissors,
  Settings as SettingsIcon,
  Store,
  Users,
} from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import t from '../i18n/ar';
import { db, COLLECTIONS } from '../services/bootstrap';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useSettings } from '../context/SettingsContext';
import { useCollection } from '../hooks/useCollection';
import { useQueueSync } from '../hooks/useQueueSync';
import { todayISO } from '../utils/datetime';
import { playChime } from '../utils/sound';
import { ShopStatusBadge } from '../components/shared';

const NAV = [
  { to: '/owner', end: true, icon: LayoutDashboard, label: t.owner.dashboard },
  { to: '/owner/requests', icon: ClipboardList, label: t.owner.requests },
  { to: '/owner/calendar', icon: CalendarDays, label: t.owner.calendar },
  { to: '/owner/services', icon: Scissors, label: t.owner.services },
  { to: '/owner/hours', icon: Clock3, label: t.owner.hours },
  { to: '/owner/clients', icon: Users, label: t.owner.clients },
  { to: '/owner/settings', icon: SettingsIcon, label: t.owner.settings },
];

export default function OwnerLayout() {
  const { settings, savePublic } = useSettings();
  const { user } = useAuth();
  const { latestId } = useNotifications();
  const today = todayISO();
  const lastSoundRef = useRef(null);

  // Live view of today's bookings (needed for the queue sync + badges).
  const { data: todayBookings } = useCollection(
    () => (db ? query(collection(db, COLLECTIONS.BOOKINGS), where('date', '==', today)) : null),
    [today]
  );

  // Remember the owner's uid so clients can notify him in-app (settings.public).
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || settings.ownerUid === uid) return;
    savePublic({ ownerUid: uid }).catch(() => {});
  }, [user?.uid, settings.ownerUid, savePublic]);

  // Keep the public, PII-free queue document up to date.
  useQueueSync(today, todayBookings);

  // Sound alert whenever a NEW notification arrives (e.g. a new booking).
  useEffect(() => {
    if (!latestId) return;
    if (lastSoundRef.current && lastSoundRef.current !== latestId && settings.soundAlerts !== false) {
      playChime();
    }
    lastSoundRef.current = latestId;
  }, [latestId, settings.soundAlerts]);

  const navLink = ({ isActive }) =>
    `flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-bold transition-colors ${
      isActive
        ? 'bg-gold-500/15 text-gold-300 border border-gold-500/30'
        : 'text-slate-300 hover:bg-ink-600 border border-transparent'
    }`;

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-ink-900/90 backdrop-blur border-b border-ink-500/60">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icons/icon.svg" alt="" className="w-9 h-9 rounded-xl" />
            <div className="min-w-0">
              <p className="font-extrabold text-sm truncate">{t.owner.dashboard}</p>
              <p className="text-[10px] text-gold-400 truncate">{settings.shopName || t.app.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShopStatusBadge settings={settings} size="sm" />
            <Link to="/" className="btn-ghost btn-sm">
              <Store size={14} />
              <span className="hidden sm:inline">{t.landing.bookNow}</span>
            </Link>
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="md:hidden flex gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
                  isActive ? 'bg-gold-500/15 text-gold-300' : 'bg-ink-800 text-slate-400'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="max-w-6xl mx-auto flex gap-6 px-4 py-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0">
          <nav className="card p-2 sticky top-24 flex flex-col gap-1">
            {NAV.map(({ to, icon: Icon, label, end }) => (
              <NavLink key={to} to={to} end={end} className={navLink}>
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
