/**
 * In-app notification center (bell + unread badge), driven by Firestore
 * real-time listeners so it works instantly and for free.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import t from '../i18n/ar';
import { useNotifications } from '../context/NotificationsContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { registerPushToken } from '../services/push';
import { formatRelative } from '../utils/datetime';
import { useOutsideClose } from './shared';

export default function NotificationBell() {
  const { items, unreadCount, error, markAll, markOne, retry } = useNotifications();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [registeringPush, setRegisteringPush] = useState(false);
  const menuRef = useRef(null);
  useOutsideClose(open, () => setOpen(false), menuRef);

  const enablePush = async () => {
    if (registeringPush) return;
    setRegisteringPush(true);
    try {
      const token = await registerPushToken(user.uid, {
        requestPermission: true,
        existingToken: profile?.fcmToken || '',
      });
      if (token) {
        toast(t.notifications.pushEnabled);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        toast(t.notifications.pushPermissionDenied, 'error');
      } else {
        toast(t.notifications.pushFailed, 'error');
      }
    } catch (err) {
      console.error('Failed to enable push notifications.', err);
      toast(
        typeof Notification === 'undefined' || !('serviceWorker' in navigator)
          ? t.notifications.pushUnsupported
          : t.notifications.pushFailed,
        'error'
      );
    } finally {
      setRegisteringPush(false);
    }
  };

  const markAllRead = async () => {
    try {
      await markAll();
    } catch (err) {
      console.error('Failed to mark notifications as read.', err);
      toast(t.notifications.updateFailed, 'error');
    }
  };

  const openNotification = async (notification) => {
    if (!notification.read) {
      try {
        await markOne(notification.id);
      } catch (err) {
        console.error('Failed to mark notification as read.', err);
        toast(t.notifications.updateFailed, 'error');
      }
    }
    setOpen(false);
    if (notification.bookingId) {
      const params = new URLSearchParams({
        bookingId: notification.bookingId,
        notificationId: notification.id,
      });
      navigate(`/notification?${params.toString()}`);
    }
  };

  return (
    <div ref={menuRef} className="relative">
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
          <div
            className="fixed inset-0 z-40"
            onPointerDown={() => setOpen(false)}
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)_+_4.5rem)] z-50 mx-auto flex w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden card animate-pop sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mx-0 sm:mt-2 sm:w-[86vw]"
            style={{
              maxHeight:
                'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 6rem)',
            }}
          >
            <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-ink-500/70">
              <p className="font-extrabold text-sm">{t.notifications.title}</p>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-gold-300 font-bold flex items-center gap-1 hover:text-gold-200"
                >
                  <CheckCheck size={14} />
                  {t.notifications.markAllRead}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [webkit-overflow-scrolling:touch]">
              {error ? (
                <div className="p-5 text-center">
                  <p className="text-sm text-red-300">{t.notifications.loadFailed}</p>
                  <button
                    onClick={retry}
                    className="mt-3 text-xs text-gold-300 font-bold hover:text-gold-200"
                  >
                    {t.notifications.retry}
                  </button>
                </div>
              ) : items.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">{t.notifications.empty}</p>
              ) : (
                items.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-right px-4 py-3 border-b border-ink-500/40 hover:bg-ink-600/70 transition-colors ${n.read ? 'opacity-60' : 'bg-ink-700/40'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-100">{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-gold-400 mt-1.5 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{formatRelative(n.createdAt)}</p>
                  </button>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-ink-500/70 p-2">
              <p className="px-2 pb-2 text-[10px] leading-relaxed text-slate-500">
                {t.notifications.backgroundHint}
              </p>
              <button
                onClick={enablePush}
                disabled={registeringPush}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-gold-300 hover:bg-ink-600 disabled:opacity-50"
              >
                <BellRing size={14} />
                {registeringPush
                  ? t.notifications.pushLoading
                  : profile?.fcmToken
                    ? t.notifications.refreshPush
                    : t.notifications.enablePush}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
