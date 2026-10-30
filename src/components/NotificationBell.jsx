/**
 * In-app notification center (bell + unread badge), driven by Firestore
 * real-time listeners so it works instantly and for free.
 */
import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import t from '../i18n/ar';
import { useNotifications } from '../context/NotificationsContext';
import { formatRelative } from '../utils/datetime';
import { useOutsideClose } from './shared';

export default function NotificationBell() {
  const { items, unreadCount, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  useOutsideClose(open, () => setOpen(false));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2.5 rounded-xl text-slate-300 hover:bg-ink-600 hover:text-white transition-colors"
        aria-label={t.notifications.title}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-500 text-ink-950 text-[10px] font-extrabold flex items-center justify-center animate-pop">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 mt-2 w-[86vw] max-w-sm card overflow-hidden animate-pop">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-500/70">
              <p className="font-extrabold text-sm">{t.notifications.title}</p>
              {unreadCount > 0 && (
                <button
                  onClick={markAll}
                  className="text-xs text-gold-300 font-bold flex items-center gap-1 hover:text-gold-200"
                >
                  <CheckCheck size={14} />
                  {t.notifications.markAllRead}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">{t.notifications.empty}</p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-ink-500/40 ${n.read ? 'opacity-60' : 'bg-ink-700/40'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-100">{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-gold-400 mt-1.5 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{formatRelative(n.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
