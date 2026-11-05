/**
 * Notifications context: real-time in-app notification center for the signed
 * in user (bell icon + unread badge). Push delivery is handled separately.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listenNotifications, markManyRead, markRead } from '../services/notifications';
import { useAuth } from './AuthContext';

const NotificationsCtx = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [latestId, setLatestId] = useState(null);
  const firstSnapshot = useRef(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setError(null);
    if (!user) {
      setItems([]);
      setLoading(false);
      setLatestId(null);
      firstSnapshot.current = true;
      return undefined;
    }
    setLoading(true);
    firstSnapshot.current = true;
    return listenNotifications(
      user.uid,
      (list) => {
        setItems(list);
        setLoading(false);
        // Track the newest id so the dashboard can play a sound on new items.
        const top = list[0]?.id || null;
        if (!firstSnapshot.current && top && top !== latestId) setLatestId(top);
        firstSnapshot.current = false;
      },
      60,
      (err) => {
        console.error('Failed to listen to notifications.', err);
        setError(err);
        setLoading(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, retryKey]);

  const unread = useMemo(() => items.filter((n) => !n.read), [items]);

  const markAll = useCallback(async () => {
    await markManyRead(unread.map((n) => n.id));
  }, [unread]);

  const markOne = useCallback(async (id) => {
    await markRead(id);
  }, []);

  const markBookingRead = useCallback(
    async (bookingId) => {
      if (!bookingId) return;
      const ids = items
        .filter((item) => item.bookingId === bookingId && !item.read)
        .map((item) => item.id);
      await markManyRead(ids);
    },
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      unreadCount: unread.length,
      latestId,
      markAll,
      markOne,
      markBookingRead,
      retry: () => setRetryKey((current) => current + 1),
    }),
    [items, loading, error, unread.length, latestId, markAll, markOne, markBookingRead]
  );

  return <NotificationsCtx.Provider value={value}>{children}</NotificationsCtx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsCtx);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
