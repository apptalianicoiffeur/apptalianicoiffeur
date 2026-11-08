/**
 * Client layout: header + page content + bottom navigation + the one-time
 * phone dialog. Adds bottom padding so content is never hidden behind the nav.
 */
import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { PhoneModal } from '../components/shared';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { playChime } from '../utils/sound';

export default function ClientLayout() {
  const { user, isOwner } = useAuth();
  const { latestId } = useNotifications();
  const lastNotificationRef = useRef({ uid: null, id: null });

  useEffect(() => {
    const uid = user?.uid || null;
    const previous = lastNotificationRef.current;

    if (previous.uid !== uid || !latestId) {
      lastNotificationRef.current = { uid, id: latestId || null };
      return;
    }

    if (!isOwner && previous.id && previous.id !== latestId) playChime();
    lastNotificationRef.current = { uid, id: latestId };
  }, [user?.uid, isOwner, latestId]);

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-24 md:pb-10">
        <Outlet />
      </main>
      <BottomNav />
      <PhoneModal />
    </div>
  );
}
