/**
 * Client header: logo, live shop status, desktop nav links, notification bell
 * and the account menu.
 */
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, LogOut } from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { GoogleSignInButton, ShopStatusBadge, useOutsideClose } from './shared';
import NotificationBell from './NotificationBell';

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
    isActive ? 'bg-gold-500/15 text-gold-300' : 'text-slate-300 hover:bg-ink-600 hover:text-white'
  }`;

function UserMenu() {
  const { user, profile, isOwner, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  useOutsideClose(open, () => setOpen(false));
  const initial = (profile?.name || user?.displayName || user?.email || '?').trim().charAt(0);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 font-extrabold flex items-center justify-center"
        aria-label={t.nav.profile}
      >
        {initial.toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 mt-2 w-64 card overflow-hidden animate-pop">
            <div className="px-4 py-3 border-b border-ink-500/70">
              <p className="text-sm font-extrabold text-slate-100 truncate">
                {profile?.name || user?.displayName || '—'}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <div className="p-2 flex flex-col">
              <Link
                to="/bookings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-200 hover:bg-ink-600"
              >
                <ClipboardList size={16} />
                {t.nav.myBookings}
              </Link>
              {isOwner && (
                <Link
                  to="/owner"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-gold-300 hover:bg-gold-500/10"
                >
                  <LayoutDashboard size={16} />
                  {t.nav.ownerArea}
                </Link>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-red-300 hover:bg-red-500/10"
              >
                <LogOut size={16} />
                {t.nav.signOut}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const { settings } = useSettings();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-ink-900/85 backdrop-blur border-b border-ink-500/60">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <img src="/icons/icon.svg" alt="" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="min-w-0">
            <p className="font-extrabold leading-tight truncate">{t.app.name}</p>
            <p className="text-[10px] text-gold-400 font-semibold truncate">{t.app.tagline}</p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/booking" className={linkClass}>
            {t.nav.booking}
          </NavLink>
          {user && (
            <NavLink to="/bookings" className={linkClass}>
              {t.nav.myBookings}
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <ShopStatusBadge settings={settings} size="sm" />
          </div>
          {user && <NotificationBell />}
          {user ? <UserMenu /> : <GoogleSignInButton compact className="hidden sm:inline-flex" />}
          {!user && (
            <Link to="/booking" className="btn-gold btn-sm sm:hidden" aria-label={t.nav.booking}>
              {t.nav.booking}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
