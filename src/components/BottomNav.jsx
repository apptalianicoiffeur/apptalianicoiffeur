/**
 * Mobile bottom navigation (touch friendly, safe-area aware).
 */
import { NavLink } from 'react-router-dom';
import { CalendarPlus, ClipboardList, Home, LayoutDashboard } from 'lucide-react';
import t from '../i18n/ar';
import { useAuth } from '../context/AuthContext';

const items = [
  { to: '/', icon: Home, label: t.nav.home, end: true },
  { to: '/booking', icon: CalendarPlus, label: t.nav.booking },
  { to: '/bookings', icon: ClipboardList, label: t.nav.myBookings, auth: true },
];

export default function BottomNav() {
  const { user, isOwner } = useAuth();
  const visible = items.filter((i) => !i.auth || user);
  const all = isOwner
    ? [...visible, { to: '/owner', icon: LayoutDashboard, label: t.nav.dashboard }]
    : visible;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ink-800/95 backdrop-blur border-t border-ink-500/70 safe-bottom">
      <div className="flex items-stretch justify-around h-16">
        {all.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${
                isActive ? 'text-gold-300' : 'text-slate-400'
              }`
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
