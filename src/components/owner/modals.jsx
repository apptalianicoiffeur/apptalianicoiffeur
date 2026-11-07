/**
 * Owner modals: accept-with-modified-time, decline, and quick walk-in booking.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { Star, UserRound } from 'lucide-react';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useCollection } from '../../hooks/useCollection';
import { formatDateLong, todayISO } from '../../utils/datetime';
import { normalizePhone, nationalPart, DEFAULT_COUNTRY_CODE } from '../../utils/phone';
import { generateSlots } from '../../utils/slots';
import { usePrayerBreaks } from '../../hooks/usePrayerBreaks';
import { fillTemplate, templateVars } from '../../utils/whatsapp';
import DateStrip from '../DateStrip';
import TimeSlotGrid from '../TimeSlotGrid';
import { Field, Modal, Spinner } from '../ui';
import ServiceCard from '../ServiceCard';

/** Bookings of one date (used to compute free slots inside modals). */
export function useDayBookings(iso, enabled = true) {
  return useCollection(
    () => (enabled && db && iso ? query(collection(db, COLLECTIONS.BOOKINGS), where('date', '==', iso)) : null),
    [iso, enabled]
  );
}

/** 2) Accept with a modified date/time (the client must then confirm). */
export function ModifiedTimeModal({ open, onClose, booking, settings, onConfirm }) {
  const [date, setDate] = useState(
    booking?.clientProposedDate || booking?.proposedDate || booking?.date || todayISO()
  );
  const [time, setTime] = useState(booking?.clientProposedTime || booking?.proposedTime || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: dayBookings, loading } = useDayBookings(date, open);
  const { windows: prayerBreaks, loading: prayerLoading, error: prayerError } = usePrayerBreaks(settings, date, open);

  useEffect(() => {
    if (open) {
      setDate(booking?.clientProposedDate || booking?.proposedDate || booking?.date || todayISO());
      setTime(booking?.clientProposedTime || booking?.proposedTime || '');
      setNote('');
    }
    // Reset only when the modal opens (or for a different booking): Firestore
    // snapshots deliver a fresh `booking` object on every change and would
    // otherwise wipe what the owner is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, booking?.id]);

  const slots = useMemo(
    () =>
      open && !prayerLoading && !prayerError
        ? generateSlots({
            settings,
            iso: date,
            bookings: dayBookings,
            duration: booking?.durationMinutes || 30,
            ignoreBookingId: booking?.id,
            prayerBreaks: prayerBreaks[date] || [],
          })
        : [],
    [open, settings, date, dayBookings, booking, prayerBreaks, prayerLoading, prayerError]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.modifyTitle}
      wide
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-gold flex-1"
            disabled={!time || busy || prayerLoading || Boolean(prayerError)}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ date, time, note: note.trim() });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={16} /> : t.app.confirm}
          </button>
        </div>
      }
    >
      <div className="mb-3 bg-ink-700/60 rounded-xl p-3 flex items-center justify-between">
        <span className="text-xs text-slate-400">{t.owner.originalWillBe}</span>
        <span className="text-sm font-bold">
          {formatDateLong(booking?.date)} — {booking?.scheduledStart}
        </span>
      </div>

      <p className="label">{t.owner.modifyDate}</p>
      <DateStrip settings={settings} value={date} onChange={(iso) => { setDate(iso); setTime(''); }} days={21} />

      <p className="label mt-4">{t.owner.modifyTime}</p>
      {prayerError && <p className="text-xs text-red-400 mb-2 font-semibold">{t.owner.prayerTimesError}</p>}
      <TimeSlotGrid slots={slots} value={time} onSelect={setTime} loading={loading || prayerLoading} />

      <div className="mt-4">
        <Field label={t.owner.modifyNote}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** 3) Decline with an optional reason (shown to the client). */
export function DeclineModal({ open, onClose, booking, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.decline}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-danger flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={16} /> : t.owner.decline}
          </button>
        </div>
      }
    >
      <Field label={t.owner.declineReason}>
        <textarea
          className="input min-h-24"
          value={reason}
          placeholder={t.owner.declineReasonPlaceholder}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/** Quick add a walk-in / phone client into a free slot. */
