/**
 * Client header: logo, live shop status, desktop nav links, notification bell
 * and the account menu.
 */
import { useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  ClipboardList,
  LayoutDashboard,
  Link2,
  LogIn,
  LogOut,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { AuthModal, ShopStatusBadge, useOutsideClose } from './shared';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
    isActive ? 'bg-gold-500/15 text-gold-300' : 'text-slate-300 hover:bg-ink-600 hover:text-white'
  }`;

function UserMenu({ onLinkPassword }) {
  const { user, profile, isOwner, signingIn, linkGoogle, signOut } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useOutsideClose(open, () => setOpen(false), menuRef);
  const initial = (profile?.name || user?.displayName || user?.email || '?').trim().charAt(0);
  const hasPassword = user?.providerData.some((provider) => provider.providerId === 'password');
  const hasGoogle = user?.providerData.some((provider) => provider.providerId === 'google.com');

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950 font-extrabold flex items-center justify-center"
        aria-label={t.nav.profile}
      >
        {initial.toUpperCase()}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={() => setOpen(false)}
            onClick={() => setOpen(false)}
          />
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
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-200 hover:bg-ink-600"
              >
                <UserRound size={16} />
                {t.nav.profileSettings}
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
              {user?.email && !hasPassword && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onLinkPassword();
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-200 hover:bg-ink-600"
                >
                  <LockKeyhole size={16} />
                  {t.auth.linkPasswordAction}
                </button>
              )}
              {user?.email && !hasGoogle && (
                <button
                  disabled={signingIn}
                  onClick={async () => {
                    const result = await linkGoogle();
                    if (result.ok) toast(t.auth.googleLinked);
                    else toast(result.error, 'error');
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-200 hover:bg-ink-600 disabled:opacity-40"
                >
                  <Link2 size={16} />
                  {t.auth.linkGoogleAction}
                </button>
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');

  const openPasswordLink = () => {
    setAuthMode('link');
    setAuthOpen(true);
  };

  return (
    <>
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
            <NavLink to="/track" className={linkClass}>
              {t.nav.trackBooking}
            </NavLink>
            {user && (
              <NavLink to="/bookings" className={linkClass}>
                {t.nav.myBookings}
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <div className="hidden sm:block">
              <ShopStatusBadge settings={settings} size="sm" />
            </div>
            {user && <NotificationBell />}
            {user ? (
              <UserMenu onLinkPassword={openPasswordLink} />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthOpen(true);
                }}
                className="btn-outline btn-sm shrink-0"
              >
                <LogIn size={15} />
                {t.nav.signIn}
              </button>
            )}
          </div>
        </div>
      </header>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </>
  );
}
