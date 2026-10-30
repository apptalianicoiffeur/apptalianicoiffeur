/**
 * App root: providers + routes.
 *
 *  Public:      /            landing
 *               /booking     booking form (guest or client)
 *  Client:      /bookings    my bookings (sign-in required)
 *  Owner:       /owner...    protected barber dashboard
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SettingsIcon } from 'lucide-react';
import t from './i18n/ar';
import { isFirebaseConfigured } from './config/firebase';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { NotificationsProvider } from './context/NotificationsContext';
import ClientLayout from './layouts/ClientLayout';
import OwnerLayout from './layouts/OwnerLayout';
import { RequireAuth, RequireOwner } from './components/shared';
import Landing from './pages/Landing';
import Booking from './pages/Booking';
import MyBookings from './pages/MyBookings';
import NotFound from './pages/NotFound';
import Dashboard from './pages/owner/Dashboard';
import Requests from './pages/owner/Requests';
import CalendarPage from './pages/owner/CalendarPage';
import ServicesPage from './pages/owner/ServicesPage';
import HoursPage from './pages/owner/HoursPage';
import ClientsPage from './pages/owner/ClientsPage';
import SettingsPage from './pages/owner/SettingsPage';

/** Shown when the Firebase web config is missing from the environment. */
function SetupNotice() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-7 max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gold-500/10 text-gold-400 flex items-center justify-center mb-4">
          <SettingsIcon size={26} />
        </div>
        <h1 className="text-lg font-black mb-2">{t.app.setupNotice.title}</h1>
        <p className="text-sm text-slate-400 leading-relaxed">{t.app.setupNotice.body}</p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isFirebaseConfigured) return <SetupNotice />;

  return (
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>
          <NotificationsProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<ClientLayout />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/booking" element={<Booking />} />
                  <Route
                    path="/bookings"
                    element={
                      <RequireAuth>
                        <MyBookings />
                      </RequireAuth>
                    }
                  />
                </Route>

                <Route
                  path="/owner"
                  element={
                    <RequireOwner>
                      <OwnerLayout />
                    </RequireOwner>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="requests" element={<Requests />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="hours" element={<HoursPage />} />
                  <Route path="clients" element={<ClientsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </NotificationsProvider>
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