export function WalkInModal({ open, onClose, date, services, settings, prefillTime, onConfirm }) {
  const { favoriteCustomers, saveFavoriteCustomer } = useSettings();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState(null);
  const [time, setTime] = useState(prefillTime || '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [selectedFavorite, setSelectedFavorite] = useState('');
  const { data: dayBookings, loading } = useDayBookings(date, open);
  const { windows: prayerBreaks, loading: prayerLoading, error: prayerError } = usePrayerBreaks(settings, date, open);

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('');
      setService(services?.[0] || null);
      setTime(prefillTime || '');
      setErrors({});
      setSelectedFavorite('');
    }
    // Reset only on the open transition: `services` is a new array on every
    // snapshot and would clear the form while the owner is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillTime]);

  const slots = useMemo(
    () =>
      open && service && !prayerLoading && !prayerError
        ? generateSlots({
            settings,
            iso: date,
            bookings: dayBookings,
            duration: service.estimatedMinutes || 30,
            prayerBreaks: prayerBreaks[date] || [],
          })
        : [],
    [open, service, settings, date, dayBookings, prayerBreaks, prayerLoading, prayerError]
  );

  const submit = async () => {
    const errs = {};
    if (!name.trim() || name.trim().length < 3) errs.name = t.validation.nameTooShort;
    const p = normalizePhone(phone) || normalizePhone(`${DEFAULT_COUNTRY_CODE}${phone}`);
    if (!p) errs.phone = t.validation.phoneInvalid;
    if (!service) errs.service = t.validation.serviceRequired;
    if (!time) errs.time = t.validation.timeRequired;
    else if (!slots.some((slot) => slot.time === time && slot.available)) errs.time = t.booking.slotUnavailable;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await onConfirm({
        name: name.trim(),
        phone: p,
        service,
        time,
        notifyCustomer: Boolean(selectedFavorite && selectedFavorite === p),
      });
    } finally {
      setBusy(false);
    }
  };

  const normalizedPhone = normalizePhone(phone) || normalizePhone(`${DEFAULT_COUNTRY_CODE}${phone}`);
  const isFavorite =
    selectedFavorite === normalizedPhone &&
    favoriteCustomers.some((customer) => customer.phone === normalizedPhone);

  const addFavorite = async () => {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length < 3) {
      setErrors((current) => ({ ...current, name: t.validation.nameTooShort }));
      return;
    }
    if (!normalizedPhone) {
      setErrors((current) => ({ ...current, phone: t.validation.phoneInvalid }));
      return;
    }

    setSavingFavorite(true);
    try {
      await saveFavoriteCustomer({ name: normalizedName, phone: normalizedPhone });
      setSelectedFavorite(normalizedPhone);
      toast(t.owner.favoriteAdded);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setSavingFavorite(false);
    }
  };

  const selectFavorite = (value) => {
    setSelectedFavorite(value);
    const customer = favoriteCustomers.find((item) => item.phone === value);
    if (!customer) return;
    setName(customer.name);
    setPhone(nationalPart(customer.phone));
    setErrors((current) => ({ ...current, name: undefined, phone: undefined }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.walkInTitle}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-gold flex-1"
            disabled={busy || prayerLoading || Boolean(prayerError)}
            onClick={submit}
          >
            {busy ? <Spinner size={16} /> : t.app.save}
          </button>
        </div>
      }
    >
      {favoriteCustomers.length > 0 && (
        <Field label={t.owner.favoriteCustomers}>
          <select className="input" value={selectedFavorite} onChange={(event) => selectFavorite(event.target.value)}>
            <option value="">{t.owner.chooseFavorite}</option>
            {favoriteCustomers.map((customer) => (
              <option key={customer.phone} value={customer.phone}>
                {customer.name} — {customer.phone}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={t.owner.manualName} error={errors.name}>
        <input
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSelectedFavorite('');
          }}
        />
      </Field>
      <Field label={t.owner.manualPhone} error={errors.phone}>
        <div className="flex gap-2" dir="ltr">
          <span className="input flex items-center justify-center w-24 bg-ink-600 font-bold text-gold-300">
            {DEFAULT_COUNTRY_CODE}
          </span>
          <input
            className="input flex-1"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSelectedFavorite('');
            }}
          />
        </div>
      </Field>
      <button
        type="button"
        className={`btn-outline btn-sm w-full mb-4 ${isFavorite ? 'text-gold-300' : ''}`}
        onClick={addFavorite}
        disabled={savingFavorite || isFavorite}
      >
        {savingFavorite ? <Spinner size={14} /> : isFavorite ? <Star size={14} fill="currentColor" /> : <UserRound size={14} />}
        {isFavorite ? t.owner.favoriteSaved : t.owner.saveFavorite}
      </button>

      <p className="label">{t.owner.manualService}</p>
      <div className="grid gap-2 mb-2 max-h-56 overflow-y-auto">
        {(services || []).map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            compact
            selected={service?.id === s.id}
            onSelect={setService}
          />
        ))}
      </div>
      {errors.service && <p className="text-xs text-red-400 mb-2 font-semibold">{errors.service}</p>}

      <p className="label">{t.owner.manualTime}</p>
      {service ? (
        <>
          {prayerError && <p className="text-xs text-red-400 mb-2 font-semibold">{t.owner.prayerTimesError}</p>}
          <TimeSlotGrid slots={slots} value={time} onSelect={setTime} loading={loading || prayerLoading} />
        </>
      ) : (
        <p className="text-xs text-slate-500">{t.booking.chooseService}</p>
      )}
      {errors.time && <p className="text-xs text-red-400 mt-2 font-semibold">{errors.time}</p>}
    </Modal>
  );
}

/** Preview of a WhatsApp message with the current template. */
export function WhatsAppPreview({ template, booking, settings }) {
  const text = fillTemplate(template, {
    ...templateVars(booking, settings),
    date: formatDateLong(booking?.date),
    new_date: booking?.proposedDate ? formatDateLong(booking.proposedDate) : '',
  });
  return (
    <div className="bg-[#075E54]/20 border border-emerald-500/30 rounded-2xl p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
      {text}
    </div>
  );
}
