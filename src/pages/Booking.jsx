/**
 * Booking page (guest or logged-in client).
 * Service -> date -> time -> details -> confirm. Double booking is prevented
 * by a Firestore transaction against the public PII-free queue document.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Scissors, ShoppingBag } from 'lucide-react';
import { doc } from 'firebase/firestore';
import t from '../i18n/ar';
import { db, COLLECTIONS } from '../services/bootstrap';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useDocument } from '../hooks/useCollection';
import { useServices } from '../hooks/useServices';
import { STATUS } from '../utils/constants';
import { addMinutes, formatDateLong, todayISO } from '../utils/datetime';
import { DEFAULT_COUNTRY_CODE, normalizePhone } from '../utils/phone';
import { dayUnbookableReason, generateSlots } from '../utils/slots';
import { queueEntriesAsBookings } from '../utils/queue';
import { createBookingWithCheck, SlotTakenError } from '../services/bookings';
import ServiceCard from '../components/ServiceCard';
import DateStrip from '../components/DateStrip';
import TimeSlotGrid from '../components/TimeSlotGrid';
import { EmptyState, ErrorState, Field, FullSpinner, StatusChip } from '../components/ui';
import { GoogleIcon, ShopStatusBadge } from '../components/shared';

export default function Booking() {
  const { settings } = useSettings();
  const { user, profile, askPhone } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: services, loading: servicesLoading, error: servicesError } = useServices();
  const [service, setService] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  // Pre-fill name/phone from the Google profile.
  useEffect(() => {
    if (profile) {
      setName((prev) => prev || profile.name || '');
      if (profile.phone) {
        setPhone(profile.phone.replace(/^\+213/, '').replace(/^0/, ''));
      }
    }
  }, [profile]);

  // Reset the time whenever service/date changes.
  useEffect(() => setTime(''), [service?.id, date]);

  // Live PII-free queue of the selected day (public document): it tells us
  // which slots are already busy without exposing other clients' bookings.
  // Real time -> slots free up instantly when someone cancels or the barber
  // rebuilds the queue.
  const { data: dailyQueue } = useDocument(
    () => (db && date ? doc(db, COLLECTIONS.DAILY_QUEUE, date) : null),
    [date]
  );
  const dayBookings = useMemo(() => queueEntriesAsBookings(dailyQueue, date), [dailyQueue, date]);

  const slots = useMemo(() => {
    if (!service) return [];
    return generateSlots({
      settings,
      iso: date,
      bookings: dayBookings,
      duration: service.estimatedMinutes || settings.slotInterval,
    });
  }, [settings, date, dayBookings, service]);

  const dayReason = dayUnbookableReason(settings, date);
  const sameDayClosed = date === todayISO() && !settings.shopOpen;

  const emptyMessage = sameDayClosed
    ? t.status.closedToday
    : dayReason === 'off'
      ? t.booking.noSlotsClosedDay
      : t.booking.noSlots;

  const validate = () => {
    const errs = {};
    if (!service) errs.service = t.validation.serviceRequired;
    if (!date || dayReason) errs.date = t.validation.dateInvalid;
    if (!time) errs.time = t.validation.timeRequired;
    if (!user) {
      if (!name.trim() || name.trim().length < 3) errs.name = t.validation.nameTooShort;
      if (!normalizePhone(phone) && !normalizePhone(`${DEFAULT_COUNTRY_CODE}${phone}`)) {
        errs.phone = t.validation.phoneInvalid;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    // A signed-in client must have a saved phone number (the security rules
    // reject bookings without one) -> ask for it instead of failing opaquely.
    const profilePhone = user ? normalizePhone(profile?.phone || '') : null;
    if (user && !profilePhone) {
      toast(t.auth.phoneNeededForBooking, 'error');
      askPhone();
      return;
    }
    setSubmitting(true);
    try {
      const phoneE164 = user
        ? profilePhone
        : normalizePhone(phone) ||
          normalizePhone(`${DEFAULT_COUNTRY_CODE}${String(phone).replace(/^0/, '')}`);
      const scheduledEnd = addMinutes(time, service.estimatedMinutes);
      const id = await createBookingWithCheck({
        userId: user?.uid || null,
        name: user ? profile?.name || user.displayName || '' : name.trim(),
        phone: phoneE164,
        serviceId: service.id,
        serviceName: service.name,
        price: Number(service.price) || 0,
        durationMinutes: Number(service.estimatedMinutes) || 30,
        date,
        scheduledStart: time,
        scheduledEnd,
        expectedStart: time,
        expectedEnd: scheduledEnd,
        actualStart: null,
        actualEnd: null,
        status: STATUS.PENDING,
        proposedDate: null,
        proposedTime: null,
        clientProposedDate: null,
        clientProposedTime: null,
        barberMessage: '',
        notes: notes.trim(),
        source: 'online',
      });
      setDone({ id, service, date, time });
      toast(t.booking.confirmTitle);
    } catch (err) {
      if (err instanceof SlotTakenError || err?.code === 'SLOT_TAKEN') {
        setErrors({ time: t.booking.slotTaken });
        setTime('');
      } else {
        toast(t.booking.bookingError, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (servicesLoading && !done) return <FullSpinner />;

  /* ------------------------- Confirmation screen ------------------------- */
  if (done) {
    return (
      <div className="max-w-lg mx-auto mt-6 animate-fade-up">
        <div className="card p-7 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center mb-4 animate-pop">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="text-xl font-black">{t.booking.confirmTitle}</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">{t.booking.confirmBody}</p>

          <div className="mt-5 text-right space-y-2.5 bg-ink-700/60 rounded-2xl p-4">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-slate-400">{t.booking.confirmService}</span>
              <span className="text-sm font-bold">{done.service?.name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-slate-400">{t.booking.confirmDateTime}</span>
              <span className="text-sm font-bold">
                {formatDateLong(done.date)} — {done.time}
              </span>
            </div>
            <div className="flex justify-between gap-3 items-center">
              <span className="text-xs text-slate-400">{t.booking.confirmStatus}</span>
              <StatusChip status={STATUS.PENDING} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {user ? (
              <button className="btn-gold" onClick={() => navigate('/bookings')}>
                {t.booking.goToMyBookings}
              </button>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                {t.booking.guestNote}
              </p>
            )}
            <button
              className="btn-outline"
              onClick={() => {
                setDone(null);
                setService(null);
                setTime('');
                setNotes('');
              }}
            >
              {t.booking.bookAnother}
            </button>
            <Link to="/" className="btn-ghost">
              {t.booking.backToHome}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Form page ------------------------------ */
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mt-5 mb-5">
        <h1 className="text-2xl font-black">{t.booking.title}</h1>
        <p className="text-sm text-slate-400 mt-1">{t.booking.subtitle}</p>
      </div>

      {/* Shop status banner */}
      <div
        className={`card p-4 mb-5 flex items-center justify-between gap-3 ${
          settings.shopOpen ? 'border-emerald-500/30' : 'border-red-500/30'
        }`}
      >
        <ShopStatusBadge settings={settings} />
        <p className="text-xs text-slate-400 text-left leading-relaxed">
          {settings.shopOpen ? t.status.openNowHint : t.status.closedToday}
        </p>
      </div>

      {servicesError && <ErrorState error={servicesError} />}

      {/* Service */}
      <section className="mb-7">
        <h2 className="section-title mb-3">
          <Scissors size={17} className="text-gold-400" />
          {t.booking.chooseService}
        </h2>
        {services.length === 0 ? (
          <EmptyState title={t.booking.noServices} />
        ) : (
          <div className="grid gap-2.5">
            {services.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                selected={service?.id === s.id}
                onSelect={(x) => {
                  setService(x);
                  setErrors((e) => ({ ...e, service: undefined }));
                }}
              />
            ))}
          </div>
        )}
        {errors.service && <p className="text-xs text-red-400 mt-2 font-semibold">{errors.service}</p>}
      </section>

      {/* Date */}
      <section className="mb-7">
        <h2 className="section-title mb-3">
          <Scissors size={17} className="text-gold-400 rotate-90" />
          {t.booking.chooseDate}
        </h2>
        <DateStrip
          settings={settings}
          value={date}
          onChange={(iso) => {
            setDate(iso);
            setErrors((e) => ({ ...e, date: undefined }));
          }}
          days={Math.min(Math.max(Number(settings.maxAdvanceDays) || 14, 3), 30)}
        />
        {errors.date && <p className="text-xs text-red-400 mt-2 font-semibold">{errors.date}</p>}
      </section>

      {/* Time */}
      <section className="mb-7">
        <h2 className="section-title mb-3">
          <ShoppingBag size={17} className="text-gold-400" />
          {t.booking.chooseTime}
        </h2>
        {service ? (
          <>
            <TimeSlotGrid
              slots={slots}
              value={time}
              emptyMessage={emptyMessage}
              onSelect={(x) => {
                setTime(x);
                setErrors((e) => ({ ...e, time: undefined }));
              }}
            />
            {errors.time && <p className="text-xs text-red-400 mt-2 font-semibold">{errors.time}</p>}
          </>
        ) : (
          <p className="text-xs text-slate-500">{t.booking.chooseService}</p>
        )}
      </section>

      {/* Details */}
      <section className="mb-7">
        <h2 className="section-title mb-3">{t.booking.yourInfo}</h2>
        {user ? (
          <div className="card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold truncate">{profile?.name || user.displayName}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.phone || user.email}</p>
            </div>
            <span className="chip bg-gold-500/10 text-gold-300 border border-gold-500/30 shrink-0">
              {t.booking.userBadge}
            </span>
          </div>
        ) : (
          <>
            <Field label={t.booking.nameLabel} error={errors.name}>
              <input
                className="input"
                value={name}
                placeholder={t.booking.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label={t.booking.phoneLabel} error={errors.phone}>
              <div className="flex gap-2" dir="ltr">
                <span className="input flex items-center justify-center w-24 bg-ink-600 font-bold text-gold-300">
                  {DEFAULT_COUNTRY_CODE}
                </span>
                <input
                  className="input flex-1"
                  inputMode="tel"
                  placeholder="5XX XX XX XX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </Field>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <GoogleIcon size={14} />
              <span>{t.auth.guestBooking}</span>
            </div>
          </>
        )}

        <div className="mt-4">
          <Field label={t.booking.notesLabel}>
            <textarea
              className="input min-h-24 resize-y"
              value={notes}
              placeholder={t.booking.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </section>

      <button
        className="btn-gold w-full text-lg py-4 sticky bottom-20 md:bottom-4"
        onClick={submit}
        disabled={submitting}
      >
        {submitting ? t.booking.submitting : t.booking.submit}
      </button>
    </div>
  );
}
