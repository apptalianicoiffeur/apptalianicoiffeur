/**
 * Client layout: header + page content + bottom navigation + the one-time
 * phone dialog. Adds bottom padding so content is never hidden behind the nav.
 */
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { PhoneModal } from '../components/shared';

export default function ClientLayout() {
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
